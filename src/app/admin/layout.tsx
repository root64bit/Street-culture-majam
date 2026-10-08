import { requireCapabilitiesPage } from '@/lib/admin/access';
import { AdminShell } from '@/components/admin/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireCapabilitiesPage('/admin', ['dashboard.read']);
  const { data, error } = await supabase.rpc('my_capabilities');
  if (error) throw new Error('Admin permissions are temporarily unavailable.');
  return (
    <AdminShell
      userEmail={user.email ?? 'Staff account'}
      permissions={(data ?? []).map((item) => item.capability)}
    >
      {children}
    </AdminShell>
  );
}
