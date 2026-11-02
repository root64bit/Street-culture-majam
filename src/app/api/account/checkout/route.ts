import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decodeSavedAddresses } from '@/lib/checkout-addresses';
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const db = await createClient(),
      {
        data: { user },
        error,
      } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ signedIn: false }, { headers });
    const [profile, addresses] = await Promise.all([
      db.from('profiles').select('full_name,display_name,phone').eq('id', user.id).single(),
      db
        .from('customer_addresses')
        .select('id,label,details,is_default,revision')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at'),
    ]);
    if (profile.error || addresses.error) throw new Error('Unavailable');
    const book = decodeSavedAddresses(addresses.data),
      preferred = book.find((entry) => entry.is_default) || book[0];
    return NextResponse.json(
      {
        signedIn: true,
        userId: user.id,
        contact: {
          name:
            profile.data.full_name || preferred?.details.name || profile.data.display_name || '',
          email: user.email || '',
          phone: user.phone || profile.data.phone || preferred?.details.phone || '',
        },
        addresses: book,
      },
      { headers }
    );
  } catch {
    return NextResponse.json(
      { error: 'Saved checkout details are temporarily unavailable. You can enter them manually.' },
      { status: 503, headers }
    );
  }
}
