import ExcelJS from 'exceljs';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure } from '@/lib/admin/errors';
import { productHeaders, variantHeaders, canonicalMediaHeaders } from '@/lib/admin/product-import';
export const runtime = 'nodejs';
export async function GET() {
  const access = await capabilityApiClient(['products.import']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const brands = await access.supabase
    .from('brands')
    .select('name')
    .eq('active', true)
    .order('name')
    .limit(1000);
  const categories = await access.supabase
    .from('categories')
    .select('name')
    .eq('active', true)
    .order('name')
    .limit(1000);
  if (brands.error || categories.error)
    return adminFailure('LOOKUP_FAILED', 'Reference values unavailable.', 503);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'STREET CULTURE';
  workbook.created = new Date();
  for (const [name, headers] of [
    ['PRODUCTS', productHeaders],
    ['VARIANTS', variantHeaders],
    ['MEDIA', canonicalMediaHeaders],
  ] as const) {
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
    });
    sheet.addRow([...headers]);
    sheet.columns = headers.map((header) => ({
      width:
        header === 'description' || header === 'image_url'
          ? 50
          : header === 'product_name'
            ? 35
            : 24,
    }));
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
    });
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } };
  }
  const instructions = workbook.addWorksheet('INSTRUCTIONS');
  instructions.columns = [{ width: 30 }, { width: 100 }];
  instructions.addRows([
    [
      'IMPORT CONTRACT',
      'Create only; every imported unit is an unpublished draft with pending authentication.',
    ],
    [
      'Products',
      'Fill PRODUCTS and at least one matching VARIANTS row using the same unique product_reference.',
    ],
    [
      'Reference values',
      'Use existing active brand/category names exactly. Create taxonomy in admin before uploading.',
    ],
    [
      'Ownership / currency',
      'STREET_CULTURE / MZN. Seller stock must use the consignment intake workflow.',
    ],
    ['Variant quantity', 'Exactly 1 per physical item. Generated sizes are not inventory.'],
    [
      'MEDIA',
      'One row per photo. Use an existing public URL from this project’s product-images bucket; sort_order 0–99.',
    ],
    ['Size systems', 'US, UK, EU, CM, STANDARD. ONE_SIZE is a size value with STANDARD system.'],
    [
      'Limits',
      '500 products, 1,500 variants, 4,000 media rows, 5 MB. Values only; formulas rejected.',
    ],
    [
      'Review',
      'Upload → validation preview → confirm import → inspect/authenticate each item → publish.',
    ],
    [
      'Corrections',
      'Fix invalid/failed rows in the original workbook and upload only corrected, not-yet-imported references.',
    ],
    [
      'Existing products',
      'Use product editing/bulk actions. Imports do not overwrite existing stock, prices or identities.',
    ],
    ['Export', 'Catalog exports are a read-only operational report, not this import template.'],
  ]);
  instructions.eachRow((row) => {
    row.height = 40;
    row.alignment = { vertical: 'middle', wrapText: true };
    row.getCell(1).font = { bold: true, name: 'Arial' };
  });
  const values = workbook.addWorksheet('REFERENCE VALUES');
  values.columns = [{ width: 28 }, { width: 45 }];
  values.addRow(['Field', 'Allowed value']);
  for (const brand of brands.data ?? []) values.addRow(['brand', brand.name]);
  for (const category of categories.data ?? []) values.addRow(['category', category.name]);
  for (const [field, list] of [
    ['currency', ['MZN']],
    ['condition', ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']],
    ['ownership_type', ['STREET_CULTURE']],
    ['gender', ['MEN', 'WOMEN', 'UNISEX', 'KIDS']],
    ['size_system', ['US', 'UK', 'EU', 'CM', 'STANDARD']],
    ['boolean', ['TRUE', 'FALSE']],
  ] as const)
    for (const value of list) values.addRow([field, value]);
  values.views = [{ state: 'frozen', ySplit: 1 }];
  values.getRow(1).font = { bold: true };
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="street-culture-product-import.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
