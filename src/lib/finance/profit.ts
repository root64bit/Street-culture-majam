import { z } from 'zod';
import { convertedMinor, moneyMinor } from '@/lib/money';

const amount = z.union([z.number(), z.string()]).transform(Number).refine(Number.isFinite);
const itemSchema = z.object({
  id: z.string(),
  unit_price: amount,
  quantity: z.number().int().positive(),
  commission_amount: amount,
  seller_net_amount: amount,
  ownership_type: z.string().nullable(),
  unit_cost_mzn: amount.nullable().optional(),
});
const paymentSchema = z.object({
  id: z.string(),
  provider: z.string(),
  status: z.string(),
  amount,
  currency: z.string(),
  paid_at: z.string().nullable(),
  snapshot: z.record(z.unknown()).nullable(),
});
const reviewSchema = z.object({
  costs_complete: z.boolean(),
  sales_tax_mzn: amount,
  items_snapshot: z.array(itemSchema),
  reviewed_at: z.string(),
});
export const financeOrderSchema = z.object({
  id: z.string(),
  order_number: z.string(),
  currency: z.string(),
  subtotal: amount,
  shipping_amount: amount,
  discount_amount: amount,
  total_amount: amount,
  status: z.string(),
  payment_status: z.string(),
  created_at: z.string(),
  items: z.array(itemSchema),
  payments: z.array(paymentSchema),
  review: reviewSchema.nullable(),
  payouts: z
    .array(z.object({ status: z.string(), net_amount: amount, currency: z.string() }))
    .default([]),
});
export const financeCostSchema = z.object({
  settlement: z
    .object({ method: z.enum(['PAID', 'DEDUCTED']), paid_on: z.string(), reference: z.string() })
    .nullable()
    .default(null),
  id: z.string(),
  order_id: z.string().nullable(),
  kind: z.string(),
  amount,
  amount_mzn: amount,
  currency: z.string(),
  mzn_per_unit: amount,
  basis: z.enum(['ACTUAL', 'ESTIMATE']),
  reference: z.string(),
  incurred_on: z.string(),
  reverses_id: z.string().nullable(),
  created_at: z.string(),
});
export const financeWorkspaceSchema = z.object({
  orders: z.array(financeOrderSchema),
  costs: z.array(financeCostSchema),
  balances: z.array(
    z.object({
      provider: z.string(),
      amount,
      currency: z.string(),
      observed_at: z.string(),
      reference: z.string(),
    })
  ),
});
export type FinanceOrder = z.infer<typeof financeOrderSchema>;
export type FinanceCost = z.infer<typeof financeCostSchema>;

function signedMinor(value: number) {
  return Math.sign(value) * moneyMinor(Math.abs(value));
}
function safeSum(values: number[]) {
  const result = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(result)) throw new Error('Finance total exceeds safe range');
  return result;
}
export function activeCosts(costs: FinanceCost[]) {
  const reversed = new Set(costs.filter((c) => c.reverses_id).map((c) => c.reverses_id));
  return costs.filter((c) => !c.reverses_id && !reversed.has(c.id));
}

// Positive Square fees are costs; negative ADJUSTMENT entries are credits.
// Missing fee data is unknown, never zero. No comparison to a bank balance.
export function squareFeeMinor(
  snapshot: Record<string, unknown> | null,
  currency: string
): number | null {
  const square = snapshot?.square as Record<string, unknown> | undefined;
  if (!square || !Array.isArray(square.processingFees)) return null;
  let total = 0;
  for (const fee of square.processingFees) {
    if (
      !fee ||
      typeof fee !== 'object' ||
      fee.currency !== currency ||
      !Number.isSafeInteger(fee.amountMinor)
    )
      return null;
    total += fee.amountMinor;
  }
  return Number.isSafeInteger(total) ? total : null;
}

export function orderProfit(order: FinanceOrder, entries: FinanceCost[]) {
  const costs = activeCosts(entries).filter((c) => c.order_id === order.id);
  const issues: string[] = [];
  const items = order.review?.items_snapshot ?? order.items;
  const refunded = order.payment_status === 'REFUNDED' || order.status === 'REFUNDED';
  if (order.currency !== 'MZN')
    issues.push('Order currency is not supported by the MZN management report');
  if (!order.review?.costs_complete)
    issues.push('Finance review and tax treatment are not confirmed');
  if (
    !items.length ||
    items.some(
      (i) =>
        !['STREET_CULTURE', 'CONSIGNMENT', 'PROFESSIONAL_SELLER'].includes(i.ownership_type ?? '')
    )
  )
    issues.push('Inventory ownership needs review');
  if (costs.some((c) => c.basis !== 'ACTUAL')) issues.push('Estimated costs are included');
  if (refunded) issues.push('Refund and physical-return cost treatment needs finance review');
  const hasOwn = items.some((i) => i.ownership_type === 'STREET_CULTURE');
  const sumKind = (kind: string) =>
    safeSum(costs.filter((c) => c.kind === kind).map((c) => signedMinor(c.amount_mzn)));
  const manualCogs = costs.filter((c) => c.kind === 'COGS');
  const ownItems = items.filter((i) => i.ownership_type === 'STREET_CULTURE');
  if (
    hasOwn &&
    !manualCogs.some((c) => c.basis === 'ACTUAL') &&
    ownItems.some((i) => i.unit_cost_mzn == null)
  )
    issues.push('Purchase cost of store-owned stock is missing');
  if (order.shipping_amount > 0 && !costs.some((c) => c.kind === 'COURIER' && c.basis === 'ACTUAL'))
    issues.push('Actual courier cost is missing; a checkout quote is not an invoice');
  let providerFeeMzn = 0;
  const cash = order.payments.map((p) => {
    const fee = p.provider === 'square' ? squareFeeMinor(p.snapshot, p.currency) : null;
    const square = p.snapshot?.square as Record<string, unknown> | undefined;
    const refundMinor = typeof square?.refundedMinor === 'number' ? square.refundedMinor : 0;
    if (refundMinor) issues.push('Provider refund requires allocation review');
    if (fee === null) {
      if (!costs.some((c) => c.kind === 'PAYMENT_FEE' && c.basis === 'ACTUAL'))
        issues.push(`Actual ${p.provider} fee is missing`);
    } else if (p.currency === 'MZN') providerFeeMzn += fee;
    else if (
      p.currency === 'GBP' &&
      typeof p.snapshot?.gbpPerMzn === 'number' &&
      p.snapshot.gbpPerMzn > 0
    )
      providerFeeMzn +=
        Math.sign(fee) * convertedMinor(Math.abs(fee) / 100, p.snapshot.gbpPerMzn, true);
    else issues.push('Historical provider fee exchange rate is missing');
    return {
      paymentId: p.id,
      provider: p.provider,
      currency: p.currency,
      grossMinor: moneyMinor(p.amount),
      feeMinor: fee,
      refundedMinor: refundMinor,
      netMinor: fee === null ? null : moneyMinor(p.amount) - fee - refundMinor,
    };
  });
  if (providerFeeMzn !== 0 && costs.some((c) => c.kind === 'PAYMENT_FEE'))
    issues.push('Both provider and manual processing fees recorded; reverse the duplicate');
  if (costs.filter((c) => c.kind === 'COURIER').length > 1)
    issues.push('Multiple courier costs recorded; check for duplicate charges');
  const sellerLiability = refunded
    ? 0
    : safeSum(
        items
          .filter((i) => i.ownership_type !== 'STREET_CULTURE')
          .map((i) => moneyMinor(i.seller_net_amount))
      );
  const paidToSellers = safeSum(
    order.payouts
      .filter((p) => p.status === 'PAID' && p.currency === 'MZN')
      .map((p) => moneyMinor(p.net_amount))
  );
  const commission = refunded
    ? 0
    : safeSum(
        items
          .filter((i) => i.ownership_type !== 'STREET_CULTURE')
          .map((i) => moneyMinor(i.commission_amount))
      );
  const gross = moneyMinor(order.subtotal) + moneyMinor(order.shipping_amount);
  const refunds = refunded ? moneyMinor(order.total_amount) : 0;
  const netSales = gross - moneyMinor(order.discount_amount) - refunds;
  const retainedRevenue = netSales - sellerLiability - moneyMinor(order.review?.sales_tax_mzn ?? 0);
  // An evidenced manual order COGS total replaces the frozen unit total; never add both.
  const cogs = manualCogs.length
    ? sumKind('COGS')
    : safeSum(ownItems.map((i) => moneyMinor(i.unit_cost_mzn ?? 0) * i.quantity));
  const grossProfit = retainedRevenue - cogs;
  const processingFees = providerFeeMzn + sumKind('PAYMENT_FEE');
  const operatingCosts =
    processingFees +
    sumKind('COURIER') +
    sumKind('PACKAGING') +
    sumKind('OTHER_DIRECT') +
    sumKind('TRANSFER_FEE');
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    grossMinor: gross,
    discountsMinor: moneyMinor(order.discount_amount),
    refundsMinor: refunds,
    netSalesMinor: netSales,
    sellerLiabilityMinor: sellerLiability,
    sellerDueMinor: sellerLiability - paidToSellers,
    commissionMinor: commission,
    retainedRevenueMinor: retainedRevenue,
    cogsMinor: cogs,
    processingFeesMinor: processingFees,
    operatingCostsMinor: operatingCosts,
    grossProfitMinor: issues.length ? null : grossProfit,
    contributionMinor: grossProfit - operatingCosts,
    operatingProfitMinor: issues.length ? null : grossProfit - operatingCosts,
    issues: [...new Set(issues)],
    cash,
  };
}

export function financeTotals(workspace: z.infer<typeof financeWorkspaceSchema>) {
  const rows = workspace.orders.map((o) => orderProfit(o, workspace.costs));
  const periodCosts = activeCosts(workspace.costs).filter((c) => c.order_id === null);
  const overhead = safeSum(
    periodCosts.filter((c) => c.kind !== 'INCOME_TAX').map((c) => signedMinor(c.amount_mzn))
  );
  const incomeTax = safeSum(
    periodCosts.filter((c) => c.kind === 'INCOME_TAX').map((c) => signedMinor(c.amount_mzn))
  );
  const beforeTax = safeSum(rows.map((r) => r.contributionMinor)) - overhead;
  return {
    rows,
    grossMinor: safeSum(rows.map((r) => r.grossMinor)),
    grossProfitMinor: rows.some((r) => r.grossProfitMinor === null)
      ? null
      : safeSum(rows.map((r) => r.grossProfitMinor!)),
    netSalesMinor: safeSum(rows.map((r) => r.netSalesMinor)),
    commissionMinor: safeSum(rows.map((r) => r.commissionMinor)),
    sellerDueMinor: safeSum(rows.map((r) => r.sellerDueMinor)),
    overheadMinor: overhead,
    outstandingCostMinor: safeSum(
      activeCosts(workspace.costs)
        .filter((c) => c.basis === 'ACTUAL' && !c.settlement)
        .map((c) => signedMinor(c.amount_mzn))
    ),
    recordedIncomeTaxMinor: incomeTax,
    resultBeforeTaxMinor: beforeTax,
    resultAfterRecordedTaxMinor: beforeTax - incomeTax,
    incompleteOrders: rows.filter((r) => r.issues.length).length,
    estimatedPeriodCosts: periodCosts.filter((c) => c.basis !== 'ACTUAL').length,
  };
}
