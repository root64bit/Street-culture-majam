import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { savedAddressDetailsSchema } from '@/lib/checkout-addresses';
import { hasSameRequestOrigin } from '@/lib/request-origin';
const base = { id: z.string().uuid(), revision: z.number().int().min(0) };
const schema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('SAVE'),
    ...base,
    label: z.string().trim().min(1).max(50),
    is_default: z.boolean(),
    details: savedAddressDetailsSchema,
  }),
  z.object({ operation: z.literal('DEFAULT'), ...base }),
  z.object({ operation: z.literal('DELETE'), ...base }),
]);
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!hasSameRequestOrigin(request))
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
  if (Number(request.headers.get('content-length') || 0) > 16384)
    return new Response(null, { status: 413, headers });
  const db = await createClient(),
    {
      data: { user },
      error,
    } = await db.auth.getUser();
  if (error || !user)
    return NextResponse.json(
      { error: 'Sign in to save delivery addresses.' },
      { status: 401, headers }
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Check the address and contact details before saving.' },
      { status: 400, headers }
    );
  const { operation, ...payload } = parsed.data;
  try {
    const result = await db.rpc('customer_address_operate', { operation, payload });
    if (result.error)
      return NextResponse.json(
        {
          error:
            'This address could not be saved. It may have changed, or your address book may be full. Refresh and try again.',
        },
        { status: 409, headers }
      );
    return NextResponse.json({ address: result.data }, { headers });
  } catch {
    return NextResponse.json(
      { error: 'The address book is temporarily unavailable.' },
      { status: 503, headers }
    );
  }
}
