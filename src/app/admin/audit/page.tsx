import { AdminPagination } from '@/components/admin/AdminPagination';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { validDate, validId } from '@/lib/admin/filters';
import { redactMetadata } from '@/lib/admin/redaction';

const pageSize = 30;
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    action?: string;
    entity?: string;
    actor?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/audit', ['audit.read']);
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  const action = /^[A-Z_]{1,80}$/.test(params.action ?? '') ? params.action! : '';
  const entity = /^[a-z_]{1,40}$/.test(params.entity ?? '') ? params.entity! : '';
  const actor = validId(params.actor);
  const from = validDate(params.from);
  const to = validDate(params.to);
  let query = supabase
    .from('admin_audit_logs')
    .select('id,actor_id,action,entity_type,entity_id,metadata,created_at', { count: 'exact' });
  if (action) query = query.eq('action', action);
  if (entity) query = query.eq('entity_type', entity);
  if (actor) query = query.eq('actor_id', actor);
  if (from) query = query.gte('created_at', `${from}T00:00:00+02:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999+02:00`);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error('Audit records are temporarily unavailable.');
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Governance / History
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">The action trail.</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Who changed what, when, and why. Audit records are read-only.
      </p>
      <form
        method="get"
        className="mt-7 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e0e9e1] bg-white p-4"
      >
        {[
          { name: 'action', label: 'Action', value: action, placeholder: 'ORDER_MARK_PACKED' },
          { name: 'entity', label: 'Entity', value: entity, placeholder: 'order' },
          { name: 'actor', label: 'Actor ID', value: actor, placeholder: 'Account UUID' },
        ].map((field) => (
          <label key={field.name} className="text-xs font-bold text-[#61766b]">
            {field.label}
            <input
              name={field.name}
              defaultValue={field.value}
              placeholder={field.placeholder}
              className="mt-1 block w-44 rounded-lg border border-[#dce6dc] px-3 py-2 text-sm"
            />
          </label>
        ))}
        {[
          { name: 'from', label: 'From', value: from },
          { name: 'to', label: 'To', value: to },
        ].map((field) => (
          <label key={field.name} className="text-xs font-bold text-[#61766b]">
            {field.label}
            <input
              type="date"
              name={field.name}
              defaultValue={field.value}
              className="mt-1 block rounded-lg border border-[#dce6dc] px-3 py-2 text-sm"
            />
          </label>
        ))}
        <button className="rounded-lg bg-[#0d211a] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white">
          Filter
        </button>
      </form>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e0e9e1] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                <th className="px-5 py-4">When</th>
                <th className="px-4 py-4">Actor</th>
                <th className="px-4 py-4">Action</th>
                <th className="px-4 py-4">Entity</th>
                <th className="px-4 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {data?.map((record) => (
                <tr key={record.id} className="align-top hover:bg-[#fbfdf9]">
                  <td className="px-5 py-4 text-xs text-[#61766b]">
                    {new Date(record.created_at).toLocaleString('en-GB', {
                      timeZone: 'Africa/Maputo',
                    })}
                  </td>
                  <td className="px-4 py-4 font-mono text-[11px]">{record.actor_id ?? 'System'}</td>
                  <td className="px-4 py-4 text-xs font-bold">
                    {record.action.replaceAll('_', ' ')}
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {record.entity_type}
                    <p className="mt-1 font-mono text-[10px] text-[#718278]">
                      {record.entity_id ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <details className="text-xs">
                      <summary className="cursor-pointer font-bold text-[#126347]">Inspect</summary>
                      <pre className="mt-2 max-w-80 whitespace-pre-wrap break-words rounded-lg bg-[#f4f7f3] p-3 text-[11px]">
                        {JSON.stringify(redactMetadata(record.metadata), null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <p className="px-5 py-12 text-center text-sm text-[#61766b]">
            No audit records match these filters.
          </p>
        )}
        <AdminPagination
          basePath="/admin/audit"
          page={page}
          count={count ?? 0}
          pageSize={pageSize}
          filters={{ action, entity, actor, from, to }}
        />
      </div>
    </section>
  );
}
