// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';
const url = process.env.LOCAL_SUPABASE_TEST_URL,
  key = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
describe.runIf(Boolean(url && key))('order communications in isolated PostgreSQL', () => {
  let db: SupabaseClient<Database>, customer: SupabaseClient<Database>;
  let buyerId: string;
  const operationId = `isolated-operation-${randomUUID()}`;
  const must = <T extends { data: unknown; error: unknown }>(result: T): NonNullable<T['data']> => {
    if (result.error) throw result.error;
    return result.data as NonNullable<T['data']>;
  };
  beforeAll(async () => {
    db = createClient<Database>(url!, key!, { auth: { persistSession: false } });
    customer = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const email = `notifications-${randomUUID()}@example.invalid`,
      password = randomBytes(20).toString('hex');
    buyerId = must(await db.auth.admin.createUser({ email, password, email_confirm: true })).user!
      .id;
    must(await customer.auth.signInWithPassword({ email, password }));
    must(
      await db
        .from('order_notification_channels')
        .update({ enabled: false, enabled_since: null })
        .in('channel', ['CUSTOMER_EMAIL', 'ADMIN_EMAIL', 'CUSTOMER_WHATSAPP'])
    );
  });
  afterAll(async () => {
    if (db)
      await db
        .from('order_notification_channels')
        .update({ enabled: false })
        .in('channel', ['CUSTOMER_EMAIL', 'ADMIN_EMAIL', 'CUSTOMER_WHATSAPP']);
  });
  async function order(createdAt = new Date().toISOString(), consent = false) {
    const id = randomUUID();
    must(
      await db.from('orders').insert({
        id,
        user_id: buyerId,
        order_number: `SC${randomBytes(4).toString('hex').toUpperCase()}`,
        currency: 'MZN',
        subtotal: 100,
        shipping_amount: 10,
        total_amount: 110,
        status: 'PENDING',
        payment_status: 'UNPAID',
        guest_email: 'buyer@example.invalid',
        created_at: createdAt,
        shipping_address_snapshot: {
          country: 'ZA',
          whatsapp_updates_opt_in: consent,
          whatsapp_consent_version: 'whatsapp-order-v1',
          whatsapp_phone: '+27110000000',
        },
        shipping_method_snapshot: { code: 'PICKUP' },
      })
    );
    must(
      await db.from('orders').update({ status: 'CONFIRMED', payment_status: 'PAID' }).eq('id', id)
    );
    return id;
  }
  it('queues a customer confirmation and a distinct admin alert, without enabling either', async () => {
    const id = await order();
    const rows = must(await db.from('order_message_outbox').select('*').eq('order_id', id));
    expect(rows.map((r) => r.channel).sort()).toEqual(['ADMIN_EMAIL', 'CUSTOMER_EMAIL']);
    expect(must(await db.rpc('claim_order_message', { target_channel: 'CUSTOMER_EMAIL' }))).toEqual(
      []
    );
    expect(must(await db.rpc('claim_order_message', { target_channel: 'ADMIN_EMAIL' }))).toEqual(
      []
    );
    must(
      await db.from('orders').update({ status: 'CONFIRMED', payment_status: 'PAID' }).eq('id', id)
    );
    expect(
      must(await db.from('order_message_outbox').select('id').eq('order_id', id))
    ).toHaveLength(2);
  });
  it('excludes historical orders even if their confirmation arrives after activation', async () => {
    must(
      await db
        .from('order_notification_channels')
        .update({ enabled: true, enabled_since: new Date(Date.now() + 60000).toISOString() })
        .eq('channel', 'CUSTOMER_EMAIL')
    );
    await order('2020-01-01T00:00:00Z');
    expect(must(await db.rpc('claim_order_message', { target_channel: 'CUSTOMER_EMAIL' }))).toEqual(
      []
    );
  });
  it('serializes concurrent workers and rejects stale completion leases', async () => {
    must(
      await db
        .from('order_notification_channels')
        .update({ enabled: true, enabled_since: new Date(Date.now() - 60000).toISOString() })
        .eq('channel', 'ADMIN_EMAIL')
    );
    // Exclude earlier test queues, so only this future order is eligible.
    const future = new Date(Date.now() + 1000).toISOString();
    must(
      await db
        .from('order_notification_channels')
        .update({ enabled_since: future })
        .eq('channel', 'ADMIN_EMAIL')
    );
    const id = await order(new Date(Date.now() + 2000).toISOString());
    const results = await Promise.all([
      db.rpc('claim_order_message', { target_channel: 'ADMIN_EMAIL' }),
      db.rpc('claim_order_message', { target_channel: 'ADMIN_EMAIL' }),
    ]);
    const claims = results.flatMap((r) => must(r));
    expect(claims).toHaveLength(1);
    const claim = claims[0];
    expect(claim.order_id).toBe(id);
    expect(
      must(
        await db.rpc('finish_order_message', {
          target_id: claim.id,
          target_lease: randomUUID(),
          outcome: 'ACCEPTED',
          provider_id: operationId,
        })
      )
    ).toBe(false);
    expect(
      must(
        await db.rpc('finish_order_message', {
          target_id: claim.id,
          target_lease: claim.lease_token!,
          outcome: 'ACCEPTED',
          provider_id: operationId,
        })
      )
    ).toBe(true);
    expect(
      must(
        await db.rpc('finish_order_message', {
          target_id: claim.id,
          target_lease: claim.lease_token!,
          outcome: 'ACCEPTED',
          provider_id: operationId,
        })
      )
    ).toBe(false);
  });
  it('turns an expired send into unknown, not a new send', async () => {
    const claim = must(await db.rpc('claim_order_message', { target_channel: 'ADMIN_EMAIL' }))[0];
    // No claim remains from the preceding test; create a distinct future order.
    expect(claim).toBeUndefined();
    await order(new Date(Date.now() + 3000).toISOString());
    const message = must(await db.rpc('claim_order_message', { target_channel: 'ADMIN_EMAIL' }))[0];
    must(
      await db
        .from('order_message_outbox')
        .update({ lease_until: '2020-01-01T00:00:00Z' })
        .eq('id', message.id)
    );
    expect(must(await db.rpc('claim_order_message', { target_channel: 'ADMIN_EMAIL' }))).toEqual(
      []
    );
    expect(
      must(await db.from('order_message_outbox').select('state').eq('id', message.id).single())
        .state
    ).toBe('UNKNOWN');
    expect(
      must(
        await db.rpc('finish_order_message', {
          target_id: message.id,
          target_lease: message.lease_token!,
          outcome: 'ACCEPTED',
          provider_id: 'late',
        })
      )
    ).toBe(false);
  });
  it('records delivery receipts without re-entering the send queue', async () => {
    const row = must(
      await db.from('order_message_outbox').select('*').eq('operation_id', operationId).single()
    );
    must(
      await db
        .from('order_message_outbox')
        .update({ next_check_at: '2020-01-01T00:00:00Z' })
        .eq('id', row.id)
    );
    const message = must(
      await db.rpc('claim_order_message_receipt', { target_channel: 'ADMIN_EMAIL' })
    )[0];
    expect(
      must(
        await db.rpc('record_order_message_receipt', {
          target_id: message.id,
          target_lease: message.lease_token!,
          outcome: 'DELIVERED',
          target_provider_status: 'DELIVERED',
        })
      )
    ).toBe(true);
    expect(
      must(await db.from('order_message_outbox').select('state').eq('id', message.id).single())
        .state
    ).toBe('DELIVERED');
  });
  it('does not infer WhatsApp consent from buying, and leaves WhatsApp disabled', async () => {
    const without = await order();
    expect(
      must(
        await db
          .from('order_message_outbox')
          .select('id')
          .eq('order_id', without)
          .eq('channel', 'CUSTOMER_WHATSAPP')
      )
    ).toEqual([]);
    const withConsent = await order(new Date().toISOString(), true);
    expect(
      must(
        await db
          .from('order_message_outbox')
          .select('id')
          .eq('order_id', withConsent)
          .eq('channel', 'CUSTOMER_WHATSAPP')
      )
    ).toHaveLength(1);
    expect(
      must(await db.rpc('claim_order_message', { target_channel: 'CUSTOMER_WHATSAPP' }))
    ).toEqual([]);
  });
  it('denies customers queue/configuration writes and private worker RPCs', async () => {
    expect(must(await customer.from('order_notification_channels').select('*'))).toEqual([]);
    expect(must(await customer.from('order_message_outbox').select('*'))).toEqual([]);
    expect(
      (
        await customer
          .from('order_notification_channels')
          .update({ enabled: true })
          .eq('channel', 'ADMIN_EMAIL')
      ).error
    ).not.toBeNull();
    for (const name of ['claim_order_email', 'wake_order_notifications'] as const)
      expect((await customer.rpc(name)).error).not.toBeNull();
    expect(
      (await customer.rpc('claim_order_message', { target_channel: 'ADMIN_EMAIL' })).error
    ).not.toBeNull();
    expect((await db.rpc('claim_order_email')).error).not.toBeNull();
  });
});
