// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { Database } from '@/types/database.types';
const url = process.env.LOCAL_SUPABASE_TEST_URL;
const serviceKey = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.LOCAL_SUPABASE_TEST_ANON_KEY;
describe.runIf(Boolean(url && serviceKey && anonKey))(
  'real database operational admin workflows',
  () => {
    let service: SupabaseClient<Database>;
    const clients: Record<string, SupabaseClient<Database>> = {};
    const userIds: string[] = [];
    const brandId = randomUUID(),
      categoryId = randomUUID(),
      productId = randomUUID(),
      orderId = randomUUID(),
      listingId = randomUUID();
    let variantId = '';
    const imagePath = `${productId}/integration.png`;
    const evidencePath = `integration/${productId}.png`;
    const password = `Test-${randomBytes(12).toString('hex')}`;
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw0kAAAAASUVORK5CYII=',
      'base64'
    );
    beforeAll(async () => {
      service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
      for (const role of [
        'ADMIN',
        'CATALOG_MANAGER',
        'FINANCE',
        'CUSTOMER',
        'AUTHENTICATOR',
      ] as const) {
        const email = `operator-${role.toLowerCase()}-${randomUUID()}@example.invalid`;
        const account = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (account.error || !account.data.user)
          throw account.error ?? new Error('Missing fixture user');
        userIds.push(account.data.user.id);
        if (role !== 'CUSTOMER')
          expect(
            (await service.from('user_roles').insert({ user_id: account.data.user.id, role })).error
          ).toBeNull();
        clients[role] = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
        expect((await clients[role].auth.signInWithPassword({ email, password })).error).toBeNull();
      }
      expect(
        (
          await service
            .from('brands')
            .insert({ id: brandId, name: `Operator Brand ${brandId}`, slug: `operator-${brandId}` })
        ).error
      ).toBeNull();
      expect(
        (
          await service
            .from('categories')
            .insert({ id: categoryId, name: 'Operator Category', slug: `operator-${categoryId}` })
        ).error
      ).toBeNull();
      expect(
        (
          await service
            .from('products')
            .insert({
              id: productId,
              name: `Operator Product ${productId}`,
              slug: `operator-${productId}`,
              brand_id: brandId,
              category_id: categoryId,
              currency: 'MZN',
              active: false,
            })
        ).error
      ).toBeNull();
      expect(
        (
          await service
            .from('orders')
            .insert({
              id: orderId,
              user_id: userIds[3],
              order_number: `OPERATOR-${orderId}`,
              currency: 'MZN',
              subtotal: 1000,
              total_amount: 1000,
              status: 'CONFIRMED',
              payment_status: 'PAID',
            })
        ).error
      ).toBeNull();
      expect(
        (
          await service.storage
            .from('product-images')
            .upload(imagePath, image, { contentType: 'image/png' })
        ).error
      ).toBeNull();
      expect(
        (
          await service.storage
            .from('authentication-evidence')
            .upload(evidencePath, image, { contentType: 'image/png' })
        ).error
      ).toBeNull();
    });
    afterAll(async () => {
      if (!service) return;
      await service.from('orders').delete().eq('id', orderId);
      await service.from('products').delete().eq('id', productId);
      await service.from('brands').delete().eq('id', brandId);
      await service.from('categories').delete().eq('id', categoryId);
      await service.storage.from('product-images').remove([imagePath]);
      await service.storage.from('authentication-evidence').remove([evidencePath]);
      if (userIds.length) await service.from('admin_audit_logs').delete().in('actor_id', userIds);
      for (const id of userIds) await service.auth.admin.deleteUser(id);
    });
    it('restricts account identity, notes and unrelated financial summaries', async () => {
      expect(
        (await clients.CUSTOMER.rpc('admin_account_directory', { directory_kind: 'customer' }))
          .error
      ).not.toBeNull();
      const people = await clients.ADMIN.rpc('admin_account_directory', {
        directory_kind: 'customer',
        search_text: userIds[3],
      });
      expect(people.error).toBeNull();
      expect(people.data?.[0]).toMatchObject({
        id: userIds[3],
        orders_count: 1,
        lifetime_spend: 1000,
        pending_payouts: 0,
        gross_sales: 0,
      });
      const note = await clients.ADMIN.rpc('add_account_operator_note', {
        target_account_id: userIds[3],
        note_context: 'customer',
        operator_note: 'Verified private customer support note',
      });
      expect(note.error).toBeNull();
      expect(
        (await clients.CUSTOMER.from('account_operator_notes').select('id').eq('id', note.data!))
          .data
      ).toEqual([]);
    });
    it('reads actual reports and filters global search by capability', async () => {
      const args = {
        report_kind: 'sales',
        date_from: '2020-01-01T00:00:00Z',
        date_to: '2030-01-01T00:00:00Z',
        currency_filter: 'MZN',
      };
      expect((await clients.CUSTOMER.rpc('admin_operational_report', args)).error).not.toBeNull();
      const report = await clients.FINANCE.rpc('admin_operational_report', args);
      expect(report.error).toBeNull();
      expect(report.data?.find((record) => record.record_id === orderId)?.amount).toBe(1000);
      const search = await clients.CATALOG_MANAGER.rpc('admin_global_search', {
        search_text: productId,
      });
      expect(search.error).toBeNull();
      expect(search.data?.some((record) => record.kind === 'product')).toBe(true);
      expect(
        (
          await clients.CATALOG_MANAGER.rpc('admin_global_search', {
            search_text: `OPERATOR-${orderId}`,
          })
        ).data
      ).toEqual([]);
    });
    it('validates operational configuration and prevents hierarchy cycles', async () => {
      const brand = {
        name: 'Reviewed Operator Brand',
        slug: `operator-${brandId}`,
        description: '',
        imagePath: '',
        active: true,
        sortOrder: 2,
        featured: true,
      };
      expect(
        (
          await clients.CUSTOMER.rpc('save_admin_configuration', {
            configuration_kind: 'brand',
            target_id: brandId,
            payload: brand,
          })
        ).error
      ).not.toBeNull();
      expect(
        (
          await clients.CATALOG_MANAGER.rpc('save_admin_configuration', {
            configuration_kind: 'brand',
            target_id: brandId,
            payload: brand,
          })
        ).error
      ).toBeNull();
      const category = {
        name: 'Reviewed Category',
        slug: `operator-${categoryId}`,
        description: '',
        imagePath: '',
        active: true,
        sortOrder: 0,
        parentId: categoryId,
      };
      expect(
        (
          await clients.CATALOG_MANAGER.rpc('save_admin_configuration', {
            configuration_kind: 'category',
            target_id: categoryId,
            payload: category,
          })
        ).error
      ).not.toBeNull();
      expect(
        (
          await clients.ADMIN.rpc('save_admin_configuration', {
            configuration_kind: 'setting',
            target_id: randomUUID(),
            payload: { key: 'store', value: { secret: 'never store a secret' } },
          })
        ).error
      ).not.toBeNull();
      expect(
        (
          await clients.FINANCE.rpc('save_admin_configuration', {
            configuration_kind: 'commission',
            target_id: randomUUID(),
            payload: {
              name: 'Invalid commission',
              sellerType: 'STANDARD',
              brandId: '',
              categoryId: '',
              percentage: 130,
              fixedFee: 0,
              minimumFee: 0,
              currency: 'MZN',
              priority: 0,
              startsAt: new Date().toISOString(),
              endsAt: '',
              active: true,
            },
          })
        ).error
      ).not.toBeNull();
    });
    it('generates variants without inventing inventory and supports paged catalog queries', async () => {
      const args = {
        target_product_id: productId,
        target_system: 'US',
        start_size: 7,
        end_size: 8,
        size_increment: 0.5,
        sku_prefix: `OP-${productId}`,
      };
      expect(
        (await clients.CUSTOMER.rpc('generate_product_size_range', args)).error
      ).not.toBeNull();
      const generated = await clients.CATALOG_MANAGER.rpc('generate_product_size_range', args);
      expect(generated.error).toBeNull();
      expect(generated.data).toBe(3);
      expect((await clients.CATALOG_MANAGER.rpc('generate_product_size_range', args)).data).toBe(0);
      expect(
        (await service.from('listings').select('id').eq('product_id', productId)).data
      ).toEqual([]);
      const catalog = await clients.CATALOG_MANAGER.rpc('admin_catalog_products', {
        brand_filter: brandId,
        page_limit: 1,
      });
      expect(catalog.error).toBeNull();
      expect(catalog.data?.[0]).toMatchObject({ id: productId, variants_count: 3, live_count: 0 });
      const variant = await service
        .from('product_variants')
        .select('id')
        .eq('product_id', productId)
        .eq('size', '7')
        .single();
      variantId = variant.data!.id;
    });
    it('protects used public photography and private authentication evidence', async () => {
      const attached = await clients.ADMIN.from('product_media').insert({
        product_id: productId,
        storage_path: imagePath,
        media_type: 'IMAGE',
        sort_order: 0,
      });
      expect(attached.error).toBeNull();
      const files = await clients.ADMIN.rpc('admin_public_media_library', {
        asset_bucket: 'product-images',
        search_text: productId,
      });
      expect(files.error).toBeNull();
      expect(files.data?.[0]?.usage).toHaveLength(1);
      expect(
        (
          await clients.ADMIN.rpc('public_asset_is_unused', {
            asset_bucket: 'product-images',
            asset_path: imagePath,
          })
        ).data
      ).toBe(false);
      await clients.ADMIN.storage.from('product-images').remove([imagePath]);
      expect((await service.storage.from('product-images').download(imagePath)).error).toBeNull();
      const anon = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
      expect(
        (await anon.storage.from('authentication-evidence').download(evidencePath)).error
      ).not.toBeNull();
      expect(
        (
          await clients.CUSTOMER.storage
            .from('authentication-evidence')
            .createSignedUrl(evidencePath, 60)
        ).error
      ).not.toBeNull();
      expect(
        (await clients.AUTHENTICATOR.storage.from('authentication-evidence').download(evidencePath))
          .error
      ).toBeNull();
      expect(
        (
          await clients.CUSTOMER.rpc('admin_public_media_library', {
            asset_bucket: 'authentication-evidence',
          })
        ).error
      ).not.toBeNull();
    });
    it('audits inventory activation and rejects edits once reserved or sold', async () => {
      expect(
        (
          await service
            .from('listings')
            .insert({
              id: listingId,
              product_id: productId,
              variant_id: variantId,
              ownership_type: 'STREET_CULTURE',
              seller_id: null,
              condition: 'NEW',
              currency: 'MZN',
              asking_price: 2500,
              quantity: 1,
              status: 'DRAFT',
              authentication_status: 'PASSED',
            })
        ).error
      ).toBeNull();
      const activate = await clients.CATALOG_MANAGER.rpc('manage_inventory_listing', {
        target_listing_id: listingId,
        inventory_action: 'ACTIVATE',
        operator_note: 'Physical authenticated stock ready for sale',
      });
      expect(activate.error).toBeNull();
      const newPrice = await clients.CATALOG_MANAGER.rpc('manage_inventory_listing', {
        target_listing_id: listingId,
        inventory_action: 'ADJUST_PRICE',
        new_price: 2700,
        operator_note: 'Verified updated sale price for this unit',
      });
      expect(newPrice.error).toBeNull();
      expect(
        (
          await service
            .from('listings')
            .update({
              status: 'RESERVED',
              reserved_by_order_id: orderId,
              reservation_expires_at: new Date(Date.now() - 60000).toISOString(),
            })
            .eq('id', listingId)
        ).error
      ).toBeNull();
      expect(
        (
          await clients.CATALOG_MANAGER.rpc('manage_inventory_listing', {
            target_listing_id: listingId,
            inventory_action: 'RELEASE_EXPIRED',
            operator_note: 'Cannot release a paid order reservation',
          })
        ).error
      ).not.toBeNull();
      expect(
        (
          await clients.CATALOG_MANAGER.rpc('manage_inventory_listing', {
            target_listing_id: listingId,
            inventory_action: 'ADJUST_PRICE',
            new_price: 2900,
            operator_note: 'Cannot change a reserved unit price',
          })
        ).error
      ).not.toBeNull();
      await service
        .from('listings')
        .update({
          status: 'SOLD',
          sold_at: new Date().toISOString(),
          reserved_by_order_id: null,
          reservation_expires_at: null,
        })
        .eq('id', listingId);
      expect(
        (
          await clients.CATALOG_MANAGER.rpc('manage_inventory_listing', {
            target_listing_id: listingId,
            inventory_action: 'ARCHIVE',
            operator_note: 'Cannot archive a sold physical unit',
          })
        ).error
      ).not.toBeNull();
    });
    it('keeps private order notes out of customer timeline and uses finance review for refunds', async () => {
      const note = await clients.ADMIN.rpc('operate_order', {
        target_order_id: orderId,
        order_action: 'ADD_NOTE',
        operator_note: 'Private fulfillment instructions for operators',
      });
      expect(note.error).toBeNull();
      expect(
        (await clients.CUSTOMER.from('order_operator_notes').select('id').eq('order_id', orderId))
          .data
      ).toEqual([]);
      expect(
        (
          await clients.ADMIN.rpc('operate_order', {
            target_order_id: orderId,
            order_action: 'REQUEST_REFUND',
            operator_note: 'Buyer requested a full external refund',
          })
        ).error
      ).toBeNull();
      expect(
        (
          await clients.ADMIN.rpc('review_order_refund', {
            target_order_id: orderId,
            refund_action: 'START_REVIEW',
            operator_note: 'Ordinary admin cannot attest external refund',
          })
        ).error
      ).not.toBeNull();
      expect(
        (
          await clients.FINANCE.rpc('review_order_refund', {
            target_order_id: orderId,
            refund_action: 'START_REVIEW',
            operator_note: 'Finance is reviewing original payment evidence',
          })
        ).error
      ).toBeNull();
      expect(
        (
          await clients.FINANCE.rpc('review_order_refund', {
            target_order_id: orderId,
            refund_action: 'RECORD_REFUND',
            operator_note: 'Missing evidence cannot mark a refund',
          })
        ).error
      ).not.toBeNull();
    });
    it('scopes operational notifications and marks read only for the current operator', async () => {
      const adminInbox = await clients.ADMIN.rpc('admin_notification_inbox');
      expect(adminInbox.error).toBeNull();
      const alert = adminInbox.data?.find((record) => record.href === `/admin/orders/${orderId}`);
      expect(alert).toBeDefined();
      const catalogInbox = await clients.CATALOG_MANAGER.rpc('admin_notification_inbox');
      expect(catalogInbox.error).toBeNull();
      expect(catalogInbox.data?.find((record) => record.id === alert!.id)).toBeUndefined();
      expect((await clients.CUSTOMER.rpc('admin_notification_inbox')).error).not.toBeNull();
      expect(
        (
          await clients.ADMIN.rpc('mark_admin_notifications_read', {
            notification_ids: [alert!.id],
          })
        ).data
      ).toBe(1);
      expect(
        (await clients.ADMIN.rpc('admin_notification_inbox')).data?.find(
          (record) => record.id === alert!.id
        )?.read_at
      ).not.toBeNull();
      expect(
        (await clients.FINANCE.rpc('admin_notification_inbox')).data?.find(
          (record) => record.id === alert!.id
        )?.read_at
      ).toBeNull();
    });
    it('exposes non-secret operational store context and allows failed payouts to be re-approved', async () => {
      const context = await clients.CUSTOMER.rpc('operational_store_context');
      expect(context.error).toBeNull();
      expect(context.data).toMatchObject({
        store: { name: expect.any(String) },
        consignment: { returnInstructions: expect.any(String) },
      });
      const orderItemId = randomUUID();
      const payoutId = randomUUID();
      expect(
        (
          await service.from('order_items').insert({
            id: orderItemId,
            order_id: orderId,
            listing_id: listingId,
            brand_name_snapshot: 'Operator Brand',
            product_name_snapshot: 'Operator Product',
            size_snapshot: '7',
            condition_snapshot: 'NEW',
            unit_price: 1000,
            quantity: 1,
          })
        ).error
      ).toBeNull();
      expect(
        (
          await service.from('seller_payouts').insert({
            id: payoutId,
            seller_id: userIds[3],
            order_item_id: orderItemId,
            listing_id: listingId,
            gross_amount: 1000,
            commission_amount: 300,
            adjustments: 0,
            net_amount: 700,
            currency: 'MZN',
            status: 'PENDING',
          })
        ).error
      ).toBeNull();
      const initialApprove = await clients.FINANCE.rpc('transition_seller_payout', {
        target_payout_id: payoutId,
        payout_action: 'APPROVE',
        operator_note: 'Initial finance approval for payout settlement',
      });
      expect(initialApprove.error).toBeNull();
      const failed = await clients.FINANCE.rpc('transition_seller_payout', {
        target_payout_id: payoutId,
        payout_action: 'MARK_FAILED',
        operator_note: 'External transfer rejected due to wrong account number',
      });
      expect(failed.error).toBeNull();
      const recovered = await clients.FINANCE.rpc('transition_seller_payout', {
        target_payout_id: payoutId,
        payout_action: 'APPROVE',
        operator_note: 'Seller updated account number; re-approved for payout',
      });
      expect(recovered.error).toBeNull();
      const row = await service.from('seller_payouts').select('status').eq('id', payoutId).single();
      expect(row.data?.status).toBe('APPROVED');
      await service.from('seller_payouts').delete().eq('id', payoutId);
      await service.from('order_items').delete().eq('id', orderItemId);
    });
  }
);
