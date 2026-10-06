import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';

import { mediaHeaders, parseProductImport, productHeaders, variantHeaders } from '@/lib/admin/product-import';

const context = {
  brands: [{ id: '10000000-0000-4000-8000-000000000001', name: 'Dior', active: true }],
  categories: [{ id: '20000000-0000-4000-8000-000000000001', name: 'Bags', active: true }],
  existingReferences: new Set<string>(), existingSkus: new Set<string>(),
  supabaseUrl: 'https://example.supabase.co',
};

async function workbookBuffer(price = 12000, secondReference?: string) {
  const book = new ExcelJS.Workbook();
  const products = book.addWorksheet('PRODUCTS');
  products.addRow([...productHeaders]);
  products.addRow(['BAG-001', 'Dior patterned tote', 'dior', 'Bags', '', '', '', '', '', '', '', '', price, 'mzn', 'new', 'street culture', '', false, false, false]);
  if (secondReference) products.addRow([secondReference, 'Dior second tote', 'Dior', 'Bags', '', '', '', '', '', '', '', '', 13000, 'MZN', 'NEW', 'STREET_CULTURE']);
  const variants = book.addWorksheet('VARIANTS');
  variants.addRow([...variantHeaders]);
  variants.addRow(['BAG-001', 'ONE_SIZE', 'STANDARD', '', 'BAG-001-STD', 1, '', true]);
  if (secondReference) variants.addRow([secondReference, 'ONE_SIZE', 'STANDARD', '', 'BAG-002-STD', 1, '', true]);
  book.addWorksheet('MEDIA').addRow([...mediaHeaders]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('product import staging validation', () => {
  it('normalizes a valid product and variant without publishing it', async () => {
    const parsed = await parseProductImport(await workbookBuffer(), context);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].status).toBe('VALID');
    expect(parsed.rows[0].normalized_data).toMatchObject({ reference: 'BAG-001', currency: 'MZN', ownershipType: 'STREET_CULTURE', sellingPrice: 12000 });
    expect(parsed.rows[0].validation_warnings).toEqual(expect.arrayContaining([expect.objectContaining({ error: expect.stringContaining('No product image') })]));
  });

  it('blocks negative selling prices', async () => {
    const parsed = await parseProductImport(await workbookBuffer(-1), context);
    expect(parsed.rows[0].status).toBe('INVALID');
    expect(parsed.rows[0].validation_errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'selling_price' })]));
  });

  it('blocks duplicate product references', async () => {
    const parsed = await parseProductImport(await workbookBuffer(12000, 'BAG-001'), context);
    expect(parsed.rows[1].status).toBe('INVALID');
    expect(parsed.rows[1].validation_errors).toEqual(expect.arrayContaining([expect.objectContaining({ error: expect.stringContaining('Duplicate reference') })]));
  });

  it('rejects legacy or non-zip input', async () => {
    await expect(parseProductImport(Buffer.from('not an xlsx'), context)).rejects.toThrow('valid .xlsx');
  });
});
