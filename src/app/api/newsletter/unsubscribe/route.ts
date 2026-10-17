import { NextResponse } from 'next/server';
import { unsubscribeNewsletter } from '@/lib/communications/newsletter';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const target = new URL(
    '/newsletter/unsubscribe',
    process.env.NEXT_PUBLIC_SITE_URL || 'https://www.streetculturevault.com'
  );
  target.searchParams.set('token', token);
  return NextResponse.redirect(target, {
    headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  try {
    const success = await unsubscribeNewsletter(token);
    return NextResponse.json(
      { success },
      { status: success ? 200 : 400, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Please try again shortly or contact support@streetculturevault.com.' },
      { status: 503 }
    );
  }
}
