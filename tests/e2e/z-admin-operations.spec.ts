import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '../../src/types/database.types';
const url = process.env.LOCAL_SUPABASE_TEST_URL,
  key = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64'
);
async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account');
}
test('superadmin uses every operational module, real fulfillment, consignment inspection and payout actions', async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(!url || !key, 'Local-only operational fixtures required.');
  const service = createClient<Database>(url!, key!, { auth: { persistSession: false } });
  const ids: string[] = [];
  const password = `Test-${randomBytes(12).toString('hex')}`;
  const orderId = randomUUID(),
    submissionId = randomUUID(),
    payoutId = randomUUID(),
    paymentId = randomUUID();
  let recordId = '';
  let privatePath = '';
  const account = await service.auth.admin.createUser({
    email: `admin-qa-${randomUUID()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (account.error || !account.data.user)
    throw account.error ?? new Error('Fixture account missing');
  const adminUser = account.data.user;
  ids.push(adminUser.id);
  const seller = await service.auth.admin.createUser({
    email: `seller-qa-${randomUUID()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (seller.error || !seller.data.user) throw seller.error ?? new Error('Fixture seller missing');
  ids.push(seller.data.user.id);
  try {
    expect(
      (await service.from('user_roles').insert({ user_id: adminUser.id, role: 'SUPER_ADMIN' }))
        .error
    ).toBeNull();
    expect((await service.from('seller_profiles').insert({ user_id: ids[1], display_name: 'Local QA seller' })).error).toBeNull();
    expect(
      (
        await service
          .from('orders')
          .insert({
            id: orderId,
            user_id: ids[1],
            order_number: `QA-${orderId}`,
            subtotal: 1000,
            total_amount: 1000,
            currency: 'MZN',
            payment_status: 'PAID',
            status: 'CONFIRMED',
            shipping_method_snapshot: { code: 'MAPUTO_PICKUP', name: 'Test pickup' },
          })
      ).error
    ).toBeNull();
    expect(
      (
        await service
          .from('payments')
          .insert({
            id: paymentId,
            order_id: orderId,
            provider: 'mpesa',
            provider_reference: `QA-${paymentId}`,
            status: 'SUCCEEDED',
            amount: 1000,
            currency: 'MZN',
            last_provider_status: 'PAID',
            provider_payload: {
              api_key: 'test-redaction-sentinel',
              thirdPartyRef: `QA-${paymentId}`,
            },
          })
      ).error
    ).toBeNull();
    expect(
      (
        await service
          .from('consignment_submissions')
          .insert({
            id: submissionId,
            seller_id: ids[1],
            brand_name: 'QA Brand',
            product_name: `QA inspection ${submissionId}`,
            size: 'STANDARD',
            size_system: 'STANDARD',
            condition: 'NEW',
            currency: 'MZN',
            expected_price: 1000,
            status: 'SUBMITTED',
          })
      ).error
    ).toBeNull();
    expect(
      (
        await service
          .from('seller_payouts')
          .insert({
            id: payoutId,
            seller_id: ids[1],
            gross_amount: 1000,
            commission_amount: 300,
            net_amount: 700,
            currency: 'MZN',
            status: 'PENDING',
          })
      ).error
    ).toBeNull();
    await login(page, adminUser.email!, password);
    for (const route of [
      '',
      'products',
      'inventory',
      'orders',
      'payments',
      'payments/reconciliation',
      'consignments',
      'authentication',
      'sellers',
      'customers',
      'payouts',
      'brands',
      'categories',
      'commissions',
      'imports',
      'media',
      'shipping',
      'reports',
      'staff',
      'settings',
      'audit',
      'notifications',
    ]) {
      const response = await page.goto(`/admin/${route}`);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator('h1'), route).toBeVisible();
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      if (['', 'products', 'inventory', 'orders', 'settings'].includes(route))
        await page.screenshot({
          path: `outputs/admin-qa/${route || 'dashboard'}-1440.png`,
          fullPage: true,
        });
    }
    await page.goto(`/admin/orders/${orderId}`);
    for (const action of [
      'START_PROCESSING',
      'MARK_PACKED',
      'MARK_READY_FOR_PICKUP',
      'MARK_DELIVERED',
    ]) {
      const section = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Next fulfillment step' }) })
        .last();
      await section.getByLabel('Action').selectOption(action);
      await section
        .getByLabel('Reason / internal note')
        .fill('Local browser QA: physical fulfillment test evidence');
      const response = page.waitForResponse(
        (r) => r.url().endsWith(`/orders/${orderId}/fulfillment`) && r.request().method() === 'POST'
      );
      await section.getByRole('button', { name: 'Record action' }).click();
      expect((await response).status()).toBe(200);
      await page.reload();
    }
    expect(
      (
        await service
          .from('orders')
          .select('status,fulfillment_status,payment_status')
          .eq('id', orderId)
          .single()
      ).data
    ).toMatchObject({
      status: 'DELIVERED',
      fulfillment_status: 'DELIVERED',
      payment_status: 'PAID',
    });
    await page.goto(`/admin/payments/${paymentId}`);
    await expect(page.getByText('test-redaction-sentinel')).toHaveCount(0);
    await page.getByLabel('Action').selectOption('FLAG');
    await page
      .getByLabel('Reason / internal note')
      .fill('Local browser QA: customer requested finance review');
    await page.getByRole('button', { name: 'Record action' }).click();
    await expect(page.getByRole('status')).toContainText('Saved and audited.');
    expect(
      (
        await service
          .from('payments')
          .select('status,reconciliation_needs_review')
          .eq('id', paymentId)
          .single()
      ).data
    ).toMatchObject({ status: 'SUCCEEDED', reconciliation_needs_review: true });
    // Provider transport is an explicit test double. The real audited service RPC
    // verifies operator permission and preserves paid order state on mismatch.
    await page.route(`**/api/admin/payments/${paymentId}/reconcile`, async (route) => {
      const checked = await service.rpc('record_provider_reconciliation', {
        target_payment_id: paymentId,
        operator_id: adminUser.id,
        provider_status: 'PROCESSING',
      });
      expect(checked.error).toBeNull();
      await route.fulfill({ json: checked.data });
    });
    await page.getByRole('button', { name: 'Check provider' }).click();
    await expect(page.getByText('Paid, but order needs review.')).toBeVisible();
    expect(
      (
        await service
          .from('payments')
          .select('status,last_provider_status')
          .eq('id', paymentId)
          .single()
      ).data
    ).toMatchObject({ status: 'SUCCEEDED', last_provider_status: 'PROCESSING' });
    await page.goto(`/admin/consignments/${submissionId}`);
    for (const action of ['START_REVIEW', 'APPROVE', 'MARK_RECEIVED', 'SEND_TO_AUTH']) {
      const form = page
        .locator('form')
        .filter({ has: page.getByRole('heading', { name: 'Review action' }) });
      await form.getByLabel('Action').selectOption(action);
      await form
        .getByLabel('Reason / inspection note')
        .fill('Local browser QA: verified operational transition');
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/consignments/${submissionId}/transition`) &&
          r.request().method() === 'POST'
      );
      await form.getByRole('button', { name: 'Save transition' }).click();
      expect((await response).status()).toBe(200);
      await page.reload();
    }
    const auth = await service
      .from('authentication_records')
      .select('id')
      .eq('consignment_submission_id', submissionId)
      .single();
    recordId = auth.data!.id;
    await page.goto(`/admin/authentication/${recordId}`);
    await page
      .getByLabel('Serial / style-code review')
      .fill('Local fixture identifier matched the test comparison.');
    await page
      .getByLabel('Comparison notes', { exact: true })
      .fill('Local fixture: human comparison completed for browser QA.');
    const checks = page
      .locator('form')
      .filter({ has: page.getByLabel('Serial / style-code review') })
      .getByRole('checkbox');
    for (let i = 0; i < (await checks.count()); i++) await checks.nth(i).check();
    await page.getByRole('button', { name: 'Save inspection' }).click();
    await expect(page.getByText('Inspection saved.')).toBeVisible();
    await page.getByLabel('Evidence caption').fill('Private browser QA evidence');
    await page
      .getByLabel('Private authentication evidence')
      .setInputFiles({ name: 'inspection.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Attach private evidence' }).click();
    await expect(page.getByText('Private evidence attached.')).toBeVisible();
    const attached = await service
      .from('authentication_evidence')
      .select('storage_path')
      .eq('record_id', recordId)
      .single();
    privatePath = attached.data!.storage_path;
    await page.getByLabel('Decision', { exact: true }).selectOption('START');
    await page
      .getByLabel('Inspection and comparison notes')
      .fill('Local browser QA: start actual test inspection');
    await page.getByRole('button', { name: 'Save audited decision' }).click();
    await expect(page.getByLabel('Confirmed condition')).toBeVisible();
    await page.getByLabel('Decision', { exact: true }).selectOption('PASS');
    await page.getByLabel('Confirmed condition').fill('NEW');
    await page
      .getByLabel('Inspection and comparison notes')
      .fill('Local browser QA: all test inspection checks passed');
    await page.getByRole('button', { name: 'Save audited decision' }).click();
    await expect(page.getByRole('button', { name: 'Save audited decision' })).toHaveCount(0);
    expect(
      (
        await service
          .from('consignment_submissions')
          .select('status')
          .eq('id', submissionId)
          .single()
      ).data?.status
    ).toBe('AUTHENTICATED');
    await page.goto('/admin/payouts?status=PENDING');
    let row = page.getByRole('row').filter({ hasText: payoutId.slice(0, 12) });
    if (!(await row.count())) row = page.getByRole('row').filter({ hasText: payoutId.slice(0, 8) });
    await row.getByRole('button', { name: 'Review payout' }).click();
    await row.getByLabel('Operator note').fill('Local browser QA: payout snapshot reconciled');
    await row.getByRole('button', { name: 'Save audited action' }).click();
    await expect
      .poll(
        async () =>
          (await service.from('seller_payouts').select('status').eq('id', payoutId).single()).data
            ?.status
      )
      .toBe('APPROVED');
    await page.goto(`/admin/sellers/${ids[1]}`);
    await expect(page.getByRole('heading', { name: /Seller verification/ })).toBeVisible();
    await page.goto('/admin/imports');
    const templateDownload = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download product import template' }).click();
    await (await templateDownload).saveAs('outputs/admin-qa/import-template.xlsx');
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'The whole picture.' })).toBeVisible();
    await page.screenshot({ path: 'outputs/admin-qa/dashboard-1024.png', fullPage: true });
  } finally {
    await service.from('seller_payouts').delete().eq('id', payoutId);
    await service.from('consignment_submissions').delete().eq('id', submissionId);
    if (privatePath) await service.storage.from('authentication-evidence').remove([privatePath]);
    await service.from('orders').delete().eq('id', orderId);
    await service.from('admin_audit_logs').delete().in('actor_id', ids);
    for (const id of ids) await service.auth.admin.deleteUser(id);
  }
});
