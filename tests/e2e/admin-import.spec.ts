import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

test('admin previews and commits an Excel import without publishing catalog stock', async ({
  page,
  request,
}) => {
  const url = process.env.LOCAL_SUPABASE_TEST_URL;
  const key = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
  test.skip(!url || !key, 'Local Supabase test credentials are required.');

  const admin = createClient(url!, key!, { auth: { persistSession: false } });
  const email = `import-admin-${randomUUID()}@example.invalid`;
  const password = `Test-${randomBytes(12).toString('hex')}`;
  const reference = `TEST-${randomBytes(6).toString('hex').toUpperCase()}`;
  const name = `Import preview ${reference}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error('Test admin missing');
  const userId = created.user.id;
  let batchId: string | null = null;
  try {
    const { error: roleError } = await admin
      .from('user_roles')
      .insert({ user_id: userId, role: 'ADMIN' });
    if (roleError) throw roleError;

    const template = await request.get('/templates/street-culture-product-import.xlsx');
    expect(template.status()).toBe(200);
    expect((await template.body()).subarray(0, 2).toString()).toBe('PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(
      join(process.cwd(), 'public', 'templates', 'street-culture-product-import.xlsx')
    );
    const products = workbook.getWorksheet('PRODUCTS')!;
    const variants = workbook.getWorksheet('VARIANTS')!;
    function fillRow(sheet: ExcelJS.Worksheet, values: Record<string, string>) {
      const headers = sheet.getRow(1);
      for (let column = 1; column <= headers.cellCount; column++) {
        const key = headers.getCell(column).text.trim();
        if (key in values) sheet.getRow(2).getCell(column).value = values[key];
      }
    }
    fillRow(products, {
      product_reference: reference,
      product_name: name,
      brand: 'Nike',
      category: 'Sneakers',
      description: 'A test-only draft for the staged import preview.',
      gender: 'UNISEX',
      selling_price: '1234.50',
      currency: 'MZN',
      condition: 'NEW',
      ownership_type: 'STREET_CULTURE',
      featured: 'FALSE',
      most_wanted: 'FALSE',
      active: 'FALSE',
    });
    fillRow(variants, {
      product_reference: reference,
      size: 'ONE_SIZE',
      size_system: 'STANDARD',
      sku: `${reference}-OS`,
      quantity: '1',
      active: 'TRUE',
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await page.goto('/auth/sign-in');
    await page.getByLabel('Email Address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/account');
    await page.goto('/admin/imports');
    await expect(page.getByRole('heading', { name: 'BULK IMPORT.' })).toBeVisible();
    await page.getByLabel('Excel workbook').setInputFiles({
      name: `${reference}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });
    await page.getByRole('button', { name: 'Upload & preview' }).click();
    await page.waitForURL(/\/admin\/imports\/[0-9a-f-]+$/);
    batchId = page.url().split('/').at(-1)!;
    await expect(page.getByRole('heading', { name: 'IMPORT PREVIEW.' })).toBeVisible();
    await expect(page.getByText(reference, { exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(reference) })).toContainText('VALID');
    await expect(page.getByText('No product image. Add media before publishing.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm create-only import' })).toBeVisible();
    const { data: catalog } = await admin
      .from('products')
      .select('id')
      .eq('import_reference', reference);
    expect(catalog).toEqual([]);
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Confirm create-only import'}).click();
    await expect(page.getByRole('row',{name:new RegExp(reference)})).toContainText('IMPORTED');
    const imported=await admin.from('products').select('active,listings(status,authentication_status,quantity)').eq('import_reference',reference).single();
    expect(imported.error).toBeNull();expect(imported.data?.active).toBe(false);expect(imported.data?.listings).toEqual([expect.objectContaining({status:'DRAFT',authentication_status:'PENDING',quantity:1})]);
  } finally {
    if (batchId) await admin.from('product_import_batches').delete().eq('id', batchId);
    await admin.from('products').delete().eq('import_reference',reference);
    await admin.from('admin_audit_logs').delete().eq('actor_id',userId);
    await admin.auth.admin.deleteUser(userId);
  }
});
