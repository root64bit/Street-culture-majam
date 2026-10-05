import { NextResponse } from 'next/server';
import { z } from 'zod';

const requestSchema = z.object({
  order_id: z.string().uuid(),
  source_id: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid card payment request.' }, { status: 400 });
  }

  const message =
    process.env.SQUARE_PAYMENTS_ENABLED === 'true'
      ? 'Square is not connected to a verified order service yet. No payment was attempted.'
      : 'Card payments are not enabled for this store.';
  return NextResponse.json({ error: message }, { status: 503 });
}
