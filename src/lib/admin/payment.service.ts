import 'server-only';
import { MpesaGateway } from '@/lib/payments/gateways';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database.types';

export async function reconcilePayment(id: string, operatorId: string | null) {
  const admin = createAdminClient();
  const payment = await admin
    .from('payments')
    .select('id,provider,status,provider_reference,provider_payload')
    .eq('id', id)
    .maybeSingle();
  if (
    payment.error ||
    !payment.data ||
    payment.data.provider !== 'mpesa' ||
    payment.data.status === 'REFUNDED'
  )
    throw new Error('Payment is not eligible for reconciliation.');
  const payload = payment.data.provider_payload;
  const metadata: Record<string, Json | undefined> =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const reference =
    payment.data.provider_reference ??
    (typeof metadata.thirdPartyRef === 'string' ? metadata.thirdPartyRef : null);
  if (!reference) throw new Error('Provider reference is missing.');
  const result = await new MpesaGateway().getPayment(reference);
  const recorded = await admin.rpc('record_provider_reconciliation', {
    target_payment_id: id,
    operator_id: operatorId as unknown as string,
    provider_status: result.status,
  });
  if (recorded.error) throw new Error('Provider result requires local reconciliation review.');
  return recorded.data;
}
