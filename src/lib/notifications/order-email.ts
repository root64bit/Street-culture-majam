import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database.types';
import { sendEmail, emailIsConfigured, emailOperationStatus } from '@/lib/communications/email';
import { orderEmail, type OrderEmailDesign } from '@/lib/communications/order-template';
import { formatOrderMoney } from '@/lib/commerce/order-money';
import { formatProductSize } from '@/lib/product-sizes';
import { addressLines } from '@/lib/shipping/address';

export const ORDER_ADMIN_EMAIL = 'support@streetculturevault.com';
export type OrderEmailChannel = 'CUSTOMER_EMAIL' | 'ADMIN_EMAIL';
export const orderEmailEnabled = () =>
  process.env.ORDER_EMAILS_ENABLED === 'true' && process.env.SC_EXTERNAL_SERVICES !== 'disabled';
const object = (value: Json): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export async function sendNextOrderEmail(
  db: SupabaseClient<Database>,
  sender = sendEmail,
  channel: OrderEmailChannel = 'CUSTOMER_EMAIL'
) {
  if (!orderEmailEnabled()) return { skipped: true };
  if (!emailIsConfigured()) throw new Error('Order email sender is not configured');
  const claim = await db.rpc('claim_order_message', { target_channel: channel });
  if (claim.error) throw new Error('Email queue unavailable');
  const message = claim.data?.[0];
  if (!message) return { empty: true };
  if (!message.lease_token) throw new Error('Email lease is missing');
  const finish = async (outcome: 'ACCEPTED' | 'UNKNOWN' | 'SKIPPED', providerId?: string) => {
    const result = await db.rpc('finish_order_message', {
      target_id: message.id,
      target_lease: message.lease_token!,
      outcome,
      provider_id: providerId,
    });
    if (result.error || result.data !== true)
      throw new Error('Notification recording needs review; do not resend');
  };
  const [orderResult, itemsResult, paymentsResult] = await Promise.all([
    db
      .from('orders')
      .select(
        'id,order_number,guest_name,guest_email,status,payment_status,total_amount,subtotal,shipping_amount,currency,shipping_address_snapshot,shipping_method_snapshot'
      )
      .eq('id', message.order_id)
      .single(),
    db
      .from('order_items')
      .select('product_name_snapshot,size_snapshot,quantity,unit_price')
      .eq('order_id', message.order_id),
    db
      .from('payments')
      .select('amount,currency,provider')
      .eq('order_id', message.order_id)
      .eq('status', 'SUCCEEDED'),
  ]);
  // A read failure occurs before the provider call. The expired lease becomes
  // UNKNOWN for review rather than risk a resend after an ambiguous worker crash.
  if (orderResult.error || itemsResult.error || paymentsResult.error)
    throw new Error('Order details unavailable');
  const order = orderResult.data;
  const isAdmin = channel === 'ADMIN_EMAIL';
  const recipient = isAdmin ? ORDER_ADMIN_EMAIL : order.guest_email;
  if (
    !recipient ||
    order.payment_status !== 'PAID' ||
    ['CANCELLED', 'REFUNDED'].includes(order.status) ||
    (isAdmin && message.kind !== 'ADMIN_NEW_ORDER') ||
    (!isAdmin && message.kind === 'ADMIN_NEW_ORDER') ||
    (message.kind === 'ORDER_SHIPPED' && !['SHIPPED', 'DELIVERED'].includes(order.status)) ||
    (message.kind === 'ORDER_DELIVERED' && order.status !== 'DELIVERED')
  ) {
    await finish('SKIPPED');
    return { skipped: true };
  }
  const title = isAdmin
    ? 'New paid order — action required'
    : message.kind === 'ORDER_SHIPPED'
      ? 'Your parcel was handed to the courier'
      : message.kind === 'ORDER_DELIVERED'
        ? 'Your delivery is confirmed'
        : 'Your order is confirmed';
  const address = object(order.shipping_address_snapshot);
  const method = object(order.shipping_method_snapshot);
  const paid = paymentsResult.data.map(
    (payment) =>
      `${formatOrderMoney(Number(payment.amount), payment.currency)} (${payment.provider === 'square' ? 'Square' : 'M-Pesa'})`
  );
  const body = orderEmail({
    audience: isAdmin ? 'admin' : 'customer',
    kind: message.kind as OrderEmailDesign['kind'],
    orderNumber: order.order_number,
    orderUrl: `https://www.streetculturevault.com/${isAdmin ? `admin/orders/${order.id}` : `order/${order.order_number}`}`,
    customerName: order.guest_name || undefined,
    items: itemsResult.data.map((item) => ({
      name: item.product_name_snapshot,
      size: formatProductSize(item.size_snapshot),
      quantity: item.quantity,
      price: formatOrderMoney(Number(item.unit_price) * item.quantity, order.currency),
    })),
    subtotal: formatOrderMoney(Number(order.subtotal), order.currency),
    delivery: formatOrderMoney(Number(order.shipping_amount), order.currency),
    total: formatOrderMoney(Number(order.total_amount), order.currency),
    payments: paid,
    service: typeof method.name === 'string' ? method.name : 'As selected at checkout',
    address: addressLines(address),
  });
  let operationId: string;
  try {
    operationId = await sender({
      to: recipient,
      subject: `${isAdmin ? 'New paid order' : title} — ${order.order_number}`,
      ...body,
      category: 'transactional',
    });
  } catch {
    await finish('UNKNOWN');
    return { uncertain: true };
  }
  await finish('ACCEPTED', operationId);
  return { accepted: true };
}

export async function reconcileNextOrderEmail(
  db: SupabaseClient<Database>,
  channel: OrderEmailChannel,
  lookup = emailOperationStatus
) {
  if (!orderEmailEnabled()) return { skipped: true };
  const claim = await db.rpc('claim_order_message_receipt', { target_channel: channel });
  if (claim.error) throw new Error('Receipt queue unavailable');
  const message = claim.data?.[0];
  if (!message) return { empty: true };
  if (!message.lease_token || !message.operation_id) throw new Error('Missing receipt reference');
  let outcome: 'ACCEPTED' | 'DELIVERED' | 'UNDELIVERED' | 'FAILED' | 'UNKNOWN' = 'ACCEPTED';
  let providerStatus = 'LOOKUP_PENDING';
  // Twilio retains operation records for seven days. An unknown receipt never
  // goes back into the send queue.
  if (Date.now() - Date.parse(message.claimed_at || message.created_at) > 6.5 * 86400000) {
    outcome = 'UNKNOWN';
    providerStatus = 'RECEIPT_EXPIRED';
  } else {
    try {
      const status = await lookup(message.operation_id);
      outcome = status.outcome;
      providerStatus = status.providerStatus;
    } catch {
      /* GET can safely be retried; never repeat the POST. */
    }
  }
  const saved = await db.rpc('record_order_message_receipt', {
    target_id: message.id,
    target_lease: message.lease_token,
    outcome,
    target_provider_status: providerStatus,
  });
  if (saved.error || saved.data !== true) throw new Error('Receipt recording needs review');
  return { outcome };
}
