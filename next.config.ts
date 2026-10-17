import type { NextConfig } from 'next';

const isStandalone = process.env.BUILD_STANDALONE === 'true';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const policy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''} https://web.squarecdn.com`,
      "style-src 'self' 'unsafe-inline' https://web.squarecdn.com",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https:",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: policy }] }];
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
