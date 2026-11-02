import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSquarePayment, squarePaymentSnapshot } from '@/lib/payments/square';

export async function POST(request: Request) {
  const access = await capabilityApiClient(['finance.manage', 'payments.reconcile']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const body = z
    .object({ paymentId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid payment.' }, { status: 400 });
  const { data: payment, error } = await access.supabase
    .from('payments')
    .select('id,order_id,provider,status,provider_reference,amount,currency,provider_payload')
    .eq('id', body.data.paymentId)
    .maybeSingle();
  if (
    error ||
    !payment ||
    payment.provider !== 'square' ||
    payment.status !== 'SUCCEEDED' ||
    !payment.provider_reference
  )
    return NextResponse.json({ error: 'A completed Square payment is required.' }, { status: 409 });
  try {
    // Read-only GetPayment. This endpoint can neither charge nor transfer funds.
    const provider = await getSquarePayment(payment.provider_reference);
    if (
      provider.status !== 'COMPLETED' ||
      provider.reference_id !== payment.id ||
      provider.amount_money?.currency !== payment.currency ||
      provider.amount_money.amount !== Math.round(Number(payment.amount) * 100)
    )
      throw new Error('Mismatch');
    const admin = createAdminClient();
    const result = await admin.rpc('finance_import_square_snapshot', {
      target_payment_id: payment.id,
      target_actor: access.user.id,
      target_snapshot: squarePaymentSnapshot(provider),
    });
    if (result.error) throw result.error;
    return NextResponse.json(
      { recorded: true, feesAvailable: provider.processing_fee !== undefined },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Square fees could not be verified. No payment or transfer was initiated.' },
      { status: 503 }
    );
  }
}
