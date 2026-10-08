import { AdminPagination } from '@/components/admin/AdminPagination';
import { StaffRoleForm } from '@/components/admin/StaffRoleForm';
import { StaffAccessButton } from '@/components/admin/StaffAccessButton';
import { requireCapabilitiesPage } from '@/lib/admin/access';

const pageSize = 30;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/staff', ['roles.read']);
  const params = await searchParams;
  const q = (params.q ?? '').trim().slice(0, 120);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  const [records, permission] = await Promise.all([
    supabase.rpc('admin_staff_directory', {
      search_text: q,
      page_offset: (page - 1) * pageSize,
      page_limit: pageSize,
    }),
    supabase.rpc('has_capability', { check_capability: 'roles.manage' }),
  ]);
  if (records.error || permission.error)
    throw new Error('Staff directory is temporarily unavailable.');
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Access / People
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.05em]">Staff access.</h1>
          <p className="mt-2 text-sm text-[#61766b]">
            Manage team roles, permissions and admin access. Search existing accounts to add a staff
            role.
          </p>
        </div>
        {permission.data && <StaffRoleForm currentRoles={[]} />}
      </div>
      <form
        method="get"
        className="mt-7 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e0e9e1] bg-white p-4"
      >
        <label className="text-xs font-bold text-[#61766b]">
          Name, email or account ID
          <input
            name="q"
            defaultValue={q}
            maxLength={120}
            placeholder="Find an account"
            className="mt-1 block w-72 rounded-lg border border-[#dce6dc] px-3 py-2 text-sm"
          />
        </label>
        <button className="rounded-lg bg-[#0d211a] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white">
          Search
        </button>
      </form>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e0e9e1] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                <th className="px-5 py-4">Account</th>
                <th className="px-4 py-4">Roles / Permissions</th>
                <th className="px-4 py-4">Access</th>
                <th className="px-4 py-4">Last sign-in</th>
                <th className="px-4 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {records.data?.map((person) => (
                <tr key={person.id} className="align-top hover:bg-[#fbfdf9]">
                  <td className="px-5 py-4">
                    <p className="font-bold">{person.full_name}</p>
                    <p className="mt-1 text-xs text-[#718278]">{person.email}</p>
                    <p className="mt-1 font-mono text-[10px] text-[#718278]">{person.id}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex max-w-72 flex-wrap gap-1">
                      {person.roles.map((role) => (
                        <span
                          key={role}
                          className="rounded-full bg-[#eef7f1] px-2 py-1 text-[10px] font-bold text-[#126347]"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                    <details className="mt-2 text-xs text-[#61766b]">
                      <summary className="cursor-pointer">
                        {person.permissions.length} permissions
                      </summary>
                      <p className="mt-2 max-w-72 break-words">{person.permissions.join(', ')}</p>
                    </details>
                  </td>
                  <td className="px-4 py-4">
                    {person.admin_access_disabled ? 'Admin disabled' : person.account_status}
                  </td>
                  <td className="px-4 py-4 text-xs text-[#61766b]">
                    {person.last_sign_in_at
                      ? new Date(person.last_sign_in_at).toLocaleString('en-GB')
                      : 'Never'}
                  </td>
                  <td className="space-y-3 px-4 py-4">
                    {permission.data && (
                      <>
                        <StaffRoleForm userId={person.id} currentRoles={person.roles} />
                        <StaffAccessButton
                          userId={person.id}
                          disabled={person.admin_access_disabled}
                        />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!records.data?.length && (
          <p className="px-5 py-12 text-center text-sm text-[#61766b]">
            No accounts match this search.
          </p>
        )}
        <AdminPagination
          basePath="/admin/staff"
          page={page}
          count={records.data?.[0]?.total_count ?? 0}
          pageSize={pageSize}
          filters={{ q }}
        />
      </div>
    </section>
  );
}
