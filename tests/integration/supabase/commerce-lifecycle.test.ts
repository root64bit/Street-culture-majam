// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';

const url = process.env.LOCAL_SUPABASE_TEST_URL;
const serviceKey = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
const runLocal = Boolean(url && serviceKey);
const PRODUCT_ID = 'd0000000-0000-0000-0000-000000000001';
const VARIANT_ID = 'f0000000-0000-0000-0000-000000000001';

describe.runIf(runLocal)('local PostgreSQL commerce lifecycle', () => {
  let db: SupabaseClient<Database>;
  const listingIds: string[] = [];
  const orderIds: string[] = [];
  const payoutIds: string[] = [];
  const submissionIds: string[] = [];
  let shippingId: string;
  let shippingCode: string;
  let sellerId: string | null = null;
  let buyerId: string | null = null;

  beforeAll(async () => {
    db = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
    shippingId = randomUUID();
    shippingCode = `TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
    const { error } = await db.from('shipping_methods').insert({
      id: shippingId, code: shippingCode, name: 'Local test delivery',
      country_code: 'MZ', region: null, price: 125, currency: 'MZN',
      estimated_min_days: 1, estimated_max_days: 3, active: true,
    });
    if (error) throw error;
  });

  afterAll(async () => {
    if (!db) return;
    if (payoutIds.length) await db.from('seller_payouts').delete().in('id', payoutIds);
    if (orderIds.length) await db.from('orders').delete().in('id', orderIds);
    if (listingIds.length) await db.from('listings').delete().in('id', listingIds);
    if (submissionIds.length) await db.from('consignment_submissions').delete().in('id', submissionIds);
    if (shippingId) await db.from('shipping_methods').delete().eq('id', shippingId);
    if (sellerId) await db.auth.admin.deleteUser(sellerId);
    if (buyerId) await db.auth.admin.deleteUser(buyerId);
  });

  async function listing(ownershipType: 'STREET_CULTURE' | 'CONSIGNMENT' = 'STREET_CULTURE', submissionId?: string) {
    const id = randomUUID();
    listingIds.push(id);
    const { error } = await db.from('listings').insert({
      id, product_id: PRODUCT_ID, variant_id: VARIANT_ID,
      seller_id: ownershipType === 'CONSIGNMENT' ? sellerId : null,
      ownership_type: ownershipType, consignment_submission_id: submissionId ?? null,
      condition: 'NEW', status: 'LIVE', asking_price: 1000, currency: 'MZN',
      quantity: 1, authentication_status: 'PASSED', published_at: new Date().toISOString(),
    });
    if (error) throw error;
    return id;
  }

  function requestFor(listingId: string, orderId = randomUUID(), price = 1000) {
    orderIds.push(orderId);
    return {
      target_order_id: orderId,
      target_order_number: `SC${randomBytes(4).toString('hex').toUpperCase()}`,
      target_access_token_hash: randomBytes(32).toString('hex'),
      target_guest_name: 'Test Buyer',
      target_guest_email: 'test-buyer@example.invalid',
      target_guest_phone: '258841234567',
      target_shipping_snapshot: {
        country: 'MZ', province: 'Maputo', city: 'Maputo', address_line_1: 'Test street 1',
      },
      target_shipping_method_code: shippingCode,
      target_items: [{ listing_id: listingId, size: '10.5', quantity: 1, expected_price: price }],
    };
  }

  async function paymentFor(orderId: string) {
    const { data, error } = await db.from('payments').insert({
      order_id: orderId, provider: 'mpesa', status: 'PENDING',
      amount: 1125, currency: 'MZN', provider_reference: `ST${randomBytes(4).toString('hex').toUpperCase()}`,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  it('allows exactly one of two simultaneous buyers to reserve a one-of-one listing', async () => {
    const listingId = await listing();
    const [first, second] = await Promise.all([
      db.rpc('create_guest_checkout_order', requestFor(listingId)),
      db.rpc('create_guest_checkout_order', requestFor(listingId)),
    ]);
    expect([first, second].filter((result) => !result.error)).toHaveLength(1);
    expect([first, second].filter((result) => result.error)).toHaveLength(1);
    const winner = [first, second].find((result) => !result.error)!.data![0];
    const [{ data: row }, { data: orders }] = await Promise.all([
      db.from('listings').select('status, reserved_by_order_id').eq('id', listingId).single(),
      db.from('orders').select('id').eq('id', winner.created_order_id),
    ]);
    expect(row?.status).toBe('RESERVED');
    expect(row?.reserved_by_order_id).toBe(winner.created_order_id);
    expect(orders).toHaveLength(1);
  });

  it('rejects changed prices without leaving an order or reservation', async () => {
    const listingId = await listing();
    const result = await db.rpc('create_guest_checkout_order', requestFor(listingId, randomUUID(), 999));
    expect(result.error?.message).toContain('price changed');
    const { data } = await db.from('listings').select('status').eq('id', listingId).single();
    expect(data?.status).toBe('LIVE');
  });

  it('releases a failed payment and keeps the listing sellable', async () => {
    const listingId = await listing();
    const created = await db.rpc('create_guest_checkout_order', requestFor(listingId));
    if (created.error) throw created.error;
    const paymentId = await paymentFor(created.data[0].created_order_id);
    const failed = await db.rpc('fail_guest_checkout_payment', { target_payment_id: paymentId });
    expect(failed.error).toBeNull();
    expect(failed.data).toBe(true);
    const [{ data: row }, { data: order }] = await Promise.all([
      db.from('listings').select('status, reserved_by_order_id').eq('id', listingId).single(),
      db.from('orders').select('status, payment_status').eq('id', created.data[0].created_order_id).single(),
    ]);
    expect(row?.status).toBe('LIVE');
    expect(row?.reserved_by_order_id).toBeNull();
    expect(order).toMatchObject({ status: 'CANCELLED', payment_status: 'FAILED' });
  });

  it('expires an unpaid reservation once and never releases a paid sale', async () => {
    const expiringListing = await listing();
    const created = await db.rpc('create_guest_checkout_order', requestFor(expiringListing));
    if (created.error) throw created.error;
    const orderId = created.data[0].created_order_id;
    const { error: expiryError } = await db.from('listings')
      .update({ reservation_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', expiringListing);
    if (expiryError) throw expiryError;
    const released = await db.rpc('release_expired_listing_reservations');
    expect(released.error).toBeNull();
    expect(released.data).toBeGreaterThanOrEqual(1);
    const again = await db.rpc('release_expired_listing_reservations');
    expect(again.data).toBe(0);
    const [{ data: row }, { data: order }] = await Promise.all([
      db.from('listings').select('status').eq('id', expiringListing).single(),
      db.from('orders').select('status').eq('id', orderId).single(),
    ]);
    expect(row?.status).toBe('LIVE');
    expect(order?.status).toBe('CANCELLED');
  });

  it('sells own stock on trusted confirmation without a seller payout', async () => {
    const listingId = await listing();
    const created = await db.rpc('create_guest_checkout_order', requestFor(listingId));
    if (created.error) throw created.error;
    const orderId = created.data[0].created_order_id;
    const paymentId = await paymentFor(orderId);
    const first = await db.rpc('complete_guest_checkout_payment', { target_payment_id: paymentId });
    const repeated = await db.rpc('complete_guest_checkout_payment', { target_payment_id: paymentId });
    expect(first.error).toBeNull();
    expect(first.data).toBe(true);
    expect(repeated.data).toBe(true);
    const [{ data: row }, { data: payouts }] = await Promise.all([
      db.from('listings').select('status').eq('id', listingId).single(),
      db.from('seller_payouts').select('id').eq('listing_id', listingId),
    ]);
    expect(row?.status).toBe('SOLD');
    expect(payouts).toHaveLength(0);
  });

  it.runIf(Boolean(process.env.LOCAL_SUPABASE_TEST_ANON_KEY))('attaches an authenticated order to its owner and enforces order RLS', async () => {
    const email = `buyer-${randomUUID()}@example.invalid`;
    const password = `Test-${randomBytes(16).toString('hex')}`;
    const { data: createdUser, error: userError } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (userError || !createdUser.user) throw userError ?? new Error('Buyer missing');
    buyerId = createdUser.user.id;
    const { error: profileError } = await db.from('profiles').upsert({ id: buyerId, account_type: 'BUYER' });
    if (profileError) throw profileError;
    const listingId = await listing();
    const checkout = requestFor(listingId);
    const reserved = await db.rpc('create_guest_checkout_order', {
      ...checkout, target_user_id: buyerId,
    });
    if (reserved.error) throw reserved.error;
    const buyer = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const signedIn = await buyer.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const { data: owned } = await buyer.from('orders').select('id').eq('id', checkout.target_order_id);
    expect(owned).toHaveLength(1);
    const stranger = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data: hidden } = await stranger.from('orders').select('id').eq('id', checkout.target_order_id);
    expect(hidden).toHaveLength(0);
  });

  it.runIf(Boolean(process.env.LOCAL_SUPABASE_TEST_ANON_KEY))('does not expose approved but unpublished listings to anonymous readers', async () => {
    const listingId = await listing();
    const { error: statusError } = await db.from('listings').update({ status: 'APPROVED' }).eq('id', listingId);
    if (statusError) throw statusError;
    const anonymous = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonymous.from('listings').select('id').eq('id', listingId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('snapshots 30% commission and creates one pending payout for consignment', async () => {
    const sellerPassword = `Test-${randomBytes(16).toString('hex')}`;
    const sellerEmail = `consignor-${randomUUID()}@example.invalid`;
    const { data: user, error: userError } = await db.auth.admin.createUser({
      email: sellerEmail, password: sellerPassword, email_confirm: true,
    });
    if (userError || !user.user) throw userError ?? new Error('Seller missing');
    sellerId = user.user.id;
    const { error: profileError } = await db.from('profiles').upsert({ id: sellerId, account_type: 'SELLER' });
    if (profileError) throw profileError;
    if (process.env.LOCAL_SUPABASE_TEST_ANON_KEY) {
      const draftId = randomUUID();
      listingIds.push(draftId);
      const { error: draftError } = await db.from('listings').insert({
        id: draftId, product_id: PRODUCT_ID, variant_id: VARIANT_ID,
        seller_id: sellerId, ownership_type: 'CONSIGNMENT', condition: 'NEW',
        status: 'DRAFT', asking_price: 1000, currency: 'MZN', quantity: 1,
        authentication_status: 'PENDING',
      });
      if (draftError) throw draftError;
      const seller = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY, {
        auth: { persistSession: false },
      });
      const signedIn = await seller.auth.signInWithPassword({ email: sellerEmail, password: sellerPassword });
      if (signedIn.error) throw signedIn.error;
      const prohibited = await seller.from('listings')
        .update({ status: 'LIVE', authentication_status: 'PASSED' }).eq('id', draftId);
      expect(prohibited.error).not.toBeNull();
      const { data: draft } = await db.from('listings').select('status').eq('id', draftId).single();
      expect(draft?.status).toBe('DRAFT');
    }
    const submissionId = randomUUID();
    submissionIds.push(submissionId);
    const { error: submissionError } = await db.from('consignment_submissions').insert({
      id: submissionId, seller_id: sellerId, product_id: PRODUCT_ID,
      brand_name: 'A/X', product_name: 'Test consignment', size: '10.5', condition: 'NEW',
      expected_price: 1000, currency: 'MZN', status: 'LISTED',
    });
    if (submissionError) throw submissionError;
    const listingId = await listing('CONSIGNMENT', submissionId);
    const created = await db.rpc('create_guest_checkout_order', requestFor(listingId));
    if (created.error) throw created.error;
    const orderId = created.data[0].created_order_id;
    const paymentId = await paymentFor(orderId);
    const confirmed = await db.rpc('complete_guest_checkout_payment', { target_payment_id: paymentId });
    expect(confirmed.error).toBeNull();
    expect(confirmed.data).toBe(true);
    const { data: payouts, error: payoutsError } = await db.from('seller_payouts')
      .select('id, gross_amount, commission_amount, net_amount, status')
      .eq('listing_id', listingId);
    if (payoutsError) throw payoutsError;
    expect(payouts).toHaveLength(1);
    payoutIds.push(payouts[0].id);
    expect(Number(payouts[0].gross_amount)).toBe(1000);
    expect(Number(payouts[0].commission_amount)).toBe(300);
    expect(Number(payouts[0].net_amount)).toBe(700);
    expect(payouts[0].status).toBe('PENDING');
    const { data: submission } = await db.from('consignment_submissions').select('status').eq('id', submissionId).single();
    expect(submission?.status).toBe('SOLD');
    const { error: settledError } = await db.from('seller_payouts')
      .update({ status: 'PAID', processed_at: new Date().toISOString() })
      .eq('id', payouts[0].id);
    if (settledError) throw settledError;
    const { data: settledSubmission } = await db.from('consignment_submissions')
      .select('status').eq('id', submissionId).single();
    expect(settledSubmission?.status).toBe('PAID');
  });
});
