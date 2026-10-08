import { requireCapabilitiesPage } from '@/lib/admin/access';
import { ConfigurationForm } from '@/components/admin/ConfigurationForm';
import type { FormField } from '@/lib/admin/configuration';

const fields: Record<string, FormField[]> = {
  store: [
    { name: 'name', label: 'Store name', required: true },
    { name: 'supportEmail', label: 'Support email', type: 'email' },
    { name: 'supportPhone', label: 'Support phone' },
  ],
  consignment: [
    {
      name: 'returnInstructions',
      label: 'Rejected item return instructions',
      type: 'textarea',
      required: true,
    },
  ],
  authentication: [
    {
      name: 'checklist',
      label: 'Inspection checklist (one entry per line)',
      type: 'textarea',
      required: true,
    },
  ],
  notifications: [
    {
      name: 'lowStockThreshold',
      label: 'Low stock threshold',
      type: 'number',
      step: '1',
      required: true,
    },
  ],
};
export default async function SettingsPage() {
  const { supabase } = await requireCapabilitiesPage('/admin/settings', ['settings.read']);
  const [settings, canManage] = await Promise.all([
    supabase.from('store_settings').select('*').order('key'),
    supabase.rpc('has_capability', { check_capability: 'settings.manage' }),
  ]);
  if (settings.error) throw new Error('Settings are temporarily unavailable.');
  const statuses = [
    ['Database connection', 'Configured'],
    [
      'Supabase server key',
      process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Configured (server only)' : 'Missing',
    ],
    [
      'MineScope / M-Pesa',
      process.env.MPESA_PAYMENTS_ENABLED === 'true' ? 'Enabled — MZN only' : 'Disabled',
    ],
    [
      'Scheduled payment reconciliation',
      process.env.CRON_SECRET ? 'Configured (secret hidden)' : 'Not configured',
    ],
    ['Display currencies', 'MZN checkout · EUR / ZAR estimates'],
    ['Shipping', 'Managed in the Shipping module'],
  ];
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#087456]">
        System / Configuration
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Store settings</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Operational preferences only. Payment credentials and secrets remain in server environment
        variables.
      </p>
      <section className="mt-6 rounded-2xl border border-[#dce6dc] bg-white p-5">
        <h2 className="font-black">Integration health</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {statuses.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-[#61766b]">{label}</dt>
              <dd className="mt-1 text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {settings.data?.map((record) => {
          const value =
            record.value && typeof record.value === 'object' && !Array.isArray(record.value)
              ? record.value
              : {};
          const values: Record<string, string | number | boolean> = {};
          for (const [key, entry] of Object.entries(value))
            values[key] = Array.isArray(entry)
              ? entry.join('\n')
              : typeof entry === 'number' || typeof entry === 'boolean'
                ? entry
                : String(entry ?? '');
          return (
            <section key={record.id} className="rounded-2xl border border-[#dce6dc] bg-white p-5">
              <h2 className="mb-4 text-lg font-black capitalize">{record.key}</h2>
              {canManage.data ? (
                <ConfigurationForm
                  kind="setting"
                  recordId={record.id}
                  settingKey={record.key}
                  fields={fields[record.key] ?? []}
                  values={values}
                />
              ) : (
                <dl className="space-y-3">
                  {Object.entries(values).map(([key, entry]) => (
                    <div key={key}>
                      <dt className="text-xs text-[#61766b]">{key}</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-sm">{String(entry)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-3 text-[11px] text-[#718278]">
                Updated{' '}
                {new Date(record.updated_at).toLocaleString('en-GB', { timeZone: 'Africa/Maputo' })}
              </p>
            </section>
          );
        })}
      </div>
    </section>
  );
}
