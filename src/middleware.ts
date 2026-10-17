import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const canonicalHostname = 'www.streetculturevault.com';
const apexHostname = 'streetculturevault.com';
const applePayVerificationPath = '/.well-known/apple-developer-merchantid-domain-association';

export async function middleware(request: NextRequest) {
  // Apple and Square reject verification URLs that redirect, so both the
  // apex and www hostnames must serve this file directly.
  if (request.nextUrl.pathname === applePayVerificationPath) {
    return NextResponse.next();
  }

  // Keep www as the canonical storefront host after removing Vercel's
  // project-level apex redirect, which cannot exempt the verification path.
  if (request.nextUrl.hostname === apexHostname) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = canonicalHostname;
    canonicalUrl.protocol = 'https:';
    return NextResponse.redirect(canonicalUrl, 308);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/health (public health check)
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
