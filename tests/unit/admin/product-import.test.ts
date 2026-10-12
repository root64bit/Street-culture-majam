import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';

import {
  mediaHeaders,
  canonicalMediaHeaders,
  parseProductImport,
  productHeaders,
  revalidateImportTaxonomy,
  variantHeaders,
} from '@/lib/admin/product-import';

const context = {
  brands: [{ id: '10000000-0000-4000-8000-000000000001', name: 'Dior', active: true }],
  categories: [{ id: '20000000-0000-4000-8000-000000000001', name: 'Bags', active: true }],
  existingReferences: new Set<string>(),
  existingSkus: new Set<string>(),
  supabaseUrl: 'https://example.supabase.co',
  currencyRates: { MZN: 1, USD: 1 / 64, EUR: 1 / 70, ZAR: 1 / 3.5, GBP: 1 / 82 },
  exchangeRateUpdatedAt: '2026-10-12T00:00:00.000Z',
  exchangeRateSource: 'https://www.exchangerate-api.com',
};

async function workbookBuffer(price = 12000, secondReference?: string) {
  const book = new ExcelJS.Workbook();
  const products = book.addWorksheet('PRODUCTS');
  products.addRow([...productHeaders]);
  products.addRow([
    'BAG-001',
    'Dior patterned tote',
    'dior',
    'Bags',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    price,
    'mzn',
    'new',
    'street culture',
    '',
    false,
    false,
    false,
  ]);
  if (secondReference)
    products.addRow([
      secondReference,
      'Dior second tote',
      'Dior',
      'Bags',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      13000,
      'MZN',
      'NEW',
      'STREET_CULTURE',
    ]);
  const variants = book.addWorksheet('VARIANTS');
  variants.addRow([...variantHeaders]);
  variants.addRow(['BAG-001', 'ONE_SIZE', 'STANDARD', '', 'BAG-001-STD', 1, '', true]);
  if (secondReference)
    variants.addRow([secondReference, 'ONE_SIZE', 'STANDARD', '', 'BAG-002-STD', 1, '', true]);
  book.addWorksheet('MEDIA').addRow([...mediaHeaders]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('product import staging validation', () => {
  it('normalizes a valid product and variant without publishing it', async () => {
    const parsed = await parseProductImport(await workbookBuffer(), context);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].status).toBe('VALID');
    expect(parsed.rows[0].normalized_data).toMatchObject({
      reference: 'BAG-001',
      currency: 'MZN',
      ownershipType: 'STREET_CULTURE',
      sellingPrice: 12000,
    });
    expect(parsed.rows[0].validation_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error: expect.stringContaining('No product image') }),
      ])
    );
  });

  it('blocks negative selling prices', async () => {
    const parsed = await parseProductImport(await workbookBuffer(-1), context);
    expect(parsed.rows[0].status).toBe('INVALID');
    expect(parsed.rows[0].validation_errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'selling_price' })])
    );
  });

  it('converts foreign product and variant prices to canonical MZN', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await workbookBuffer(100)) as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    const products = workbook.getWorksheet('PRODUCTS')!;
    products.getCell('L2').value = 125;
    products.getCell('N2').value = 'USD';
    workbook.getWorksheet('VARIANTS')!.getCell('G2').value = 110;

    const parsed = await parseProductImport(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      context
    );

    expect(parsed.rows[0].status).toBe('VALID');
    expect(parsed.rows[0].normalized_data).toMatchObject({
      currency: 'MZN',
      sellingPrice: 6400,
      retailPrice: 8000,
      sourcePricing: {
        currency: 'USD',
        sellingPrice: 100,
        sourceToMznRate: 64,
      },
      variants: [expect.objectContaining({ priceOverride: 7040 })],
    });
    expect(parsed.rows[0].validation_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'currency',
          error: expect.stringContaining('1 USD = 64.000000 MZN'),
        }),
      ])
    );
  });

  it('blocks a foreign-currency row when a current rate is unavailable', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await workbookBuffer(100)) as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    workbook.getWorksheet('PRODUCTS')!.getCell('N2').value = 'USD';

    const parsed = await parseProductImport(Buffer.from(await workbook.xlsx.writeBuffer()), {
      ...context,
      currencyRates: { MZN: 1 },
      exchangeRateUpdatedAt: null,
      exchangeRateSource: null,
    });

    expect(parsed.rows[0].status).toBe('INVALID');
    expect(parsed.rows[0].validation_errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'currency',
          error: expect.stringContaining('exchange rate is unavailable'),
        }),
      ])
    );
  });

  it('blocks duplicate product references', async () => {
    const parsed = await parseProductImport(await workbookBuffer(12000, 'BAG-001'), context);
    expect(parsed.rows[1].status).toBe('INVALID');
    expect(parsed.rows[1].validation_errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error: expect.stringContaining('Duplicate reference') }),
      ])
    );
  });

  it('rejects legacy or non-zip input', async () => {
    await expect(parseProductImport(Buffer.from('not an xlsx'), context)).rejects.toThrow(
      'valid .xlsx'
    );
  });

  it('supports ordered canonical media rows and preserves accessible descriptions', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await workbookBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    workbook.removeWorksheet('MEDIA');
    const media = workbook.addWorksheet('MEDIA');
    media.addRow([...canonicalMediaHeaders]);
    media.addRow([
      'BAG-001',
      'https://example.supabase.co/storage/v1/object/public/product-images/test/back.png',
      2,
      'Rear construction',
    ]);
    media.addRow([
      'BAG-001',
      'https://example.supabase.co/storage/v1/object/public/product-images/test/front.png',
      0,
      'Front view',
    ]);
    const result = await parseProductImport(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      context
    );
    expect(result.rows[0].status).toBe('VALID');
    expect(result.rows[0].normalized_data.mediaPaths).toEqual(['test/front.png', 'test/back.png']);
    expect(result.rows[0].normalized_data.mediaDetails).toEqual([
      { path: 'test/front.png', altText: 'Front view' },
      { path: 'test/back.png', altText: 'Rear construction' },
    ]);
  });

  it('rejects external photo URLs without downloading them', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await workbookBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    workbook.getWorksheet('MEDIA')!.addRow(['BAG-001', 'https://external.invalid/photo.png']);
    const result = await parseProductImport(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      context
    );
    expect(
      result.rows[0].validation_errors.some((issue) => issue.error.includes('this project'))
    ).toBe(true);
  });

  it('rejects formula cells before staging', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await workbookBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    workbook.getWorksheet('PRODUCTS')!.getCell('M2').value = { formula: '1000*2', result: 2000 };
    await expect(
      parseProductImport(Buffer.from(await workbook.xlsx.writeBuffer()), context)
    ).rejects.toThrow('formula');
  });

  it('safely parses workbooks containing cell comments or notes without throwing comments errors', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await workbookBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    const cell = workbook.getWorksheet('PRODUCTS')!.getCell('M2');
    cell.note = 'International benchmark comment';
    const bufferWithNotes = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseProductImport(bufferWithNotes, context);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe('VALID');
  });
});

describe('staged import taxonomy revalidation', () => {
  it('repairs taxonomy-only validation errors after catalog values are created', () => {
    const result = revalidateImportTaxonomy({
      rawData: { brand: 'Dior', category: 'Bags' },
      normalizedData: { name: 'Lady Dior', brandId: null, categoryId: null },
      validationErrors: [
        { field: 'brand', value: 'Dior', error: 'Unknown brand.' },
        { field: 'category', value: 'Bags', error: 'Unknown category.' },
      ],
      brands: context.brands,
      categories: context.categories,
    });

    expect(result.status).toBe('VALID');
    expect(result.validationErrors).toEqual([]);
    expect(result.normalizedData).toMatchObject({
      brandId: context.brands[0].id,
      categoryId: context.categories[0].id,
    });
  });

  it('preserves unrelated errors and reports missing taxonomy values once', () => {
    const result = revalidateImportTaxonomy({
      rawData: { brand: 'Missing', category: 'Bags' },
      normalizedData: { name: 'Draft' },
      validationErrors: [
        { field: 'brand', value: 'Missing', error: 'Old taxonomy error.' },
        { field: 'selling_price', value: '', error: 'Price is required.' },
      ],
      brands: context.brands,
      categories: context.categories,
    });

    expect(result.status).toBe('INVALID');
    expect(result.validationErrors.filter((issue) => issue.field === 'brand')).toHaveLength(1);
    expect(result.validationErrors.some((issue) => issue.field === 'selling_price')).toBe(true);
    expect(result.normalizedData.categoryId).toBe(context.categories[0].id);
  });
});
