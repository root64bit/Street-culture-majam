// Browsers cannot set Host. Use it rather than an internal Next.js/proxy URL,
// and never trust a client-supplied forwarded-host header for CSRF decisions.
export function hasSameRequestOrigin(request: Request) {
  const value = request.headers.get('origin');
  if (!value) return false;
  try {
    const origin = new URL(value);
    const host = request.headers.get('host') || new URL(request.url).host;
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    return (
      value === origin.origin &&
      origin.host === host.toLowerCase() &&
      (origin.protocol === 'https:' || (origin.protocol === 'http:' && loopback))
    );
  } catch {
    return false;
  }
}
