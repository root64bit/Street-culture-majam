'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { z } from 'zod';
import { activeCosts, financeTotals, type financeWorkspaceSchema } from '@/lib/finance/profit';
import { formatOrderMoney } from '@/lib/commerce/order-money';

type Workspace = z.infer<typeof financeWorkspaceSchema>;
const input =
  'mt-1 block w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm text-neutral-950';
export function FinanceWorkspace({ data, canManage }: { data: Workspace; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const requestId = useRef<string | null>(null);
  const [costCurrency, setCostCurrency] = useState('MZN'),
    [costRate, setCostRate] = useState('1');
  const totals = financeTotals(data),
    money = (minor: number) => formatOrderMoney(minor / 100);
  const resultsIncomplete = totals.incompleteOrders > 0 || totals.estimatedPeriodCosts > 0;
  const send = async (payload: Record<string, unknown>, fees = false) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(fees ? '/api/admin/finance/square-fees' : '/api/admin/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, request_id: requestId.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Finance operation failed.');
      requestId.current = null;
      setMessage(
        fees && !result.feesAvailable
          ? 'Square has not supplied processing fees yet. They remain unknown.'
          : 'Recorded. No funds were moved.'
      );
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Finance operation failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submit = (action: string) => (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement),
      payload: Record<string, unknown> = { action, ...Object.fromEntries(form) };
    if ('order_id' in payload && !payload.order_id) payload.order_id = null;
    if (action === 'REVIEW') payload.costs_complete = form.get('costs_complete') === 'on';
    if (action === 'BALANCE')
      payload.observed_at = new Date(String(payload.observed_at)).toISOString();
    void send(payload).then((saved) => {
      if (saved) {
        formElement.reset();
        if (action === 'COST') {
          setCostCurrency('MZN');
          setCostRate('1');
        }
      }
    });
  };
  const orderOptions = data.orders.map((o) => (
    <option key={o.id} value={o.id}>
      {o.order_number}
    </option>
  ));
  const costs = activeCosts(data.costs);
  return (
    <div className="space-y-6">
      <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Square funds available to transfer are cash, not profit. This is a management report in MZN
        for the selected order cohort, using historical conversion rates. Refunds reflect current
        order state. Period expenses use their incurred date. It is not a tax return or a bank
        reconciliation.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Gross sales incl. delivery', money(totals.grossMinor)],
          ['Net sales after discounts/refunds', money(totals.netSalesMinor)],
          [
            'Gross profit after merchandise costs',
            totals.grossProfitMinor === null ? 'Incomplete inputs' : money(totals.grossProfitMinor),
          ],
          ['Consignment commission revenue', money(totals.commissionMinor)],
          ['Consignors still due / recovery', money(totals.sellerDueMinor)],
          ['Unpaid recorded costs', money(totals.outstandingCostMinor)],
          ['Period operating costs', money(totals.overheadMinor)],
          ['Recorded income tax', money(totals.recordedIncomeTaxMinor)],
          [
            'Operating result before tax',
            resultsIncomplete ? 'Incomplete inputs' : money(totals.resultBeforeTaxMinor),
          ],
          [
            'Net result after recorded tax',
            resultsIncomplete ? 'Incomplete inputs' : money(totals.resultAfterRecordedTaxMinor),
          ],
          ['Incomplete orders', String(totals.incompleteOrders)],
        ].map(([label, value]) => (
          <div className="rounded-xl border bg-white p-4" key={label}>
            <p className="text-xs text-neutral-600">{label}</p>
            <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-sm font-semibold text-amber-900">
        Operating and net results are provisional: missing costs are not zero.{' '}
        {totals.incompleteOrders} order(s) need review; {totals.estimatedPeriodCosts} period cost(s)
        are estimated. Income tax and unrecorded overhead remain subject to accountant review.
      </p>
      {message && (
        <p role="status" className="rounded-lg bg-neutral-100 p-3 text-sm">
          {message}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead>
            <tr>
              {[
                'Order',
                'Retained revenue',
                'COGS',
                'Processing fees',
                'Direct operating costs',
                'Gross profit',
                'Operating profit',
                'Review',
              ].map((v) => (
                <th className="p-3" key={v}>
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totals.rows.map((row) => (
              <tr className="border-t align-top" key={row.orderId}>
                <td className="p-3">
                  <Link className="font-semibold underline" href={`/admin/orders/${row.orderId}`}>
                    {row.orderNumber}
                  </Link>
                  <p>Commission {money(row.commissionMinor)}</p>
                </td>
                <td className="p-3">{money(row.retainedRevenueMinor)}</td>
                <td className="p-3">
                  {row.issues.some((i) => i.includes('Purchase cost'))
                    ? 'Unknown'
                    : money(row.cogsMinor)}
                </td>
                <td className="p-3">
                  {row.issues.some((i) => i.includes('fee is missing'))
                    ? 'Unknown'
                    : money(row.processingFeesMinor)}
                </td>
                <td className="p-3">
                  {money(row.operatingCostsMinor)}
                  <p className="text-xs text-neutral-500">Includes processing fees</p>
                </td>
                <td className="p-3">
                  {row.grossProfitMinor === null ? 'Incomplete' : money(row.grossProfitMinor)}
                </td>
                <td className="p-3">
                  {row.operatingProfitMinor === null
                    ? 'Incomplete'
                    : money(row.operatingProfitMinor)}
                </td>
                <td className="p-3 text-xs">
                  <ul>
                    {row.issues.map((issue) => (
                      <li className="mb-2 text-amber-900" key={issue}>
                        {issue}
                      </li>
                    ))}
                  </ul>
                  {!row.issues.length && 'Order inputs reviewed; period overhead/tax separate'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-bold">Provider proceeds and available balance</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Amounts below remain in their original currency. Payment proceeds exclude only reported
          payment fees/refunds, not courier costs, consignor liabilities, transfer fees, holds or
          withdrawals. Balance observations are manually reported, not a live Square balance.
        </p>
        {data.orders.map((order) => (
          <div key={order.id} className="mt-4 border-t pt-3">
            <strong>{order.order_number}</strong>
            {order.payments.map((payment) => {
              const row = totals.rows
                .find((r) => r.orderId === order.id)!
                .cash.find((c) => c.paymentId === payment.id);
              return (
                <div className="mt-2 text-sm" key={payment.id}>
                  {payment.provider}: captured {formatOrderMoney(payment.amount, payment.currency)}{' '}
                  · fees{' '}
                  {row?.feeMinor == null
                    ? 'Not yet reported'
                    : formatOrderMoney(row.feeMinor / 100, payment.currency)}{' '}
                  · net payment proceeds{' '}
                  {row?.netMinor == null
                    ? 'Unknown'
                    : formatOrderMoney(row.netMinor / 100, payment.currency)}
                  {canManage && payment.provider === 'square' && (
                    <button
                      disabled={busy}
                      onClick={() => void send({ paymentId: payment.id }, true)}
                      className="ml-3 font-semibold underline"
                    >
                      Read actual Square fees
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {data.balances.map((b) => (
          <p className="mt-3 text-sm" key={`${b.provider}-${b.currency}`}>
            {b.provider} available balance observation:{' '}
            <strong>{formatOrderMoney(b.amount, b.currency)}</strong> ·{' '}
            {new Date(b.observed_at).toLocaleString('en-GB', { timeZone: 'Africa/Johannesburg' })}{' '}
            SAST · {b.reference}
          </p>
        ))}
      </section>
      {canManage && (
        <div className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={submit('COST')} className="space-y-3 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Record a cost or expense</h2>
            <label className="block text-xs">
              Order (leave empty for period overhead or income tax)
              <select name="order_id" className={input}>
                <option value="">Period expense</option>
                {orderOptions}
              </select>
            </label>
            <label className="block text-xs">
              Category
              <select name="kind" className={input}>
                {[
                  'COGS',
                  'COURIER',
                  'PAYMENT_FEE',
                  'PACKAGING',
                  'OTHER_DIRECT',
                  'OVERHEAD',
                  'TRANSFER_FEE',
                  'INCOME_TAX',
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs">
                Amount
                <input name="amount" type="number" min="0" step="0.01" required className={input} />
              </label>
              <label className="text-xs">
                Currency
                <select
                  name="currency"
                  className={input}
                  value={costCurrency}
                  onChange={(event) => {
                    setCostCurrency(event.target.value);
                    setCostRate(event.target.value === 'MZN' ? '1' : '');
                  }}
                >
                  {['MZN', 'GBP', 'ZAR', 'USD', 'EUR'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs">
              MZN per one currency unit (1 for MZN; historical invoice rate otherwise)
              <input
                name="mzn_per_unit"
                type="number"
                min="0.000000000001"
                step="any"
                required
                value={costRate}
                readOnly={costCurrency === 'MZN'}
                onChange={(event) => setCostRate(event.target.value)}
                className={input}
              />
            </label>
            <label className="block text-xs">
              Evidence basis
              <select name="basis" className={input}>
                <option>ACTUAL</option>
                <option>ESTIMATE</option>
              </select>
            </label>
            <label className="block text-xs">
              Incurred date
              <input name="incurred_on" type="date" required className={input} />
            </label>
            <label className="block text-xs">
              Invoice or evidence reference
              <input name="reference" required minLength={3} maxLength={160} className={input} />
            </label>
            <button
              disabled={busy}
              className="rounded-full bg-black px-5 py-3 text-sm font-bold text-white"
            >
              Record cost
            </button>
            <p className="text-xs text-neutral-600">
              Do not enter seller payouts as an expense: the seller share is already excluded from
              retained revenue. COGS is an order-level replacement total: it replaces frozen private
              purchase costs, not an additional charge. Square processing fees already deducted from
              proceeds must not be paid again.
            </p>
          </form>
          <div className="space-y-5">
            <form onSubmit={submit('REVIEW')} className="space-y-3 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Review an order</h2>
              <label className="block text-xs">
                Order
                <select name="order_id" required className={input}>
                  <option value="">Choose order</option>
                  {orderOptions}
                </select>
              </label>
              <label className="block text-xs">
                Sales tax collected in MZN (explicit 0 if confirmed none)
                <input
                  name="sales_tax_mzn"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className={input}
                />
              </label>
              <label className="block text-sm">
                <input name="costs_complete" type="checkbox" required /> I checked stock ownership,
                all item costs, fees, invoices and tax treatment.
              </label>
              <label className="block text-xs">
                Review evidence or note
                <textarea name="note" required minLength={10} maxLength={1000} className={input} />
              </label>
              <button
                disabled={busy}
                className="rounded-full bg-black px-5 py-3 text-sm font-bold text-white"
              >
                Save review
              </button>
            </form>
            <form onSubmit={submit('BALANCE')} className="space-y-3 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Record an available balance observation</h2>
              <p className="text-sm text-neutral-600">
                Reference only. This does not transfer funds or affect profit.
              </p>
              <label className="block text-xs">
                Provider
                <select name="provider" className={input}>
                  <option value="square">Square</option>
                  <option value="bank">Bank</option>
                </select>
              </label>
              <label className="block text-xs">
                Amount
                <input name="amount" required type="number" min="0" step="0.01" className={input} />
              </label>
              <label className="block text-xs">
                Currency
                <select name="currency" defaultValue="GBP" className={input}>
                  {['MZN', 'GBP', 'ZAR', 'USD', 'EUR'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                Observed time (your browser timezone)
                <input name="observed_at" required type="datetime-local" className={input} />
              </label>
              <label className="block text-xs">
                Statement or dashboard reference
                <input name="reference" required minLength={3} className={input} />
              </label>
              <button
                disabled={busy}
                className="rounded-full bg-black px-5 py-3 text-sm font-bold text-white"
              >
                Save observation
              </button>
            </form>
          </div>
        </div>
      )}
      {canManage && (
        <form onSubmit={submit('SETTLE')} className="space-y-3 rounded-xl border bg-white p-5">
          <h2 className="font-bold">Record a paid invoice or deducted fee</h2>
          <p className="text-sm text-neutral-600">
            Record evidence after payment or a provider deduction. This does not transfer money and
            does not deduct the expense from profit a second time.
          </p>
          <label className="block text-xs">
            Unpaid actual cost
            <select required name="entry_id" className={input}>
              <option value="">Choose invoice</option>
              {costs
                .filter((c) => c.basis === 'ACTUAL' && !c.settlement)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.kind} · {formatOrderMoney(c.amount, c.currency)} · {c.reference}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-xs">
            Evidence type
            <select name="method" className={input}>
              <option value="PAID">Paid externally</option>
              <option value="DEDUCTED">Already deducted by provider</option>
            </select>
          </label>
          <label className="block text-xs">
            Paid or deducted date
            <input name="paid_on" type="date" required className={input} />
          </label>
          <label className="block text-xs">
            Statement / payment evidence reference
            <input name="reference" required minLength={3} maxLength={160} className={input} />
          </label>
          <button
            disabled={busy}
            className="rounded-full border border-black px-5 py-3 text-sm font-bold"
          >
            Record evidence only
          </button>
        </form>
      )}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-bold">Active cost ledger</h2>
        {costs.map((c) => (
          <div
            key={c.id}
            className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"
          >
            <span>
              {c.kind} · {formatOrderMoney(c.amount, c.currency)} ·{' '}
              {money(moneyMinorSafe(c.amount_mzn))} · {c.basis} · {c.reference} ·{' '}
              {c.settlement
                ? `${c.settlement.method} ${c.settlement.paid_on}`
                : 'Payment not yet evidenced'}
            </span>
            {canManage && (
              <button
                disabled={busy}
                className="underline"
                onClick={() => {
                  if (
                    window.confirm(
                      'Append a reversal of this cost? The original stays in the audit history.'
                    )
                  )
                    void send({
                      action: 'REVERSE',
                      entry_id: c.id,
                      reference: `Correction of ${c.id}`,
                    });
                }}
              >
                Reverse entry
              </button>
            )}
          </div>
        ))}
      </section>
      <p className="text-xs leading-6 text-neutral-600">
        Gross profit = retained sales revenue less purchase cost of own stock. Consignment revenue
        is the commission, not the seller&apos;s share. Operating profit subtracts payment, courier,
        packaging and other operating costs. Period overhead and recorded income tax are subtracted
        once. Missing data makes the result provisional. Transfers and seller payouts are not
        additional expenses.
      </p>
    </div>
  );
}
function moneyMinorSafe(value: number) {
  return Math.round(value * 100);
}
