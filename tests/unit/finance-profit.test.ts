import { describe, expect, it } from 'vitest';
import {
  activeCosts,
  financeTotals,
  orderProfit,
  squareFeeMinor,
  type FinanceOrder,
  type FinanceCost,
} from '@/lib/finance/profit';
const item = {
  id: 'item',
  unit_price: 1000,
  quantity: 1,
  commission_amount: 200,
  seller_net_amount: 800,
  ownership_type: 'STREET_CULTURE',
};
function order(change: Partial<FinanceOrder> = {}): FinanceOrder {
  return {
    id: 'order',
    order_number: 'SCTEST',
    currency: 'MZN',
    subtotal: 1000,
    shipping_amount: 100,
    discount_amount: 0,
    total_amount: 1100,
    status: 'CONFIRMED',
    payment_status: 'PAID',
    created_at: '2026-10-19T10:00:00Z',
    items: [item],
    payments: [
      {
        id: 'payment',
        provider: 'square',
        status: 'SUCCEEDED',
        amount: 11,
        currency: 'GBP',
        paid_at: '2026-10-19T10:00:00Z',
        snapshot: {
          gbpPerMzn: 0.01,
          square: { processingFees: [{ amountMinor: 30, currency: 'GBP' }] },
        },
      },
    ],
    review: {
      costs_complete: true,
      sales_tax_mzn: 0,
      items_snapshot: [item],
      reviewed_at: '2026-10-19T10:00:00Z',
    },
    payouts: [],
    ...change,
  };
}
function cost(kind: string, value: number, change: Partial<FinanceCost> = {}): FinanceCost {
  return {
    id: kind,
    order_id: 'order',
    kind,
    amount: value,
    amount_mzn: value,
    currency: 'MZN',
    mzn_per_unit: 1,
    basis: 'ACTUAL',
    reference: 'Invoice evidence',
    incurred_on: '2026-10-19',
    reverses_id: null,
    settlement: null,
    created_at: '2026-10-19T09:00:00Z',
    ...change,
  };
}
const costs = [cost('COGS', 500), cost('COURIER', 90), cost('PACKAGING', 10)];
describe('management finance calculations', () => {
  it('uses frozen private unit costs and replaces them only with an evidenced order COGS total', () => {
    const privateItem = { ...item, unit_cost_mzn: 450 };
    const data = order({
      items: [privateItem],
      review: {
        costs_complete: true,
        sales_tax_mzn: 0,
        items_snapshot: [privateItem],
        reviewed_at: '2026-10-19T10:00:00Z',
      },
    });
    const withoutManual = orderProfit(
      data,
      costs.filter((c) => c.kind !== 'COGS')
    );
    expect(withoutManual.cogsMinor).toBe(45000);
    expect(withoutManual.issues).toEqual([]);
    expect(orderProfit(data, costs).cogsMinor).toBe(50000);
  });
  it('requires a cost for every owned unit, while accepting an explicitly confirmed zero cost', () => {
    const missing = { ...item, id: 'second', unit_cost_mzn: null };
    const known = { ...item, unit_cost_mzn: 0 };
    const noManual = costs.filter((c) => c.kind !== 'COGS');
    expect(
      orderProfit(order({ review: null, items: [known, missing] }), noManual).issues
    ).toContain('Purchase cost of store-owned stock is missing');
    expect(
      orderProfit(
        order({
          review: {
            costs_complete: true,
            sales_tax_mzn: 0,
            items_snapshot: [known],
            reviewed_at: '2026-10-19T10:00:00Z',
          },
        }),
        noManual
      ).issues
    ).toEqual([]);
  });
  it('tracks unpaid invoices separately without deducting an expense again when paid', () => {
    const before = financeTotals({ orders: [order()], costs, balances: [] });
    const after = financeTotals({
      orders: [order()],
      costs: costs.map((c) => ({
        ...c,
        settlement: { method: 'PAID' as const, paid_on: '2026-10-19', reference: 'Bank statement' },
      })),
      balances: [],
    });
    expect(before.outstandingCostMinor).toBe(60000);
    expect(after.outstandingCostMinor).toBe(0);
    expect(after.resultBeforeTaxMinor).toBe(before.resultBeforeTaxMinor);
  });
  it('separates gross profit, operating profit and provider proceeds', () => {
    const report = orderProfit(order(), costs);
    expect(report.grossMinor).toBe(110000);
    expect(report.grossProfitMinor).toBe(60000);
    expect(report.processingFeesMinor).toBe(3000);
    expect(report.operatingProfitMinor).toBe(47000);
    expect(report.cash[0].netMinor).toBe(1070);
    expect(report.issues).toEqual([]);
  });
  it('does not mistake an available Square balance for profit', () => {
    const data = {
      orders: [order()],
      costs,
      balances: [
        {
          provider: 'square',
          amount: 99999,
          currency: 'GBP',
          observed_at: '2026-10-19T10:00:00Z',
          reference: 'Manually reported',
        },
      ],
    };
    expect(financeTotals(data).resultBeforeTaxMinor).toBe(47000);
  });
  it('counts only commission as consignment merchandise revenue and never deducts payouts twice', () => {
    const consigned = { ...item, ownership_type: 'CONSIGNMENT' };
    const data = order({
      items: [consigned],
      review: {
        costs_complete: true,
        sales_tax_mzn: 0,
        items_snapshot: [consigned],
        reviewed_at: '2026-10-19T10:00:00Z',
      },
      payouts: [{ status: 'PAID', net_amount: 800, currency: 'MZN' }],
    });
    const report = orderProfit(
      data,
      costs.filter((c) => c.kind !== 'COGS')
    );
    expect(report.commissionMinor).toBe(20000);
    expect(report.sellerDueMinor).toBe(0);
    expect(report.retainedRevenueMinor).toBe(30000);
    expect(report.operatingProfitMinor).toBe(17000);
  });
  it('leaves purchase cost unknown rather than assuming free inventory', () => {
    const result = orderProfit(
      order(),
      costs.filter((c) => c.kind !== 'COGS')
    );
    expect(result.operatingProfitMinor).toBeNull();
    expect(result.issues.join(' ')).toContain('Purchase cost');
  });
  it('does not use the checkout quote as an actual courier invoice', () => {
    expect(
      orderProfit(
        order(),
        costs.filter((c) => c.kind !== 'COURIER')
      ).issues.join(' ')
    ).toContain('Actual courier cost');
  });
  it('distinguishes missing Square fees from an explicit zero fee', () => {
    expect(squareFeeMinor(null, 'GBP')).toBeNull();
    expect(squareFeeMinor({ square: { processingFees: [] } }, 'GBP')).toBe(0);
    expect(
      squareFeeMinor({ square: { processingFees: [{ amountMinor: 20, currency: 'USD' }] } }, 'GBP')
    ).toBeNull();
  });
  it('handles fee credits without taking an absolute value or charging twice', () => {
    expect(
      squareFeeMinor(
        {
          square: {
            processingFees: [
              { amountMinor: 40, currency: 'GBP' },
              { amountMinor: -10, currency: 'GBP' },
            ],
          },
        },
        'GBP'
      )
    ).toBe(30);
  });
  it('uses frozen payment FX, not a fresh market rate', () => {
    const changed = order();
    changed.payments[0].snapshot!.gbpPerMzn = 0.02;
    expect(orderProfit(changed, costs).processingFeesMinor).toBe(1500);
  });
  it('refuses to certify missing FX or unknown ownership', () => {
    const changed = order({ review: null, items: [{ ...item, ownership_type: null }] });
    delete changed.payments[0].snapshot!.gbpPerMzn;
    expect(orderProfit(changed, costs).operatingProfitMinor).toBeNull();
  });
  it('flags estimates and duplicate fee/courier entries', () => {
    const result = orderProfit(order(), [
      ...costs,
      cost('PAYMENT_FEE', 1),
      cost('COURIER', 2, { id: 'extra', basis: 'ESTIMATE' }),
    ]);
    expect(result.issues.join(' ')).toContain('duplicate');
    expect(result.operatingProfitMinor).toBeNull();
  });
  it('preserves original cost evidence and applies reversals once', () => {
    const reversal = cost('COGS', 500, { id: 'reversal', reverses_id: 'COGS' });
    expect(activeCosts([...costs, reversal]).map((c) => c.kind)).toEqual(['COURIER', 'PACKAGING']);
  });
  it('deducts period overhead and income tax once, outside order results', () => {
    const totals = financeTotals({
      orders: [order()],
      costs: [
        ...costs,
        cost('OVERHEAD', 50, { order_id: null }),
        cost('INCOME_TAX', 20, { order_id: null }),
      ],
      balances: [],
    });
    expect(totals.resultBeforeTaxMinor).toBe(42000);
    expect(totals.resultAfterRecordedTaxMinor).toBe(40000);
  });
  it('keeps refunds and return-cost accounting under review instead of inventing a completed profit', () => {
    const result = orderProfit(order({ status: 'REFUNDED', payment_status: 'REFUNDED' }), costs);
    expect(result.netSalesMinor).toBe(0);
    expect(result.operatingProfitMinor).toBeNull();
  });
});
