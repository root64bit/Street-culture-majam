import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const allowedTypes = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = type === 'recovery' || type === 'invite' ? '/auth/reset-password' : '/account';
  if (tokenHash && type && allowedTypes.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error)
      return NextResponse.redirect(new URL(next, url.origin), {
        headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' },
      });
  }
  return NextResponse.redirect(new URL('/auth/sign-in?error=code_expired', url.origin), {
    headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' },
  });
}
