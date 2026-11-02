import { createClient } from '@supabase/supabase-js';

// Called only by the runner after container and loopback-port verification.
export async function installFixtures(env) {
  if (
    env.SC_TEST_ISOLATION !== 'street_culture_sprint1_test' ||
    env.LOCAL_SUPABASE_TEST_URL !== 'http://127.0.0.1:55321'
  )
    throw new Error('Fixture destination is not the disposable test project.');
  const db = createClient(env.LOCAL_SUPABASE_TEST_URL, env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const check = (result) => {
    if (result.error) throw result.error;
    return result.data;
  };
  const productId = 'd0000000-0000-0000-0000-000000000001';
  check(
    await db
      .from('brands')
      .upsert({
        id: 'b0000000-0000-0000-0000-000000000001',
        name: 'Test Vault',
        slug: 'test-vault',
      })
  );
  check(
    await db
      .from('categories')
      .upsert({
        id: 'c0000000-0000-0000-0000-000000000001',
        name: 'Test Footwear',
        slug: 'test-footwear',
      })
  );
  check(
    await db
      .from('products')
      .upsert({
        id: productId,
        brand_id: 'b0000000-0000-0000-0000-000000000001',
        category_id: 'c0000000-0000-0000-0000-000000000001',
        name: 'Isolated Checkout Fixture',
        slug: 'isolated-checkout-fixture',
        currency: 'MZN',
        active: true,
      })
  );
  check(
    await db
      .from('product_variants')
      .upsert({
        id: 'f0000000-0000-0000-0000-000000000001',
        product_id: productId,
        size: '10.5',
        size_system: 'US',
      })
  );
  const path = `${productId}/isolated.png`;
  check(
    await db.storage
      .from('product-images')
      .upload(
        path,
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw0kAAAAASUVORK5CYII=',
          'base64'
        ),
        { contentType: 'image/png', upsert: true }
      )
  );
  const found = check(
    await db.from('product_media').select('id').eq('product_id', productId).eq('storage_path', path)
  );
  if (!found.length)
    check(
      await db
        .from('product_media')
        .insert({ product_id: productId, storage_path: path, alt_text: 'Disposable fixture' })
    );
  // Static rates are explicit store-approved fixtures, not claims of a courier integration.
  check(
    await db
      .from('shipping_methods')
      .upsert({
        id: 'a0000000-0000-0000-0000-000000000001',
        code: 'TEST_MZ',
        name: 'Test delivery',
        country_code: 'MZ',
        currency: 'MZN',
        price: 125.25,
        active: true,
        estimated_min_days: 1,
        estimated_max_days: 3,
      })
  );
  const users = check(await db.auth.admin.listUsers());
  const browserEmail = 'sprint1-browser@example.invalid';
  let browserUser = users.users.find((user) => user.email === browserEmail);
  if (!browserUser)
    browserUser = check(
      await db.auth.admin.createUser({
        email: browserEmail,
        password: 'Disposable-local-qa-2026!',
        email_confirm: true,
      })
    ).user;
  check(await db.from('user_roles').upsert({ user_id: browserUser.id, role: 'ADMIN' }));
  check(
    await db
      .from('listings')
      .upsert({
        id: 'e0000000-0000-0000-0000-000000000001',
        product_id: productId,
        variant_id: 'f0000000-0000-0000-0000-000000000001',
        ownership_type: 'STREET_CULTURE',
        condition: 'NEW',
        asking_price: 78,
        currency: 'MZN',
        quantity: 1,
        status: 'LIVE',
        authentication_status: 'PASSED',
        published_at: new Date().toISOString(),
      })
  );
  console.log(
    'Installed synthetic catalog/media and approved static-rate fixtures in the disposable project only.'
  );
}
