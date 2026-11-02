// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';
const url = process.env.LOCAL_SUPABASE_TEST_URL;
const key = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;

describe.runIf(Boolean(url && key))('full product editing safeguards (isolated PostgreSQL)', () => {
  let db: SupabaseClient<Database>,
    admin: SupabaseClient<Database>,
    customer: SupabaseClient<Database>;
  beforeAll(async () => {
    db = createClient<Database>(url!, key!, { auth: { persistSession: false } });
    const email = `editor-${randomUUID()}@example.invalid`,
      password = `Test-${randomBytes(12).toString('hex')}`;
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error;
    check(await db.from('user_roles').insert({ user_id: created.data.user.id, role: 'ADMIN' }));
    admin = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
      auth: { persistSession: false },
    });
    check(await admin.auth.signInWithPassword({ email, password }));
    customer = createClient<Database>(url!, process.env.LOCAL_SUPABASE_TEST_ANON_KEY!, {
      auth: { persistSession: false },
    });
  });
  function check<T extends { data: unknown; error: unknown }>(result: T): NonNullable<T['data']> {
    if (result.error) throw result.error;
    return result.data as NonNullable<T['data']>;
  }
  async function fixture(price = 78.5) {
    const productId = randomUUID(),
      variantId = randomUUID(),
      listingId = randomUUID();
    check(
      await db
        .from('products')
        .insert({
          id: productId,
          name: 'Editor fixture',
          slug: `editor-${productId}`,
          brand_id: 'b0000000-0000-0000-0000-000000000001',
          category_id: 'c0000000-0000-0000-0000-000000000001',
          currency: 'MZN',
          active: true,
        })
    );
    check(
      await db
        .from('product_variants')
        .insert({ id: variantId, product_id: productId, size: 'OS', size_system: 'STANDARD' })
    );
    check(
      await db
        .from('product_media')
        .insert({
          product_id: productId,
          storage_path: 'd0000000-0000-0000-0000-000000000001/isolated.png',
          media_type: 'IMAGE',
        })
    );
    check(
      await db
        .from('listings')
        .insert({
          id: listingId,
          product_id: productId,
          variant_id: variantId,
          ownership_type: 'STREET_CULTURE',
          condition: 'NEW',
          asking_price: price,
          currency: 'MZN',
          quantity: 1,
          status: 'LIVE',
          authentication_status: 'PASSED',
          published_at: new Date().toISOString(),
        })
    );
    return { productId, variantId, listingId };
  }
  it('opens editing only after explicit unpublish, preserves stock, and allows the canonical fields to be saved', async () => {
    const { productId, listingId } = await fixture();
    expect(
      (await admin.from('products').update({ name: 'Changed too soon' }).eq('id', productId)).error
    ).not.toBeNull();
    expect(
      check(
        await admin.rpc('prepare_product_for_editing', {
          target_product_id: productId,
          operator_note: 'Correcting metadata for this product',
        })
      )
    ).toBe(1);
    expect(
      check(
        await db
          .from('listings')
          .select('status,authentication_status')
          .eq('id', listingId)
          .single()
      )
    ).toMatchObject({ status: 'DRAFT', authentication_status: 'PASSED' });
    check(
      await admin
        .from('products')
        .update({
          name: 'Corrected item name',
          description: 'Corrected description',
          model: 'Updated model',
          sku: `EDIT-${productId}`,
          style_code: 'SC-EDIT',
          colorway: 'Black',
          release_year: 2026,
          gender: 'UNISEX',
        })
        .eq('id', productId)
    );
    expect(
      check(await db.from('products').select('name,active').eq('id', productId).single())
    ).toMatchObject({ name: 'Corrected item name', active: false });
    const events = check(
      await db
        .from('admin_audit_logs')
        .select('action')
        .eq('entity_id', productId)
        .eq('action', 'PRODUCT_PREPARED_FOR_EDIT')
    );
    expect(events).toHaveLength(1);
  });
  it('denies anonymous callers and refuses active customer reservations without releasing inventory', async () => {
    const { productId, listingId } = await fixture(78);
    const args = {
      target_product_id: productId,
      operator_note: 'Must protect customer reservations',
    };
    expect((await customer.rpc('prepare_product_for_editing', args)).error).not.toBeNull();
    const shipping = check(
      await db
        .from('shipping_methods')
        .select('code')
        .eq('id', 'a0000000-0000-0000-0000-000000000001')
        .single()
    );
    const reserved = check(
      await db.rpc('create_guest_checkout_order', {
        target_order_id: randomUUID(),
        target_order_number: `SC${randomBytes(5).toString('hex')}`,
        target_access_token_hash: randomBytes(32).toString('hex'),
        target_guest_name: 'Test Buyer',
        target_guest_email: 'test@example.invalid',
        target_guest_phone: '258841234567',
        target_shipping_snapshot: {
          country: 'MZ',
          province: 'Maputo',
          city: 'Maputo',
          address_line_1: 'Test street 1',
        },
        target_shipping_method_code: shipping.code,
        target_items: [{ listing_id: listingId, size: 'OS', quantity: 1, expected_price: 78 }],
      })
    );
    // Legacy checkout is whole-MZN only; use an exact integer fixture there.
    expect(reserved).toHaveLength(1);
    expect((await admin.rpc('prepare_product_for_editing', args)).error?.message).toMatch(
      /reservation/
    );
    expect(
      check(await db.from('listings').select('status').eq('id', listingId).single()).status
    ).toBe('RESERVED');
  });
  it('edits own-stock draft condition only, invalidating authentication instead of silently republishing', async () => {
    const { productId, listingId } = await fixture();
    const args = {
      target_listing_id: listingId,
      target_condition: 'GOOD',
      operator_note: 'Physical condition correction after inspection',
    };
    expect((await admin.rpc('edit_draft_listing_condition', args)).error).not.toBeNull();
    check(
      await admin.rpc('prepare_product_for_editing', {
        target_product_id: productId,
        operator_note: 'Prepare the fixture for corrections',
      })
    );
    expect(check(await admin.rpc('edit_draft_listing_condition', args))).toBe(true);
    expect(
      check(
        await db
          .from('listings')
          .select('status,condition,authentication_status')
          .eq('id', listingId)
          .single()
      )
    ).toMatchObject({ status: 'DRAFT', condition: 'GOOD', authentication_status: 'PENDING' });
    expect(
      (
        await admin.rpc('manage_inventory_listing', {
          target_listing_id: listingId,
          inventory_action: 'ACTIVATE',
          operator_note: 'Cannot bypass fresh physical authentication',
        })
      ).error
    ).not.toBeNull();
  });
});
