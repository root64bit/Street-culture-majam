import 'server-only';

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requireStaffPage(path: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(path)}`);
  const { data: isStaff, error } = await supabase.rpc('is_staff');
  if (error || !isStaff) notFound();
  return { supabase, user };
}

export async function staffApiClient() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Sign in required.', status: 401 } as const;
  const { data: isStaff, error } = await supabase.rpc('is_staff');
  if (error || !isStaff) return { error: 'Staff access required.', status: 403 } as const;
  return { supabase, user } as const;
}
