import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  country: z.literal('MZ'),
  province: z.string().trim().min(2).max(100),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a Mozambique province to see delivery options.' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('shipping_methods')
      .select('code, name, price, currency, estimated_min_days, estimated_max_days, region')
      .eq('active', true)
      .eq('country_code', parsed.data.country)
      .eq('currency', 'MZN')
      .order('price', { ascending: true });
    if (error) throw error;
    const methods = (data ?? [])
      .filter((method) => !method.region || method.region.toLowerCase() === parsed.data.province.toLowerCase())
      .map(({ region: _region, ...method }) => method);
    return NextResponse.json({ methods }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Delivery options are temporarily unavailable.' }, { status: 503 });
  }
}
