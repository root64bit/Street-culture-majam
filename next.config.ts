import type { NextConfig } from 'next';

const isStandalone = process.env.BUILD_STANDALONE === 'true';
// Dedicated disposable browser QA only. Never permit HTTP backends in production.
const isolatedLocalQa =
  process.env.NODE_ENV === 'development' &&
  process.env.SC_EXTERNAL_SERVICES === 'disabled' &&
  process.env.NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:55321';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const policy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''} https://web.squarecdn.com`,
      "style-src 'self' 'unsafe-inline' https://web.squarecdn.com",
      `connect-src 'self' https: wss:${isolatedLocalQa ? ' http://127.0.0.1:55321' : ''}`,
      "frame-src 'self' https:",
      `img-src 'self' data: blob: https:${isolatedLocalQa ? ' http://127.0.0.1:55321' : ''}`,
      "font-src 'self' data: https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net",
      "object-src 'none'",
      "base-uri 'self'",
      // Square 3DS creates a POST form in this document targeting the card
      // issuer's HTTPS ACS URL. Restricting this to 'self' leaves the SDK's
      // verification modal blank. Issuers vary, so a Square-only allowlist is
      // insufficient. Do not relax scripts, framing ancestors or other rules.
      "form-action 'self' https:",
      "frame-ancestors 'none'",
    ].join('; ');
    const sensitivePolicy = policy.replace("form-action 'self' https:", "form-action 'self'");
    return [
      { source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: policy }] },
      // Next applies the last matching header. Keep cross-origin forms
      // unavailable on administrative, authentication and API documents.
      ...['/admin/:path*', '/auth/:path*', '/api/:path*'].map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: sensitivePolicy }],
      })),
    ];
  },
  ...(isStandalone ? { output: 'standalone' as const } : {}),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
    ],
  },
};

export default nextConfig;
