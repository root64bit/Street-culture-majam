import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { shippingDestinationSchema } from '@/lib/shipping/destination';
import { addressProblems } from '@/lib/shipping/address';
import { courierParcelSchema } from '@/lib/shipping/schemas';
import { safeCourierTrackingUrl } from '@/lib/shipping/tracking';
const address = shippingDestinationSchema
  .extend({
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,25}$/),
    email: z.string().email().optional().or(z.literal('')),
    delivery_notes: z.string().max(500).optional(),
  })
  .refine((a) => !addressProblems(a).length, 'Confirm complete valid addresses');
const base = { revision: z.number().int().positive(), note: z.string().trim().min(10).max(1000) };
const schema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('RESOLVE_EXCEPTION'),
    ...base,
    resume_state: z.enum(['BOOKED', 'COLLECTED']),
    evidence_reference: z.string().trim().min(3).max(160),
    max_cost_mzn: z.number().finite().nonnegative().max(99999999),
  }),
  z.object({ operation: z.literal('PREPARE'), ship_approved: z.literal(true), note: base.note }),
  z.object({
    operation: z.literal('SAVE'),
    ...base,
    address,
    origin: address,
    parcels: z.array(courierParcelSchema).min(1).max(10),
    address_confirmed: z.literal(true),
    origin_confirmed: z.literal(true),
    packed_confirmed: z.literal(true),
  }),
  z.object({
    operation: z.literal('APPROVE'),
    ...base,
    max_cost_mzn: z.number().finite().nonnegative().max(99999999),
  }),
  z.object({
    operation: z.literal('IMPORT_BOOKING'),
    ...base,
    cost_confirmed: z.literal(true),
    provider_reference: z.string().trim().min(3).max(128),
    document_reference: z.string().trim().min(3).max(160),
    tracking_url: z.string().refine((v) => !v || Boolean(safeCourierTrackingUrl(v))),
    courier_cost: z.number().finite().nonnegative().max(99999999),
    courier_currency: z.enum(['MZN', 'ZAR', 'GBP', 'USD', 'EUR']),
    courier_mzn_per_unit: z.number().positive().finite(),
  }),
  z.object({
    operation: z.enum(['COLLECTED', 'DELIVERED', 'EXCEPTION']),
    ...base,
    evidence_reference: z.string().trim().min(3).max(160),
  }),
]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'Invalid order.' }, { status: 400 });
  const access = await capabilityApiClient(['shipping.prepare']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      {
        error: 'Check the shipment fields, evidence, address confirmation and parcel measurements.',
      },
      { status: 400 }
    );
  const { operation, ...payload } = body.data;
  const result = await access.supabase.rpc('fulfillment_operate', {
    target_order_id: id,
    operation,
    payload,
  });
  if (result.error)
    return NextResponse.json(
      {
        error:
          'This shipment cannot move to that step. Check payment holds, packing, permissions and the latest revision.',
      },
      { status: 409 }
    );
  return NextResponse.json(result.data, { headers: { 'Cache-Control': 'no-store' } });
}
