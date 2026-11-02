// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';

const url = process.env.LOCAL_SUPABASE_TEST_URL;
const key = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
const destination = {
  country: 'MZ',
  province: 'Maputo',
  city: 'Maputo',
  local_area: 'Central',
  postal_code: '1100',
  address_line_1: 'Fixture Road 1',
  address_line_2: '',
  address_type: 'residential',
};
const session = randomBytes(32).toString('hex');
const methodId = 'a0000000-0000-0000-0000-000000000001';

describe.runIf(Boolean(url && key))(
  'immutable quoted checkout and conservative release (isolated PostgreSQL)',
  () => {
    let db: SupabaseClient<Database>;
    let operator: SupabaseClient<Database>;
    beforeAll(async () => {
      db = createClient<Database>(url!, key!, { auth: { persistSession: false } });
      const email = `sprint1-operator-${randomUUID()}@example.invalid`;
      const password = `Test-${randomBytes(12).toString('hex')}`;
      const account = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (account.error || !account.data.user) throw account.error;
      must(await db.from('user_roles').insert({ user_id: account.data.user.id, role: 'ADMIN' }));
      operator = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
        auth: { persistSession: false },
      });
      must(await operator.auth.signInWithPassword({ email, password }));
    });

    function must<T extends { data: unknown; error: unknown }>(result: T): NonNullable<T['data']> {
      if (result.error) throw result.error;
      return result.data as NonNullable<T['data']>;
    }
    async function listing(price = 78.5) {
      const id = randomUUID();
      must(
        await db.from('listings').insert({
          id,
          product_id: 'd0000000-0000-0000-0000-000000000001',
          variant_id: 'f0000000-0000-0000-0000-000000000001',
          ownership_type: 'STREET_CULTURE',
          condition: 'NEW',
          status: 'LIVE',
          asking_price: price,
          currency: 'MZN',
          quantity: 1,
          authentication_status: 'PASSED',
          published_at: new Date().toISOString(),
        })
      );
      return { listing_id: id, size: '10.5', quantity: 1, expected_price: price };
    }
    async function quote(
      item: Awaited<ReturnType<typeof listing>> | Awaited<ReturnType<typeof listing>>[],
      courier = false
    ) {
      const result = await db.rpc('issue_checkout_shipping_quote', {
        target_session_hash: session,
        target_user_id: null as unknown as string,
        target_destination: destination,
        target_items: Array.isArray(item) ? item : [item],
        target_provider: courier ? 'internet_express' : 'configured',
        target_service_code: courier ? 'IE_12' : 'TEST_MZ',
        target_service_name: courier ? 'Test courier response' : 'Test delivery',
        target_shipping_method_id: (courier ? null : methodId) as unknown as string,
        target_parcels: courier ? [{ submitted_weight_kg: 2 }] : [],
        target_provider_references: { fixture: true },
        target_provider_amount: courier ? 100.25 : 125.25,
        target_provider_currency: courier ? 'ZAR' : 'MZN',
        target_amount_mzn: courier ? 401 : 125.25,
        target_exchange_rate: courier ? 0.25 : 1,
        target_exchange_updated_at: new Date().toISOString(),
        target_min_days: 1,
        target_max_days: 3,
      });
      return must(result)[0].quote_id;
    }
    function request(
      item: Awaited<ReturnType<typeof listing>> | Awaited<ReturnType<typeof listing>>[],
      quoteId: string
    ) {
      return {
        target_order_id: randomUUID(),
        target_order_number: `SC${randomBytes(5).toString('hex').toUpperCase()}`,
        target_access_token_hash: randomBytes(32).toString('hex'),
        target_guest_name: 'Synthetic Buyer',
        target_guest_email: 'synthetic@example.invalid',
        target_guest_phone: '258841234567',
        target_shipping_snapshot: destination,
        target_shipping_method_code: 'TEST_MZ',
        target_items: Array.isArray(item) ? item : [item],
        target_shipping_quote_id: quoteId,
        target_session_hash: session,
      };
    }
    async function reserve(price = 874.75) {
      const item = await listing(price);
      const id = await quote(item);
      const payload = request(item, id);
      must(await db.rpc('create_quoted_checkout_order', payload));
      return { item, orderId: payload.target_order_id, payload, quoteId: id };
    }
    async function payment(orderId: string, provider: 'square' | 'mpesa' = 'square', amount = 10) {
      return must(
        await db
          .from('payments')
          .insert({
            order_id: orderId,
            provider,
            status: 'PENDING',
            amount,
            currency: provider === 'mpesa' ? 'MZN' : 'GBP',
            idempotency_key: randomUUID(),
            provider_payload:
              provider === 'square'
                ? { amountMinor: 1000, orderTotalMzn: 1000, gbpPerMzn: 0.01 }
                : {},
            provider_reference:
              provider === 'mpesa' ? `TEST${randomBytes(6).toString('hex')}` : null,
          })
          .select('id')
          .single()
      ).id;
    }
    async function expire(orderId: string) {
      const past = new Date(Date.now() - 60000).toISOString();
      must(await db.from('orders').update({ payment_expires_at: past }).eq('id', orderId));
      must(
        await db
          .from('listings')
          .update({ reservation_expires_at: past })
          .eq('reserved_by_order_id', orderId)
      );
    }
    async function status(orderId: string) {
      return must(
        await db
          .from('orders')
          .select('status,payment_status,total_amount,shipping_amount,shipping_method_snapshot')
          .eq('id', orderId)
          .single()
      );
    }

    it('consumes one quote atomically, preserves exact cents and replays the same concurrent retry', async () => {
      const item = await listing();
      const quoteId = await quote(item);
      const payload = request(item, quoteId);
      const results = await Promise.all([
        db.rpc('create_quoted_checkout_order', payload),
        db.rpc('create_quoted_checkout_order', payload),
      ]);
      for (const result of results)
        expect(must(result)[0]).toMatchObject({
          created_total: 203.75,
          created_shipping: 125.25,
          created_order_id: payload.target_order_id,
        });
      const events = must(
        await db
          .from('order_events')
          .select('id')
          .eq('order_id', payload.target_order_id)
          .eq('event_type', 'ORDER_CREATED')
      );
      expect(events).toHaveLength(1);
      expect(
        (await db.rpc('create_quoted_checkout_order', request(item, quoteId))).error?.message
      ).toMatch(/quote/);
      expect(
        (
          await db.rpc('create_quoted_checkout_order', {
            ...payload,
            target_guest_email: 'changed@example.invalid',
          })
        ).error?.message
      ).toMatch(/retry/);
      expect(
        (
          await db.rpc('create_quoted_checkout_order', {
            ...payload,
            target_session_hash: 'b'.repeat(64),
          })
        ).error?.message
      ).toMatch(/retry/);
    });

    it('rejects changed destination/cart/price/session without creating orders or consuming the quote', async () => {
      const item = await listing();
      const quoteId = await quote(item);
      const base = request(item, quoteId);
      const mutations = [
        { target_shipping_snapshot: { ...destination, city: 'Another city' } },
        { target_shipping_snapshot: { ...destination, country: 'ZA' } },
        { target_items: [{ ...item, expected_price: 78.51 }] },
        { target_items: [{ ...item, size: 'OS' }] },
        { target_items: [{ ...item, quantity: 2 }] },
        { target_session_hash: 'a'.repeat(64) },
      ];
      for (const mutation of mutations)
        expect(
          (await db.rpc('create_quoted_checkout_order', { ...base, ...mutation })).error
        ).not.toBeNull();
      expect(must(await db.from('orders').select('id').eq('id', base.target_order_id))).toEqual([]);
      expect(
        must(await db.from('checkout_shipping_quotes').select('status').eq('id', quoteId).single())
          .status
      ).toBe('AVAILABLE');
      must(await db.rpc('create_quoted_checkout_order', base));
    });

    it('makes quote amounts immutable and excludes anonymous/customers from quote/RPC access', async () => {
      const item = await listing();
      const quoteId = await quote(item);
      expect(
        (await db.from('checkout_shipping_quotes').update({ amount_mzn: 0 }).eq('id', quoteId))
          .error?.message
      ).toMatch(/immutable/);
      const anonymous = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
        auth: { persistSession: false },
      });
      expect((await anonymous.from('checkout_shipping_quotes').select('*')).error).not.toBeNull();
      expect(
        (await anonymous.rpc('create_quoted_checkout_order', request(item, quoteId))).error
      ).not.toBeNull();
      expect(
        (await operator.rpc('create_quoted_checkout_order', request(item, quoteId))).error
      ).not.toBeNull();
    });

    it('rejects expired quotes and invalid precision or stale FX', async () => {
      const item = await listing();
      const quoteId = await quote(item);
      const original = must(
        await db.from('checkout_shipping_quotes').select('*').eq('id', quoteId).single()
      );
      const expiredId = randomUUID();
      const { status: _status, ...row } = original;
      must(
        await db.from('checkout_shipping_quotes').insert({
          ...row,
          id: expiredId,
          exchange_updated_at: new Date(Date.now() - 660000).toISOString(),
          created_at: new Date(Date.now() - 660000).toISOString(),
          expires_at: new Date(Date.now() - 60000).toISOString(),
        })
      );
      expect(
        (await db.rpc('create_quoted_checkout_order', request(item, expiredId))).error?.message
      ).toMatch(/quote expired/);
      expect(
        (
          await db.from('checkout_shipping_quotes').insert({
            ...row,
            id: randomUUID(),
            exchange_updated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
          })
        ).error
      ).not.toBeNull();
    });

    it('accepts a stored courier-derived quote without calling a live provider', async () => {
      const item = await listing();
      const id = await quote(item, true);
      const payload = { ...request(item, id), target_shipping_method_code: 'IE_12' };
      const result = must(await db.rpc('create_quoted_checkout_order', payload))[0];
      expect(result.created_total).toBe(479.5);
      expect((await status(payload.target_order_id)).shipping_method_snapshot).toMatchObject({
        quote_id: id,
        provider: 'internet_express',
        provider_currency: 'ZAR',
        exchange_rate: 0.25,
        price: 401,
      });
      expect((await status(payload.target_order_id)).shipping_method_snapshot).not.toHaveProperty(
        'provider_references'
      );
      expect(
        (
          await db.from('payments').insert({
            order_id: payload.target_order_id,
            provider: 'mpesa',
            status: 'PENDING',
            amount: 479.5,
            currency: 'MZN',
          })
        ).error?.message
      ).toMatch(/whole-MZN/);
    });

    it('keeps unknown Square outcomes held across automatic expiry and both manual release paths, with escalation', async () => {
      const { orderId, item } = await reserve();
      const paymentId = await payment(orderId);
      expect(
        must(await db.rpc('claim_square_checkout_payment', { target_payment_id: paymentId }))
      ).toBe(true);
      await expire(orderId);
      must(await db.rpc('release_expired_listing_reservations'));
      expect((await status(orderId)).status).toBe('PENDING');
      expect(
        (
          await operator.rpc('operate_order', {
            target_order_id: orderId,
            order_action: 'CANCEL',
            operator_note: 'Testing uncertain payment protection',
          })
        ).error?.message
      ).toMatch(/cannot be released/);
      await expire(orderId);
      expect(
        (
          await operator.rpc('manage_inventory_listing', {
            target_listing_id: item.listing_id,
            inventory_action: 'RELEASE_EXPIRED',
            operator_note: 'Testing uncertain payment protection',
          })
        ).error?.message
      ).toMatch(/cannot be released/);
      must(
        await db
          .from('checkout_payment_holds')
          .update({ review_due_at: new Date(Date.now() - 60000).toISOString() })
          .eq('order_id', orderId)
      );
      must(await db.rpc('release_expired_listing_reservations'));
      const hold = must(
        await db.from('checkout_payment_holds').select('*').eq('order_id', orderId).single()
      );
      expect(hold.escalated_at).not.toBeNull();
      const notices = must(
        await db
          .from('admin_operational_notifications')
          .select('event_key')
          .like('event_key', `checkout-hold-escalation:${orderId}:%`)
      );
      expect(notices).toHaveLength(1);
    });

    it('protects a pending M-Pesa request and releases only after a definitive failure, exactly once', async () => {
      const { orderId, item } = await reserve();
      const paymentId = await payment(orderId, 'mpesa', 1000);
      await expire(orderId);
      must(await db.rpc('release_expired_listing_reservations'));
      expect((await status(orderId)).status).toBe('PENDING');
      for (let i = 0; i < 2; i++)
        expect(
          must(await db.rpc('fail_guest_checkout_payment', { target_payment_id: paymentId }))
        ).toBe(true);
      expect((await status(orderId)).status).toBe('CANCELLED');
      expect(
        must(await db.from('listings').select('status').eq('id', item.listing_id).single()).status
      ).toBe('LIVE');
      expect(
        must(
          await db
            .from('order_events')
            .select('id')
            .eq('order_id', orderId)
            .eq('event_type', 'PAYMENT_FAILED')
        )
      ).toHaveLength(2); // release + provider failure audit
    });

    it('never releases partial M-Pesa funds, including a failed later installment and expiry', async () => {
      const { orderId } = await reserve(149874.75); // exact total 150000
      const first = await payment(orderId, 'mpesa', 75000);
      expect(
        must(await db.rpc('complete_guest_checkout_payment', { target_payment_id: first }))
      ).toBe(false);
      const second = await payment(orderId, 'mpesa', 75000);
      must(await db.rpc('fail_guest_checkout_payment', { target_payment_id: second }));
      await expire(orderId);
      must(await db.rpc('release_expired_listing_reservations'));
      expect(await status(orderId)).toMatchObject({
        status: 'PENDING',
        payment_status: 'AUTHORIZED',
      });
      expect(
        (
          await operator.rpc('operate_order', {
            target_order_id: orderId,
            order_action: 'CANCEL',
            operator_note: 'Partial money must remain protected',
          })
        ).error
      ).not.toBeNull();
    });

    it('serializes payment claims against expiry; either outcome leaves a consistent reservation', async () => {
      for (let i = 0; i < 5; i++) {
        const { orderId, item } = await reserve();
        const paymentId = await payment(orderId);
        // Listing has expired while order is still open, so both paths could win.
        must(
          await db
            .from('listings')
            .update({ reservation_expires_at: new Date(Date.now() - 60000).toISOString() })
            .eq('id', item.listing_id)
        );
        const [claim, release] = await Promise.all([
          db.rpc('claim_square_checkout_payment', { target_payment_id: paymentId }),
          db.rpc('release_expired_listing_reservations'),
        ]);
        const claimed = must(claim);
        must(release);
        const order = await status(orderId);
        const stock = must(
          await db.from('listings').select('status').eq('id', item.listing_id).single()
        );
        expect(order.status).toBe(claimed ? 'PENDING' : 'CANCELLED');
        expect(stock.status).toBe(claimed ? 'RESERVED' : 'LIVE');
      }
    });
    it('balances fractional consignment commission and seller net without repricing the item', async () => {
      const account = await db.auth.admin.createUser({
        email: `fractional-seller-${randomUUID()}@example.invalid`,
        email_confirm: true,
      });
      if (account.error || !account.data.user) throw account.error;
      const sellerId = account.data.user.id;
      const submission = must(
        await db
          .from('consignment_submissions')
          .insert({
            seller_id: sellerId,
            brand_name: 'Test Vault',
            product_name: 'Fractional fixture',
            size: '10.5',
            size_system: 'US',
            condition: 'NEW',
            expected_price: 78.5,
            currency: 'MZN',
            status: 'LISTED',
          })
          .select('id')
          .single()
      );
      const item = await listing();
      must(
        await db
          .from('listings')
          .update({
            ownership_type: 'CONSIGNMENT',
            seller_id: sellerId,
            consignment_submission_id: submission.id,
          })
          .eq('id', item.listing_id)
      );
      const quoteId = await quote(item),
        payload = request(item, quoteId);
      must(await db.rpc('create_quoted_checkout_order', payload));
      expect(
        must(
          await db
            .from('order_items')
            .select('unit_price,commission_amount,seller_net_amount')
            .eq('order_id', payload.target_order_id)
            .single()
        )
      ).toMatchObject({ unit_price: 78.5, commission_amount: 23.55, seller_net_amount: 54.95 });
      const paymentId = must(
        await db
          .from('payments')
          .insert({
            order_id: payload.target_order_id,
            provider: 'square',
            status: 'PENDING',
            amount: 2.04,
            currency: 'GBP',
            idempotency_key: randomUUID(),
            provider_reference: `synthetic-${randomUUID()}`,
            last_provider_status: 'COMPLETED',
            provider_payload: {
              amountMinor: 204,
              orderTotalMzn: 203.75,
              gbpPerMzn: 0.01,
              square: { amountMinor: 204, currency: 'GBP', squareStatus: 'COMPLETED' },
            },
          })
          .select('id')
          .single()
      ).id;
      for (let i = 0; i < 2; i++)
        expect(
          must(await db.rpc('complete_square_checkout_payment', { target_payment_id: paymentId }))
        ).toBe(true);
      const payouts = must(
        await db
          .from('seller_payouts')
          .select('gross_amount,commission_amount,net_amount,status')
          .eq('listing_id', item.listing_id)
      );
      expect(payouts).toEqual([
        expect.objectContaining({
          gross_amount: 78.5,
          commission_amount: 23.55,
          net_amount: 54.95,
          status: 'PENDING',
        }),
      ]);
    });

    it('adds multiple fractional items and the accepted delivery price exactly', async () => {
      const items = [await listing(78.5), await listing(10.25)];
      const quoteId = await quote(items),
        payload = request([...items].reverse(), quoteId);
      expect(must(await db.rpc('create_quoted_checkout_order', payload))[0]).toMatchObject({
        created_subtotal: 88.75,
        created_shipping: 125.25,
        created_total: 214,
      });
      expect(
        must(await db.from('order_items').select('id').eq('order_id', payload.target_order_id))
      ).toHaveLength(2);
    });

    it('accounts for late Square success without releasing expired stock for resale', async () => {
      const { orderId, item } = await reserve(),
        paymentId = await payment(orderId);
      must(await db.rpc('claim_square_checkout_payment', { target_payment_id: paymentId }));
      await expire(orderId);
      must(
        await db
          .from('payments')
          .update({
            provider_reference: `synthetic-${paymentId}`,
            last_provider_status: 'COMPLETED',
            provider_payload: {
              amountMinor: 1000,
              orderTotalMzn: 1000,
              gbpPerMzn: 0.01,
              square: { amountMinor: 1000, currency: 'GBP', squareStatus: 'COMPLETED' },
            },
          })
          .eq('id', paymentId)
      );
      for (let i = 0; i < 2; i++)
        expect(
          must(await db.rpc('complete_square_checkout_payment', { target_payment_id: paymentId }))
        ).toBe(false);
      expect(await status(orderId)).toMatchObject({ payment_status: 'PAID', status: 'CANCELLED' });
      must(await db.rpc('release_expired_listing_reservations'));
      expect(
        must(await db.from('listings').select('status').eq('id', item.listing_id).single()).status
      ).toBe('RESERVED');
      expect(
        must(
          await db.from('checkout_payment_holds').select('reason').eq('order_id', orderId).single()
        ).reason
      ).toBe('RECEIVED_OR_REFUNDED_FUNDS');
      expect(
        must(
          await db
            .from('order_events')
            .select('id')
            .eq('order_id', orderId)
            .eq('event_type', 'PAYMENT_CONFIRMED')
        )
      ).toHaveLength(1);
    });

    it('releases a Square hold only after a definitive failure, and serializes manual/automatic release', async () => {
      const { orderId, item } = await reserve(),
        paymentId = await payment(orderId);
      must(await db.rpc('claim_square_checkout_payment', { target_payment_id: paymentId }));
      await expire(orderId);
      must(await db.rpc('release_expired_listing_reservations'));
      expect(
        must(await db.rpc('fail_square_checkout_payment', { target_payment_id: paymentId }))
      ).toBe(true);
      await expire(orderId);
      const [manual, automatic] = await Promise.all([
        operator.rpc('manage_inventory_listing', {
          target_listing_id: item.listing_id,
          inventory_action: 'RELEASE_EXPIRED',
          operator_note: 'Definitive provider failure verified by finance',
        }),
        db.rpc('release_expired_listing_reservations'),
      ]);
      expect(!manual.error || !automatic.error).toBe(true);
      expect(await status(orderId)).toMatchObject({
        status: 'CANCELLED',
        payment_status: 'FAILED',
      });
      expect(
        must(await db.from('listings').select('status').eq('id', item.listing_id).single()).status
      ).toBe('LIVE');
      expect(
        must(
          await db
            .from('order_events')
            .select('id')
            .eq('order_id', orderId)
            .eq('event_type', 'RESERVATION_EXPIRED')
        )
      ).toHaveLength(1);
    });

    it('blocks direct inventory release for a referenced Square request even before its status is reconciled', async () => {
      const { orderId, item } = await reserve(),
        paymentId = await payment(orderId);
      must(
        await db
          .from('payments')
          .update({ provider_reference: `unknown-${randomUUID()}` })
          .eq('id', paymentId)
      );
      expect(
        must(await db.rpc('checkout_release_block_reason', { target_order_id: orderId }))
      ).toBe('PAYMENT_OUTCOME_UNRESOLVED');
      const direct = await db
        .from('listings')
        .update({
          status: 'LIVE',
          reserved_by_order_id: null,
          reservation_expires_at: null,
          reserved_at: null,
        })
        .eq('id', item.listing_id);
      expect(direct.error).not.toBeNull();
      expect(
        must(await db.from('listings').select('status').eq('id', item.listing_id).single()).status
      ).toBe('RESERVED');
    });
  }
);
