// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';

const url = process.env.LOCAL_SUPABASE_TEST_URL;
const serviceKey = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.LOCAL_SUPABASE_TEST_ANON_KEY;

describe.runIf(Boolean(url && serviceKey && anonKey))(
  'catalog discovery and publication diagnostics',
  () => {
    let service: SupabaseClient<Database>;
    let anonymous: SupabaseClient<Database>;
    let admin: SupabaseClient<Database>;
    let adminId = '';
    let productId = '';

    beforeAll(async () => {
      service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
      anonymous = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
      const email = `catalog-diagnostics-${randomUUID()}@example.invalid`;
      const password = `Test-${randomBytes(12).toString('hex')}`;
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError || !created.user) throw createError ?? new Error('Admin user missing');
      adminId = created.user.id;
      const { error: roleError } = await service.from('user_roles').insert({
        user_id: adminId,
        role: 'ADMIN',
      });
      if (roleError) throw roleError;
      admin = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
      const { error: signInError } = await admin.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const { data: product, error: productError } = await service
        .from('products')
        .select('id')
        .limit(1)
        .single();
      if (productError || !product) throw productError ?? new Error('Seed product missing');
      productId = product.id;
    });

    afterAll(async () => {
      if (!service || !adminId) return;
      await service.from('admin_audit_logs').delete().eq('actor_id', adminId);
      await service.auth.admin.deleteUser(adminId);
    });

    it('returns aggregate facets and one product card per public product', async () => {
      const [{ data: facets, error: facetError }, { data: products, error: productError }] =
        await Promise.all([
          anonymous.rpc('public_catalog_facets'),
          anonymous
            .from('public_catalog_products')
            .select('product_id,sizes,conditions,listing_options'),
        ]);
      expect(facetError).toBeNull();
      expect(productError).toBeNull();
      expect(facets).toMatchObject({
        categories: expect.any(Array),
        brands: expect.any(Array),
        sizes: expect.any(Array),
        conditions: expect.any(Array),
      });
      expect(new Set((products ?? []).map((product) => product.product_id)).size).toBe(
        products?.length ?? 0
      );
      for (const product of products ?? []) {
        expect(product.sizes).toEqual(expect.any(Array));
        expect(product.conditions).toEqual(expect.any(Array));
        expect(product.listing_options).toEqual(expect.any(Array));
      }
    });

    it('keeps draft diagnostics private while giving admins actionable blockers', async () => {
      const denied = await anonymous.rpc('admin_product_publication_diagnostics', {
        target_product_id: productId,
      });
      expect(denied.error).not.toBeNull();
      const { data, error } = await admin
        .rpc('admin_product_publication_diagnostics', { target_product_id: productId })
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({
        stage: expect.any(String),
        publicly_visible: expect.any(Boolean),
        blocker_codes: expect.any(Array),
        blocker_messages: expect.any(Array),
      });
    });
  }
);
