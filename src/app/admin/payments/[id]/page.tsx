import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { validId } from '@/lib/admin/filters';
import { redactMetadata } from '@/lib/admin/redaction';
import { AdminActionForm } from '@/components/admin/AdminActionForm';
import { ReconcilePaymentButton } from '@/components/admin/ReconcilePaymentButton';
export default async function PaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validId(id)) notFound();
  const { supabase } = await requireCapabilitiesPage(`/admin/payments/${id}`, ['payments.read']);
  const payment = await supabase
    .from('payments')
    .select('*,orders(order_number,payment_status,status,guest_email)')
    .eq('id', id)
    .maybeSingle();
  const permission = await supabase.rpc('has_capability', {
    check_capability: 'payments.reconcile',
  });
  if (payment.error || permission.error) throw new Error('Payment unavailable.');
  if (!payment.data) notFound();
  const record = payment.data;
  return (
    <section className="p-4 sm:p-7 lg:p-10">
      <Link href="/admin/payments" className="text-xs font-bold text-[#126347]">
        ← Payments
      </Link>
      <h1 className="mt-5 text-3xl font-black">Payment record</h1>
      <p className="mt-2 font-mono text-xs">{id}</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              ['Provider', record.provider],
              ['Reference', record.provider_reference],
              ['Local payment', record.status],
              ['Amount', `${record.amount} ${record.currency}`],
              ['Latest provider check', record.last_provider_status],
              ['Checked at', record.last_reconciled_at],
              ['Paid at', record.paid_at],
              ['Updated', record.updated_at],
              ['Created', record.created_at],
              ['Review', record.reconciliation_needs_review ? 'Required' : 'Not flagged'],
            ].map(([name, value]) => (
              <div key={name}>
                <dt className="text-xs text-[#61766b]">{name}</dt>
                <dd className="mt-1 break-all font-semibold">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <Link
            href={`/admin/orders/${record.order_id}`}
            className="mt-5 block text-sm font-bold text-[#126347]"
          >
            Order {record.orders?.order_number} · {record.orders?.payment_status} ·{' '}
            {record.orders?.status}
          </Link>
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-black">Provider metadata (redacted)</h2>
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(redactMetadata(record.provider_payload), null, 2)}
          </pre>
        </section>
        {permission.data && (
          <section className="rounded-2xl border bg-white p-5 lg:col-span-2">
            <h2 className="mb-4 text-lg font-black">Reconciliation</h2>
            <ReconcilePaymentButton paymentId={id} />
            <div className="mt-5 max-w-xl">
              <AdminActionForm
                endpoint={`/api/admin/payments/${id}/review`}
                actions={[
                  { value: 'FLAG', label: 'Flag for finance review' },
                  ...(record.reconciliation_needs_review
                    ? [{ value: 'CLEAR', label: 'Clear only a verified matching state' }]
                    : []),
                ]}
              />
            </div>
            <p className="mt-3 text-xs text-[#61766b]">
              Review flags do not change payment, order or inventory state. Clearing a mismatch is
              rejected by the database.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}
