import { NextResponse } from 'next/server';
import { phoneCountry } from '@/lib/phone';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Approximate country only; do not return/store IPs or request GPS access.
  // This is a changeable UI hint, never an authorization or verification check.
  const country = phoneCountry(request.headers.get('x-vercel-ip-country'));
  return NextResponse.json(
    { country },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  );
}
