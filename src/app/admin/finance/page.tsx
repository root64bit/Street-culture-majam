import { requireCapabilitiesPage } from '@/lib/admin/access';
import { validDate } from '@/lib/admin/filters';
import { financeWorkspaceSchema } from '@/lib/finance/profit';
import { FinanceWorkspace } from '@/components/admin/FinanceWorkspace';
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/finance', ['finance.read']);
  const params = await searchParams;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const from = validDate(params.from) || `${today.slice(0, 7)}-01`,
    to = validDate(params.to) || today;
  const [result, permission] = await Promise.all([
    supabase.rpc('finance_workspace', { date_from: from, date_to: to }),
    supabase.rpc('has_capability', { check_capability: 'finance.manage' }),
  ]);
  return (
    <section className="space-y-6 px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <h1 className="text-4xl font-black">Finance and profit</h1>
      <p className="text-neutral-600">
        Sales, commission, stock costs, operating expenses and provider proceeds. Base currency MZN.
      </p>
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          Orders created from
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 block rounded-lg border p-2"
          />
        </label>
        <label className="text-xs">
          Through
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 block rounded-lg border p-2"
          />
        </label>
        <button className="rounded-lg bg-black px-5 py-2 text-white">Run report</button>
      </form>
      {result.error ? (
        <p role="alert">
          Finance report unavailable. Apply the finance migration locally first, or choose a smaller
          valid date range.
        </p>
      ) : (
        <FinanceWorkspace
          data={financeWorkspaceSchema.parse(result.data)}
          canManage={permission.data === true}
        />
      )}
    </section>
  );
}
