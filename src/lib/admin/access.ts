import 'server-only';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { privateAccessUrl } from '@/lib/access-links';
import { safeAuthRedirect } from '@/lib/auth-redirect';
import { createClient } from '@/lib/supabase/server';

async function denied(path: string) {
  const requested = safeAuthRedirect((await headers()).get('x-street-culture-path'));
  redirect(privateAccessUrl(requested.startsWith('/admin') ? requested : path, 'staff'));
}

export async function requireCapabilitiesPage(path: string, capabilities: readonly string[]) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(path)}`);
  const checks = await Promise.all(
    capabilities.map((capability) =>
      supabase.rpc('has_capability', { check_capability: capability })
    )
  );
  if (checks.some(({ error }) => error))
    throw new Error('Access checks are temporarily unavailable.');
  if (checks.some(({ data }) => !data)) await denied(path);
  return { supabase, user };
}

export async function capabilityApiClient(capabilities: readonly string[]) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Sign in required.', status: 401 } as const;
  const checks = await Promise.all(
    capabilities.map((capability) =>
      supabase.rpc('has_capability', { check_capability: capability })
    )
  );
  if (checks.some(({ data, error }) => error || !data)) {
    return { error: 'This role cannot perform that action.', status: 403 } as const;
  }
  return { supabase, user } as const;
}

export async function requireStaffPage(path: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(path)}`);
  const { data: isStaff, error } = await supabase.rpc('is_staff');
  if (error) throw new Error('Access checks are temporarily unavailable.');
  if (!isStaff) await denied(path);
  return { supabase, user };
}

export async function staffApiClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Sign in required.', status: 401 } as const;
  const { data: isStaff, error } = await supabase.rpc('is_staff');
  if (error || !isStaff) return { error: 'Staff access required.', status: 403 } as const;
  return { supabase, user } as const;
}

export async function requireAdminPage(path: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(path)}`);
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error) throw new Error('Access checks are temporarily unavailable.');
  if (!isAdmin) await denied(path);
  return { supabase, user };
}

export async function adminApiClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Sign in required.', status: 401 } as const;
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || !isAdmin) return { error: 'Admin access required.', status: 403 } as const;
  return { supabase, user } as const;
}
