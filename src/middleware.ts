import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { APPLE_ASSOCIATION_PATH, storefrontRedirect } from '@/lib/storefront-origin';

export async function middleware(request: NextRequest) {
  // Provider callbacks authenticate their own payload, not a browser session.
  // Avoid auth refresh and canonical redirects before the Sandbox ITN verifier.
  if (request.nextUrl.pathname === '/api/payments/payfast-sandbox/notify') {
    return NextResponse.next();
  }
  // Apple and Square reject verification URLs that redirect, so both the
  // apex and www hostnames must serve this file directly.
  if (request.nextUrl.pathname === APPLE_ASSOCIATION_PATH) {
    return NextResponse.next();
  }

  // Keep www as the canonical storefront host after removing Vercel's
  // project-level apex redirect, which cannot exempt the verification path.
  const canonical = storefrontRedirect({
    hostname: request.nextUrl.hostname,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
    production: process.env.VERCEL_ENV === 'production',
  });
  if (canonical) return NextResponse.redirect(canonical, 308);

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
