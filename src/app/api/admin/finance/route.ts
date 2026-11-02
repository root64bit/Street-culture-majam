import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { moneyMinor } from '@/lib/money';

const currency = z.enum(['MZN', 'GBP', 'ZAR', 'USD', 'EUR']);
const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(999999999)
  .refine((v) => {
    try {
      moneyMinor(v);
      return true;
    } catch {
      return false;
    }
  }, 'Use at most two decimals');
const reference = z.string().trim().min(3).max(160);
const requestId = z.string().uuid();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)));
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('SETTLE'),
    entry_id: z.string().uuid(),
    method: z.enum(['PAID', 'DEDUCTED']),
    paid_on: date,
    reference,
  }),
  z.object({
    action: z.literal('COST'),
    request_id: requestId,
    order_id: z.string().uuid().nullable(),
    kind: z.enum([
      'COGS',
      'COURIER',
      'PAYMENT_FEE',
      'PACKAGING',
      'OTHER_DIRECT',
      'OVERHEAD',
      'TRANSFER_FEE',
      'INCOME_TAX',
    ]),
    amount: money,
    currency,
    mzn_per_unit: z.coerce.number().finite().positive().max(1000000),
    basis: z.enum(['ACTUAL', 'ESTIMATE']),
    reference,
    incurred_on: date,
  }),
  z.object({
    action: z.literal('REVERSE'),
    request_id: requestId,
    entry_id: z.string().uuid(),
    reference,
  }),
  z.object({
    action: z.literal('REVIEW'),
    order_id: z.string().uuid(),
    costs_complete: z.boolean(),
    sales_tax_mzn: money,
    note: z.string().trim().min(10).max(1000),
  }),
  z.object({
    action: z.literal('BALANCE'),
    request_id: requestId,
    provider: z.enum(['square', 'bank']),
    amount: money,
    currency,
    observed_at: z.string().datetime({ offset: true }),
    reference,
  }),
]);
export async function POST(request: Request) {
  const access = await capabilityApiClient(['finance.manage']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: 'Check the finance fields, amount, currency and reference.' },
      { status: 400 }
    );
  const { action, ...payload } = body.data;
  const { error } = await access.supabase.rpc('finance_record', { action, payload });
  if (error)
    return NextResponse.json(
      {
        error:
          'Finance entry was not recorded. Check its scope, currency, date and duplicate reference.',
      },
      { status: 409 }
    );
  return NextResponse.json({ recorded: true }, { headers: { 'Cache-Control': 'no-store' } });
}
