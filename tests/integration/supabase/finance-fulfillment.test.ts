// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';
import { financeWorkspaceSchema, financeTotals } from '@/lib/finance/profit';
const url = process.env.LOCAL_SUPABASE_TEST_URL,
  key = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
describe.runIf(Boolean(url && key))(
  'finance and fulfillment safeguards in isolated PostgreSQL',
  () => {
    let db: SupabaseClient<Database>,
      admin: SupabaseClient<Database>,
      finance: SupabaseClient<Database>,
      support: SupabaseClient<Database>,
      customer: SupabaseClient<Database>,
      buyerId: string;
    const address = {
      name: 'Isolated Buyer',
      email: 'buyer@example.invalid',
      phone: '+27110000000',
      address_line_1: 'Example street 1',
      address_line_2: '',
      local_area: 'Example area',
      city: 'Johannesburg',
      province: 'Gauteng',
      postal_code: '2000',
      country: 'ZA',
      address_type: 'residential',
    };
    const origin = { ...address, name: 'Isolated Warehouse', email: 'warehouse@example.invalid' };
    const note = 'Evidence checked in isolated test only';
    const must = <T extends { data: unknown; error: unknown }>(
      result: T
    ): NonNullable<T['data']> => {
      if (result.error) throw result.error;
      return result.data as NonNullable<T['data']>;
    };
    beforeAll(async () => {
      db = createClient<Database>(url!, key!, { auth: { persistSession: false } });
      const user = async (role?: Database['public']['Enums']['app_role']) => {
        const email = `ops-${randomUUID()}@example.invalid`,
          password = `Test-${randomBytes(12).toString('hex')}`;
        const created = must(
          await db.auth.admin.createUser({ email, password, email_confirm: true })
        );
        if (role) must(await db.from('user_roles').insert({ user_id: created.user!.id, role }));
        const client = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
          auth: { persistSession: false },
        });
        must(await client.auth.signInWithPassword({ email, password }));
        return { client, id: created.user!.id };
      };
      admin = (await user('ADMIN')).client;
      finance = (await user('FINANCE')).client;
      support = (await user('SUPPORT')).client;
      const buyer = await user();
      customer = buyer.client;
      buyerId = buyer.id;
    });
    async function order(privateCost?: number) {
      const id = randomUUID(),
        listing = randomUUID();
      must(
        await db.from('listings').insert({
          id: listing,
          product_id: 'd0000000-0000-0000-0000-000000000001',
          variant_id: 'f0000000-0000-0000-0000-000000000001',
          ownership_type: 'STREET_CULTURE',
          condition: 'NEW',
          asking_price: 100,
          currency: 'MZN',
          quantity: 1,
          status: 'DRAFT',
        })
      );
      if (privateCost !== undefined)
        must(
          await finance.rpc('set_inventory_cost_price', {
            target_listing_id: listing,
            expected_revision: 0,
            target_cost: {
              amount: privateCost,
              currency: 'MZN',
              mzn_per_unit: 1,
              reference: 'Isolated stock invoice',
            },
          })
        );
      must(
        await db.from('orders').insert({
          id,
          user_id: buyerId,
          order_number: `SC${randomBytes(4).toString('hex').toUpperCase()}`,
          status: 'PENDING',
          payment_status: 'UNPAID',
          subtotal: 100,
          shipping_amount: 10,
          total_amount: 110,
          currency: 'MZN',
          created_at: '2026-10-19T10:00:00Z',
          payment_expires_at: new Date(Date.now() + 900000).toISOString(),
          shipping_address_snapshot: address,
          shipping_method_snapshot: { code: 'IE_TEST', name: 'Test service' },
        })
      );
      must(
        await db.from('order_items').insert({
          order_id: id,
          listing_id: listing,
          product_id: 'd0000000-0000-0000-0000-000000000001',
          variant_id: 'f0000000-0000-0000-0000-000000000001',
          product_name_snapshot: 'Isolated stock',
          brand_name_snapshot: 'Test',
          size_snapshot: 'OS',
          condition_snapshot: 'NEW',
          quantity: 1,
          unit_price: 100,
          commission_amount: 0,
          seller_net_amount: 100,
        })
      );
      must(
        await db.from('payments').insert({
          order_id: id,
          provider: 'square',
          status: 'SUCCEEDED',
          provider_reference: `isolated-${randomUUID()}`,
          amount: 1.1,
          currency: 'GBP',
          idempotency_key: randomUUID(),
          paid_at: new Date().toISOString(),
          provider_payload: {
            gbpPerMzn: 0.01,
            square: { processingFees: [{ amountMinor: 3, currency: 'GBP' }] },
          },
        })
      );
      must(
        await db.from('orders').update({ status: 'CONFIRMED', payment_status: 'PAID' }).eq('id', id)
      );
      return id;
    }
    async function job(id: string) {
      return must(await db.from('fulfillment_jobs').select('*').eq('order_id', id).single());
    }
    async function ready(id: string) {
      must(
        await admin.rpc('advance_order_fulfillment', {
          target_order_id: id,
          fulfillment_action: 'START_PROCESSING',
          operator_note: note,
        })
      );
      must(
        await admin.rpc('advance_order_fulfillment', {
          target_order_id: id,
          fulfillment_action: 'MARK_PACKED',
          operator_note: note,
        })
      );
      must(
        await admin.rpc('fulfillment_operate', {
          target_order_id: id,
          operation: 'SAVE',
          payload: {
            note,
            revision: (await job(id)).revision,
            address,
            origin,
            parcels: [
              {
                submitted_length_cm: 10,
                submitted_width_cm: 10,
                submitted_height_cm: 10,
                submitted_weight_kg: 1,
              },
            ],
            address_confirmed: true,
            origin_confirmed: true,
            packed_confirmed: true,
          },
        })
      );
      must(
        await admin.rpc('fulfillment_operate', {
          target_order_id: id,
          operation: 'APPROVE',
          payload: { note, revision: (await job(id)).revision, max_cost_mzn: 1000 },
        })
      );
      return job(id);
    }
    it('creates one durable review draft and one email intent for a newly confirmed paid order', async () => {
      const id = await order();
      expect((await job(id)).state).toBe('REVIEW');
      must(await db.from('orders').update({ status: 'CONFIRMED' }).eq('id', id));
      expect(must(await db.from('fulfillment_jobs').select('id').eq('order_id', id))).toHaveLength(
        1
      );
      expect(
        must(await db.from('order_message_outbox').select('id').eq('order_id', id))
      ).toHaveLength(2);
    });
    it('denies customers and support access to financial data and functions', async () => {
      expect(
        (
          await customer.rpc('finance_workspace', {
            date_from: '2026-01-01',
            date_to: '2026-12-31',
          })
        ).error
      ).not.toBeNull();
      expect(
        (await support.rpc('finance_record', { action: 'BALANCE', payload: {} })).error
      ).not.toBeNull();
      expect(must(await customer.from('finance_cost_entries').select('*'))).toEqual([]);
      expect((await customer.rpc('claim_order_email')).error).not.toBeNull();
    });
    it('records costs idempotently, detects changed retries, and appends reversals without changing originals', async () => {
      const id = await order(),
        requestId = randomUUID();
      const payload = {
        request_id: requestId,
        order_id: id,
        kind: 'COGS',
        amount: 50,
        currency: 'MZN',
        mzn_per_unit: 1,
        basis: 'ACTUAL',
        reference: 'Isolated inventory invoice',
        incurred_on: '2026-10-19',
      };
      const first = must(await finance.rpc('finance_record', { action: 'COST', payload }));
      expect(must(await finance.rpc('finance_record', { action: 'COST', payload }))).toBe(first);
      expect(
        (
          await finance.rpc('finance_record', {
            action: 'COST',
            payload: { ...payload, amount: 51 },
          })
        ).error
      ).not.toBeNull();
      must(
        await finance.rpc('finance_record', {
          action: 'REVERSE',
          payload: {
            request_id: randomUUID(),
            entry_id: first,
            reference: 'Correcting isolated invoice',
          },
        })
      );
      expect(
        must(await finance.from('finance_cost_entries').select('amount').eq('id', first).single())
          .amount
      ).toBe(50);
    });
    it('does not let a bookable label bypass physical handover or paid-order holds', async () => {
      const id = await order();
      await ready(id);
      expect(
        (
          await admin.rpc('advance_order_fulfillment', {
            target_order_id: id,
            fulfillment_action: 'MARK_SHIPPED',
            operator_note: note,
          })
        ).error
      ).not.toBeNull();
      must(
        await db
          .from('checkout_payment_holds')
          .insert({ order_id: id, reason: 'Isolated review hold' })
      );
      expect(
        must(await db.rpc('claim_fulfillment_booking', { target_job_id: (await job(id)).id }))
      ).toEqual([]);
    });
    it('serializes worker claims and never retries an expired booking lease', async () => {
      const id = await order(),
        j = await ready(id);
      const results = await Promise.all([
        db.rpc('claim_fulfillment_booking', { target_job_id: j.id }),
        db.rpc('claim_fulfillment_booking', { target_job_id: j.id }),
      ]);
      expect(results.every((r) => !r.error)).toBe(true);
      expect(results.reduce((sum, r) => sum + (r.data?.length ?? 0), 0)).toBe(1);
      must(
        await db
          .from('fulfillment_jobs')
          .update({ lease_until: '2020-01-01T00:00:00Z' })
          .eq('id', j.id)
      );
      expect(must(await db.rpc('claim_fulfillment_booking', { target_job_id: j.id }))).toEqual([]);
      expect((await job(id)).state).toBe('BOOKING_UNKNOWN');
    });
    it('records an accepted courier result and expense without marking the order shipped', async () => {
      const id = await order(),
        j = await ready(id);
      const claimed = must(await db.rpc('claim_fulfillment_booking', { target_job_id: j.id }))[0];
      must(
        await db.rpc('finish_fulfillment_booking', {
          target_job_id: j.id,
          target_lease: claimed.lease_token!,
          outcome: 'BOOKED',
          booking: {
            provider_reference: `TEST-${randomUUID()}`,
            document_reference: 'Isolated label',
            tracking_url: '',
            cost: 20,
            currency: 'ZAR',
            mzn_per_unit: 4,
          },
        })
      );
      expect((await job(id)).state).toBe('BOOKED');
      expect(
        must(await db.from('orders').select('status,fulfillment_status').eq('id', id).single())
      ).toMatchObject({ status: 'PACKED', fulfillment_status: 'PACKED' });
      expect(
        must(
          await finance
            .from('finance_cost_entries')
            .select('amount_mzn')
            .eq('order_id', id)
            .eq('kind', 'COURIER')
            .single()
        ).amount_mzn
      ).toBe(80);
    });
    it('requires handover and delivery evidence and never fabricates delivery from a booking', async () => {
      const id = await order(),
        j = await ready(id);
      must(
        await admin.rpc('fulfillment_operate', {
          target_order_id: id,
          operation: 'IMPORT_BOOKING',
          payload: {
            note,
            revision: j.revision,
            cost_confirmed: true,
            provider_reference: `TEST-${randomUUID()}`,
            document_reference: 'Isolated label invoice',
            tracking_url: '',
            courier_cost: 20,
            courier_currency: 'ZAR',
            courier_mzn_per_unit: 4,
          },
        })
      );
      expect(
        (
          await admin.rpc('fulfillment_operate', {
            target_order_id: id,
            operation: 'DELIVERED',
            payload: {
              note,
              revision: (await job(id)).revision,
              evidence_reference: 'No handover',
            },
          })
        ).error
      ).not.toBeNull();
      must(
        await admin.rpc('fulfillment_operate', {
          target_order_id: id,
          operation: 'COLLECTED',
          payload: {
            note,
            revision: (await job(id)).revision,
            evidence_reference: 'Isolated signed handover',
          },
        })
      );
      expect(must(await db.from('orders').select('status').eq('id', id).single()).status).toBe(
        'SHIPPED'
      );
      must(
        await admin.rpc('fulfillment_operate', {
          target_order_id: id,
          operation: 'DELIVERED',
          payload: {
            note,
            revision: (await job(id)).revision,
            evidence_reference: 'Isolated signed POD',
          },
        })
      );
      expect(must(await db.from('orders').select('status').eq('id', id).single()).status).toBe(
        'DELIVERED'
      );
    });
    it('preserves the paid-order destination when a draft amendment fails validation', async () => {
      const id = await order();
      await ready(id);
      expect(
        (
          await admin.rpc('fulfillment_operate', {
            target_order_id: id,
            operation: 'SAVE',
            payload: {
              note,
              revision: (await job(id)).revision,
              address: { ...address, province: 'Johannesburg' },
              origin,
              parcels: [{ submitted_length_cm: 10 }],
              address_confirmed: true,
              origin_confirmed: true,
              packed_confirmed: true,
            },
          })
        ).error
      ).not.toBeNull();
      expect(
        must(await db.from('orders').select('shipping_address_snapshot').eq('id', id).single())
          .shipping_address_snapshot
      ).toEqual(address);
    });
    it('shows finance reviewed only when actual costs and explicit tax treatment are present', async () => {
      const id = await order();
      for (const [kind, amount] of [
        ['COGS', 50],
        ['COURIER', 9],
      ] as const)
        must(
          await finance.rpc('finance_record', {
            action: 'COST',
            payload: {
              request_id: randomUUID(),
              order_id: id,
              kind,
              amount,
              currency: 'MZN',
              mzn_per_unit: 1,
              basis: 'ACTUAL',
              reference: 'Isolated cost evidence',
              incurred_on: '2026-10-19',
            },
          })
        );
      must(
        await finance.rpc('finance_record', {
          action: 'REVIEW',
          payload: { order_id: id, costs_complete: true, sales_tax_mzn: 0, note },
        })
      );
      const report = financeTotals(
        financeWorkspaceSchema.parse(
          must(
            await finance.rpc('finance_workspace', {
              date_from: '2026-01-01',
              date_to: '2026-12-31',
            })
          )
        )
      );
      expect(report.rows.find((r) => r.orderId === id)).toMatchObject({
        grossProfitMinor: 6000,
        operatingProfitMinor: 4800,
        issues: [],
      });
    });
    it('records invoice payment as evidence, not another expense or a money transfer', async () => {
      const id = await order();
      const entry = must(
        await finance.rpc('finance_record', {
          action: 'COST',
          payload: {
            request_id: randomUUID(),
            order_id: id,
            kind: 'PACKAGING',
            amount: 5,
            currency: 'MZN',
            mzn_per_unit: 1,
            basis: 'ACTUAL',
            reference: 'Isolated packaging invoice',
            incurred_on: '2026-10-19',
          },
        })
      );
      must(
        await finance.rpc('finance_record', {
          action: 'SETTLE',
          payload: {
            entry_id: entry,
            method: 'PAID',
            paid_on: '2026-10-19',
            reference: 'External bank evidence',
          },
        })
      );
      expect(
        must(await finance.from('finance_cost_entries').select('id').eq('order_id', id))
      ).toHaveLength(1);
      const report = financeWorkspaceSchema.parse(
        must(
          await finance.rpc('finance_workspace', { date_from: '2026-01-01', date_to: '2026-12-31' })
        )
      );
      expect(report.costs.find((c) => c.id === entry)?.settlement).toMatchObject({
        method: 'PAID',
        reference: 'External bank evidence',
      });
    });
    it('keeps purchase costs private and captures a frozen sale cost without exposing customer fields', async () => {
      const id = await order(40);
      const item = must(await db.from('order_items').select('*').eq('order_id', id).single());
      if (!item.listing_id) throw new Error('Fixture listing missing');
      const snapshot = must(
        await finance
          .from('order_item_cost_snapshots')
          .select('unit_cost_mzn')
          .eq('order_item_id', item.id)
          .single()
      );
      expect(snapshot.unit_cost_mzn).toBe(40);
      expect(item).not.toHaveProperty('unit_cost_mzn');
      expect(
        (await customer.from('inventory_cost_prices').select('*').eq('listing_id', item.listing_id))
          .data
      ).toEqual([]);
      expect(
        (await support.from('order_item_cost_snapshots').select('*').eq('order_item_id', item.id))
          .data
      ).toEqual([]);
      const anon = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
        auth: { persistSession: false },
      });
      expect((await anon.from('inventory_cost_prices').select('*')).error).not.toBeNull();
      expect(
        (
          await support.rpc('set_inventory_cost_price', {
            target_listing_id: item.listing_id,
            expected_revision: 1,
            target_cost: {
              amount: 1,
              currency: 'MZN',
              mzn_per_unit: 1,
              reference: 'Not permitted',
            },
          })
        ).error?.code
      ).toBe('42501');
      expect(
        (
          await finance.rpc('set_inventory_cost_price', {
            target_listing_id: item.listing_id,
            expected_revision: 1,
            target_cost: {
              amount: 1,
              currency: 'MZN',
              mzn_per_unit: 1,
              reference: 'Sold correction',
            },
          })
        ).error
      ).not.toBeNull();
      const report = financeWorkspaceSchema.parse(
        must(
          await finance.rpc('finance_workspace', { date_from: '2026-01-01', date_to: '2026-12-31' })
        )
      );
      expect(report.orders.find((o) => o.id === id)?.items[0].unit_cost_mzn).toBe(40);
      expect(financeTotals(report).rows.find((o) => o.orderId === id)?.cogsMinor).toBe(4000);
    });
    it('atomically creates optional costed stock and rejects stale or invalid private cost changes', async () => {
      const listing = must(
        await admin.rpc('create_costed_staff_inventory_draft', {
          target_product_id: 'd0000000-0000-0000-0000-000000000001',
          target_size: '10',
          target_size_system: 'UK',
          target_condition: 'NEW',
          target_asking_price: 100,
          target_cost: {
            amount: 5,
            currency: 'GBP',
            mzn_per_unit: 80,
            reference: 'Foreign purchase invoice',
          },
        })
      );
      expect(
        must(
          await finance
            .from('inventory_cost_prices')
            .select('amount_mzn')
            .eq('listing_id', listing)
            .single()
        ).amount_mzn
      ).toBe(400);
      const cost = { amount: 6, currency: 'GBP', mzn_per_unit: 80, reference: 'Corrected invoice' };
      expect(
        (
          await finance.rpc('set_inventory_cost_price', {
            target_listing_id: listing,
            expected_revision: 0,
            target_cost: cost,
          })
        ).error
      ).not.toBeNull();
      must(
        await finance.rpc('set_inventory_cost_price', {
          target_listing_id: listing,
          expected_revision: 1,
          target_cost: cost,
        })
      );
      expect(
        must(await finance.from('inventory_cost_history').select('id').eq('listing_id', listing))
      ).toHaveLength(2);
      expect(
        (
          await finance.rpc('set_inventory_cost_price', {
            target_listing_id: listing,
            expected_revision: 2,
            target_cost: { ...cost, amount: 6.001 },
          })
        ).error
      ).not.toBeNull();
      expect(
        (
          await finance.rpc('set_inventory_cost_price', {
            target_listing_id: listing,
            expected_revision: 2,
            target_cost: { ...cost, currency: 'MZN' },
          })
        ).error
      ).not.toBeNull();
    });
    it('rejects a second invoice entry after a reload creates a different request id', async () => {
      const id = await order();
      const payload = {
        request_id: randomUUID(),
        order_id: id,
        kind: 'COGS',
        amount: 10,
        currency: 'MZN',
        mzn_per_unit: 1,
        basis: 'ACTUAL',
        reference: 'Same unique invoice line',
        incurred_on: '2026-10-19',
      };
      must(await finance.rpc('finance_record', { action: 'COST', payload }));
      expect(
        (
          await finance.rpc('finance_record', {
            action: 'COST',
            payload: { ...payload, request_id: randomUUID() },
          })
        ).error
      ).not.toBeNull();
    });
    it('preserves a booked shipment when a cost variance needs exception approval', async () => {
      const id = await order(),
        j = await ready(id);
      const claimed = must(await db.rpc('claim_fulfillment_booking', { target_job_id: j.id }))[0];
      must(
        await db.rpc('finish_fulfillment_booking', {
          target_job_id: j.id,
          target_lease: claimed.lease_token!,
          outcome: 'BOOKED',
          booking: {
            provider_reference: `TEST-${randomUUID()}`,
            document_reference: 'Isolated accepted invoice',
            tracking_url: '',
            cost: 300,
            currency: 'ZAR',
            mzn_per_unit: 4,
          },
        })
      );
      expect((await job(id)).state).toBe('EXCEPTION');
      must(
        await admin.rpc('fulfillment_operate', {
          target_order_id: id,
          operation: 'RESOLVE_EXCEPTION',
          payload: {
            revision: (await job(id)).revision,
            note,
            resume_state: 'BOOKED',
            evidence_reference: 'Verified courier cost variance',
            max_cost_mzn: 1200,
          },
        })
      );
      expect((await job(id)).state).toBe('BOOKED');
      expect(must(await db.rpc('claim_fulfillment_booking', { target_job_id: j.id }))).toEqual([]);
    });
  }
);
