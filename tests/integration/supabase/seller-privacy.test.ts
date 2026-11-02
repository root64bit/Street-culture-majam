// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';
describe.runIf(Boolean(process.env.LOCAL_SUPABASE_TEST_URL))('isolated two-seller privacy', () => {
  it('denies another seller access to submissions and private photos, self-approval, and stock mutations', async () => {
    const url = process.env.LOCAL_SUPABASE_TEST_URL!,
      key = process.env.LOCAL_SUPABASE_TEST_ANON_KEY!;
    const service = createClient<Database>(url, process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const sellers = [];
    for (let i = 0; i < 2; i++) {
      const email = `privacy-seller-${randomUUID()}@example.invalid`,
        password = `Test-${randomBytes(12).toString('hex')}`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user) throw created.error;
      const client = createClient<Database>(url, key, { auth: { persistSession: false } });
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      sellers.push({ id: created.data.user.id, client });
    }
    const [owner, stranger] = sellers;
    const submission = await owner.client
      .from('consignment_submissions')
      .insert({
        seller_id: owner.id,
        brand_name: 'Test Vault',
        product_name: 'Private fixture',
        size: 'OS',
        size_system: 'STANDARD',
        condition: 'NEW',
        expected_price: 78.5,
        currency: 'MZN',
        status: 'DRAFT',
      })
      .select('id')
      .single();
    if (submission.error) throw submission.error;
    const path = `${owner.id}/${submission.data.id}/test.png`;
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw0kAAAAASUVORK5CYII=',
      'base64'
    );
    expect(
      (
        await owner.client.storage
          .from('consignment-media')
          .upload(path, image, { contentType: 'image/png' })
      ).error
    ).toBeNull();
    expect((await owner.client.storage.from('consignment-media').download(path)).error).toBeNull();
    expect(
      (await stranger.client.storage.from('consignment-media').download(path)).error
    ).not.toBeNull();
    expect(
      (
        await stranger.client
          .from('consignment_submissions')
          .select('id')
          .eq('id', submission.data.id)
      ).data
    ).toEqual([]);
    expect(
      (
        await owner.client.rpc('transition_consignment', {
          target_submission_id: submission.data.id,
          review_action: 'APPROVE',
          review_notes: 'Seller cannot approve own submission',
        })
      ).error
    ).not.toBeNull();
    const mutation = await stranger.client
      .from('listings')
      .update({ asking_price: 1 })
      .eq('id', 'e0000000-0000-0000-0000-000000000001')
      .select('id');
    expect(mutation.error || mutation.data?.length === 0).toBeTruthy();
    expect(
      (
        await service
          .from('listings')
          .select('asking_price')
          .eq('id', 'e0000000-0000-0000-0000-000000000001')
          .single()
      ).data?.asking_price
    ).toBe(78);
  });
});
