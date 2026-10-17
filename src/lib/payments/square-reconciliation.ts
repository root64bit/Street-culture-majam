import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationProvider } from '@/lib/notifications/service';
import { findSquarePayment, getSquarePayment, squarePaymentSnapshot } from './square';

export async function reconcileSquarePayment(paymentId: string) {
  const admin = createAdminClient();
  const { data: payment, error } = await admin
    .from('payments')
    .select(
      'id, order_id, status, amount, currency, provider_reference, provider_payload, created_at'
    )
    .eq('id', paymentId)
    .eq('provider', 'square')
    .single();
  if (error || !payment) throw new Error('Square payment record is unavailable.');
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, status, order_number')
    .eq('id', payment.order_id)
    .single();
  if (orderError || !order) throw new Error('Square order is unavailable.');
  const paidResult = (fulfillable: boolean) => ({
    status: 'PAID',
    orderStatus: fulfillable ? 'CONFIRMED' : order.status,
    orderNumber: order.order_number,
    fulfillable,
  });
  if (payment.status === 'SUCCEEDED') return paidResult(order.status === 'CONFIRMED');
  if (payment.status === 'FAILED') return { status: 'FAILED', orderNumber: order.order_number };
  if (payment.status === 'PENDING' || payment.status === 'REFUNDED') {
    return { status: payment.status, orderNumber: order.order_number };
  }
  const provider = payment.provider_reference
    ? await getSquarePayment(payment.provider_reference)
    : await findSquarePayment(payment.id, payment.created_at);
  const pending = { status: 'PROCESSING', orderNumber: order.order_number };
  if (!provider) {
    const needsReview = Date.now() - Date.parse(payment.created_at) > 5 * 60_000;
    await admin
      .from('payments')
      .update({
        last_reconciled_at: new Date().toISOString(),
        last_provider_status: 'UNKNOWN',
        reconciliation_needs_review: needsReview,
      })
      .eq('id', payment.id);
    return pending;
  }
  const matches =
    provider.amount_money?.amount === Math.round(Number(payment.amount) * 100) &&
    provider.amount_money?.currency === payment.currency &&
    provider.reference_id === payment.id;
  const snapshot = squarePaymentSnapshot(provider);
  const { error: updateError } = await admin
    .from('payments')
    .update({
      provider_reference: provider.id,
      provider_payload: {
        ...(payment.provider_payload &&
        typeof payment.provider_payload === 'object' &&
        !Array.isArray(payment.provider_payload)
          ? payment.provider_payload
          : {}),
        square: snapshot,
      },
      last_provider_status: provider.status,
      last_reconciled_at: new Date().toISOString(),
      reconciliation_needs_review: !matches,
    })
    .eq('id', payment.id);
  if (updateError) throw new Error('Square result could not be recorded.');
  if (!matches) return pending;
  if (provider.status === 'COMPLETED') {
    const { data: canFulfill, error: completionError } = await admin.rpc(
      'complete_square_checkout_payment',
      { target_payment_id: payment.id }
    );
    if (completionError) throw new Error('Square payment confirmation is processing.');
    await notificationProvider.dispatch({
      kind: canFulfill ? 'ORDER_CONFIRMED' : 'PAYMENT_CONFIRMED',
      recordId: order.id,
    });
    return { ...paidResult(canFulfill === true), receiptUrl: snapshot.receiptUrl };
  }
  if (provider.status === 'FAILED' || provider.status === 'CANCELED') {
    const { error: failureError } = await admin.rpc('fail_square_checkout_payment', {
      target_payment_id: payment.id,
    });
    if (failureError) throw new Error('Square payment result is processing.');
    return { status: 'FAILED', orderNumber: order.order_number };
  }
  return pending;
}
