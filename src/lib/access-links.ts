import { safeAuthRedirect } from '@/lib/auth-redirect';
export function privateAccessUrl(path: string, area: 'order' | 'staff') {
  const target = safeAuthRedirect(path);
  return `/auth/access?area=${area}&redirectTo=${encodeURIComponent(target.startsWith('/auth/') ? '/account' : target)}`;
}
