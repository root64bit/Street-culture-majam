// @vitest-environment node
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';
const url = process.env.LOCAL_SUPABASE_TEST_URL,
  key = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
describe.runIf(Boolean(url && key))('owner-private address book in isolated PostgreSQL', () => {
  let db: SupabaseClient<Database>,
    a: SupabaseClient<Database>,
    b: SupabaseClient<Database>,
    owner: string;
  const details = {
    name: 'Synthetic Buyer',
    email: 'buyer@example.invalid',
    phone: '+27110000000',
    country: 'ZA',
    address_line_1: 'Example 1',
    address_line_2: '',
    local_area: 'Mayfair',
    city: 'Johannesburg',
    province: 'Gauteng',
    postal_code: '2092',
    address_type: 'residential',
    delivery_notes: '',
  };
  const must = <T extends { data: unknown; error: unknown }>(r: T): NonNullable<T['data']> => {
    if (r.error) throw r.error;
    return r.data as NonNullable<T['data']>;
  };
  const payload = (id: string = randomUUID(), is_default = false) => ({
    id,
    revision: 0,
    label: 'Home',
    details,
    is_default,
  });
  beforeAll(async () => {
    db = createClient<Database>(url!, key!, { auth: { persistSession: false } });
    const user = async () => {
      const email = `address-${randomUUID()}@example.invalid`,
        password = randomBytes(18).toString('hex');
      const user = must(
        await db.auth.admin.createUser({ email, password, email_confirm: true })
      ).user!;
      const client = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
        auth: { persistSession: false },
      });
      must(await client.auth.signInWithPassword({ email, password }));
      return { client, id: user.id };
    };
    const first = await user();
    a = first.client;
    owner = first.id;
    b = (await user()).client;
  });
  let first: string, second: string;
  it('saves explicitly and makes duplicate retries safe', async () => {
    first = randomUUID();
    const input = payload(first, true);
    must(await a.rpc('customer_address_operate', { operation: 'SAVE', payload: input }));
    must(await a.rpc('customer_address_operate', { operation: 'SAVE', payload: input }));
    expect(must(await a.from('customer_addresses').select('*'))).toHaveLength(1);
  });
  it('never exposes another customer’s saved address or permits its mutation', async () => {
    expect(must(await b.from('customer_addresses').select('*').eq('id', first))).toEqual([]);
    expect(
      (await b.rpc('customer_address_operate', { operation: 'SAVE', payload: payload(first) }))
        .error
    ).not.toBeNull();
    expect(
      (
        await b.rpc('customer_address_operate', {
          operation: 'DELETE',
          payload: { id: first, revision: 1 },
        })
      ).error
    ).not.toBeNull();
  });
  it('allows only one default and serializes default changes', async () => {
    second = randomUUID();
    must(
      await a.rpc('customer_address_operate', { operation: 'SAVE', payload: payload(second, true) })
    );
    const rows = must(await a.from('customer_addresses').select('*'));
    expect(rows.filter((row) => row.is_default).map((row) => row.id)).toEqual([second]);
    expect(rows.find((row) => row.id === first)?.revision).toBe(2);
  });
  it('rejects stale edits rather than overwriting newer saved details', async () => {
    expect(
      (
        await a.rpc('customer_address_operate', {
          operation: 'SAVE',
          payload: { ...payload(first), revision: 1, label: 'Stale' },
        })
      ).error
    ).not.toBeNull();
  });
  it('rejects invalid destination data', async () => {
    expect(
      (
        await a.rpc('customer_address_operate', {
          operation: 'SAVE',
          payload: { ...payload(), details: { ...details, province: 'Johannesburg' } },
        })
      ).error
    ).not.toBeNull();
  });
  it('does not change any frozen order address when saved details change or are removed', async () => {
    const id = randomUUID();
    must(
      await db
        .from('orders')
        .insert({
          id,
          user_id: owner,
          order_number: `SC${randomBytes(4).toString('hex').toUpperCase()}`,
          status: 'PENDING',
          payment_status: 'UNPAID',
          currency: 'MZN',
          subtotal: 1,
          shipping_amount: 0,
          total_amount: 1,
          shipping_address_snapshot: details,
        })
    );
    must(
      await a.rpc('customer_address_operate', {
        operation: 'SAVE',
        payload: {
          ...payload(first),
          revision: 2,
          details: { ...details, address_line_1: 'Changed saved street' },
        },
      })
    );
    must(
      await a.rpc('customer_address_operate', {
        operation: 'DELETE',
        payload: { id: first, revision: 3 },
      })
    );
    expect(
      must(await db.from('orders').select('shipping_address_snapshot').eq('id', id).single())
        .shipping_address_snapshot
    ).toEqual(details);
  });
  it('denies anonymous and direct table writes, including forged owner fields', async () => {
    expect(
      (await a.from('customer_addresses').insert({ user_id: owner, label: 'Bypass', details }))
        .error
    ).not.toBeNull();
    const anon = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
      auth: { persistSession: false },
    });
    expect((await anon.from('customer_addresses').select('*')).error).not.toBeNull();
    expect(
      (await anon.rpc('customer_address_operate', { operation: 'SAVE', payload: payload() })).error
    ).not.toBeNull();
    expect(
      (await db.rpc('customer_address_operate', { operation: 'SAVE', payload: payload() })).error
    ).not.toBeNull();
  });
  it('enforces the address limit atomically under concurrent inserts', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        a.rpc('customer_address_operate', { operation: 'SAVE', payload: payload() })
      )
    );
    expect(results.filter((result) => !result.error)).toHaveLength(9);
    expect(must(await a.from('customer_addresses').select('id'))).toHaveLength(10);
  });
});
