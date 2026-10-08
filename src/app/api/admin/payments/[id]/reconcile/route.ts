import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { reconcilePayment } from '@/lib/admin/payment.service';
import { adminFailure } from '@/lib/admin/errors';

export const maxDuration = 30;
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return adminFailure('VALIDATION', 'Invalid payment ID.');
  const access = await capabilityApiClient(['payments.reconcile']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  try {
    const result = await reconcilePayment(id, access.user.id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error(
      JSON.stringify({ event: 'payment_reconciliation_failed', paymentId: id, source: 'operator' })
    );
    return adminFailure(
      'PROVIDER_UNAVAILABLE',
      'MineScope did not return a reliable result, or the payment is not eligible. Payment state remains unchanged; review its reference and retry.',
      503
    );
  }
}
