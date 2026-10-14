import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';

import {
  mediaHeaders,
  canonicalMediaHeaders,
  matchTaxonomy,
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

  it('supports single-sheet workbook without VARIANTS or MEDIA sheets and auto-generates variants', async () => {
    const book = new ExcelJS.Workbook();
    const products = book.addWorksheet('PRODUCTS');
    products.addRow([...productHeaders]);
    products.addRow([
      'MIN-001',
      'Minimal Product',
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
      5000,
    ]);
    const buf = Buffer.from(await book.xlsx.writeBuffer());
    const result = await parseProductImport(buf, context);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe('VALID');
    expect(result.rows[0].normalized_data).toMatchObject({
      currency: 'MZN',
      condition: 'NEW',
      ownershipType: 'STREET_CULTURE',
      variants: [
        expect.objectContaining({
          size: 'ONE_SIZE',
          sizeSystem: 'STANDARD',
          quantity: 1,
          active: true,
        }),
      ],
    });
  });

  it('supports multi-section CSV uploads with products and variants', async () => {
    const jordanContext = {
      ...context,
      brands: [...context.brands, { id: 'b-jordan', name: 'Jordan', active: true }],
      categories: [...context.categories, { id: 'c-sneakers', name: 'Sneakers', active: true }],
    };
    const csvContent = `product_reference,product_name,brand,category,subcategory,description,model,style_code,colorway,gender,release_year,retail_price,selling_price,currency,condition,ownership_type,seller_email,featured,most_wanted,active
SC-AJ1-TS-TP-2026,Air Jordan 1 Low OG SP x Travis Scott 'Tropical Pink',Jordan,Sneakers,Air Jordan 1 Low,"A 2026 Cactus Jack collaboration built on the Air Jordan 1 Low OG.",Air Jordan 1 Low OG SP,IQ7604-101,Sail / Tropical Pink / Shy Pink / Muslin,UNISEX,2026,155,349,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ1-TS-SP-2026,Air Jordan 1 Low OG SP x Travis Scott 'Shy Pink',Jordan,Sneakers,Air Jordan 1 Low,"The understated half of Travis Scott's 2026 'Pink Pack'.",Air Jordan 1 Low OG SP,IQ7604-100,Muslin / Shy Pink / Sail / University Red,UNISEX,2026,155,399,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ1-TS-MO-2024,Air Jordan 1 Low OG SP x Travis Scott 'Medium Olive',Jordan,Sneakers,Air Jordan 1 Low,"A coveted Travis Scott Air Jordan 1 Low OG.",Air Jordan 1 Low OG SP,DM7866-200,Medium Olive / Black / Sail / Muslin,MEN,2024,150,625,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ4-TS-CJ-2018,Air Jordan 4 Retro x Travis Scott 'Cactus Jack',Jordan,Sneakers,Air Jordan 4,"The landmark 2018 Travis Scott x Air Jordan 4.",Air Jordan 4 Retro,308497-406,University Blue / Black / Varsity Red,MEN,2018,225,1150,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ1-UNION-CS-2025,Air Jordan 1 High OG SP x Union LA 'Chicago/Shadow',Jordan,Sneakers,Air Jordan 1 High,"Union LA's reconstructed Air Jordan 1.",Air Jordan 1 Retro High OG SP,HV8563-600,Varsity Red / Black / Sail / Shadow Grey / Muslin,MEN,2025,200,225,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ4-SB-PG-2023,Nike SB x Air Jordan 4 Retro SP 'Pine Green',Jordan,Sneakers,Air Jordan 4,"A skate-engineered version of the Air Jordan 4.",Air Jordan 4 Retro SP,DR5415-103,Sail / Pine Green / Neutral Grey / White,MEN,2023,225,350,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ3-JB-MS-2023,Air Jordan 3 Retro SP x J Balvin 'Medellín Sunset',Jordan,Sneakers,Air Jordan 3,"J Balvin's first Air Jordan 3 collaboration.",Air Jordan 3 Retro SP,FN0344-901,Sail / Multi-Color / Clear / Canyon Purple / Solar Flare / Total Orange,MEN,2023,250,295,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ1-TR-CHI-2021,Air Jordan 1 High OG SP x Trophy Room 'Chicago',Jordan,Sneakers,Air Jordan 1 High,"Trophy Room's limited Air Jordan 1 High.",Air Jordan 1 Retro High OG SP,DA2728-100,White / Varsity Red / Sail / Black,MEN,2021,190,550,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ4-NS-BAB-2026,Air Jordan 4 Retro OG SP x Nigel Sylvester 'Brick After Brick',Jordan,Sneakers,Air Jordan 4,"Nigel Sylvester's 2026 'Brick After Brick' Air Jordan 4.",Air Jordan 4 Retro OG SP,IQ8055-100,Sail / Cinnabar / Anthracite / Muslin,UNISEX,2026,230,350,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ4-LDN-2026,Air Jordan 4 Retro 'London',Jordan,Sneakers,Air Jordan 4,"A 2026 UK/EU-exclusive city edition.",Air Jordan 4 Retro,IV6048-001,Black / Red Bark / Dark Smoke Grey / Smoke Grey / Hemp,MEN,2026,220,425,USD,NEW,STREET_CULTURE,,True,True,True
SC-AJ4-FEAR-2024,Air Jordan 4 Retro 'Fear',Jordan,Sneakers,Air Jordan 4,"The 2024 return of the Air Jordan 4 'Fear'.",Air Jordan 4 Retro,FQ8138-002,Black / White / Cool Grey / Pure Platinum,MEN,2024,215,240,USD,NEW,STREET_CULTURE,,False,False,True
SC-AJ1-YOTR-2023,Air Jordan 1 Low OG 'Year of the Rabbit',Jordan,Sneakers,Air Jordan 1 Low,"A limited Lunar New Year Air Jordan 1 Low OG.",Air Jordan 1 Retro Low OG,DV1312-200,Sail / University Red / Brown / Metallic Gold,MEN,2023,140,450,USD,NEW,STREET_CULTURE,,True,True,True
product_reference,size,size_system,color,sku,quantity,price_override,active
SC-AJ1-TS-TP-2026,ONE_SIZE,STANDARD,Sail / Tropical Pink / Shy Pink / Muslin,IQ7604-101-TMP,1,,True
SC-AJ1-TS-SP-2026,ONE_SIZE,STANDARD,Muslin / Shy Pink / Sail / University Red,IQ7604-100-TMP,1,,True
SC-AJ1-TS-MO-2024,ONE_SIZE,STANDARD,Medium Olive / Black / Sail / Muslin,DM7866-200-TMP,1,,True
SC-AJ4-TS-CJ-2018,ONE_SIZE,STANDARD,University Blue / Black / Varsity Red,308497-406-TMP,1,,True
SC-AJ1-UNION-CS-2025,ONE_SIZE,STANDARD,Varsity Red / Black / Sail / Shadow Grey / Muslin,HV8563-600-TMP,1,,True
SC-AJ4-SB-PG-2023,ONE_SIZE,STANDARD,Sail / Pine Green / Neutral Grey / White,DR5415-103-TMP,1,,True
SC-AJ3-JB-MS-2023,ONE_SIZE,STANDARD,Sail / Multi-Color / Clear / Canyon Purple / Solar Flare / Total Orange,FN0344-901-TMP,1,,True
SC-AJ1-TR-CHI-2021,ONE_SIZE,STANDARD,White / Varsity Red / Sail / Black,DA2728-100-TMP,1,,True
SC-AJ4-NS-BAB-2026,ONE_SIZE,STANDARD,Sail / Cinnabar / Anthracite / Muslin,IQ8055-100-TMP,1,,True
SC-AJ4-LDN-2026,ONE_SIZE,STANDARD,Black / Red Bark / Dark Smoke Grey / Smoke Grey / Hemp,IV6048-001-TMP,1,,True
SC-AJ4-FEAR-2024,ONE_SIZE,STANDARD,Black / White / Cool Grey / Pure Platinum,FQ8138-002-TMP,1,,True
SC-AJ1-YOTR-2023,ONE_SIZE,STANDARD,Sail / University Red / Brown / Metallic Gold,DV1312-200-TMP,1,,True
product_reference,image_url,sort_order,alt_text
`;
    const result = await parseProductImport(Buffer.from(csvContent, 'utf8'), jordanContext);
    expect(result.rows).toHaveLength(12);
    expect(result.rows.every((row) => row.status === 'VALID')).toBe(true);
    expect(result.rows[0].normalized_data).toMatchObject({
      reference: 'SC-AJ1-TS-TP-2026',
      name: expect.stringContaining('Tropical Pink'),
      currency: 'MZN',
      sellingPrice: 349 * 64,
      variants: [expect.objectContaining({ size: 'ONE_SIZE', sku: 'IQ7604-101-TMP' })],
    });
    expect(result.rows[11].normalized_data).toMatchObject({
      reference: 'SC-AJ1-YOTR-2023',
      name: expect.stringContaining('Year of the Rabbit'),
    });
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

  it('gracefully falls back to active catalog brands and categories when left blank', () => {
    const result = revalidateImportTaxonomy({
      rawData: { brand: '', category: '' },
      normalizedData: { name: 'Blank Brand Product' },
      validationErrors: [
        { field: 'brand', value: '', error: 'Unknown brand.' },
        { field: 'category', value: '', error: 'Unknown category.' },
      ],
      brands: context.brands,
      categories: context.categories,
    });

    expect(result.status).toBe('VALID');
    expect(result.validationErrors).toEqual([]);
    expect(result.normalizedData.brandId).toBe(context.brands[0].id);
    expect(result.normalizedData.categoryId).toBe(context.categories[0].id);
  });
});

describe('taxonomy matching resilience', () => {
  it('matches token and word boundary variations like Air Jordan to Jordan', () => {
    const brands = [
      { id: 'b1', name: 'Jordan', active: true },
      { id: 'b2', name: 'Nike', active: true },
    ];
    expect(matchTaxonomy('Air Jordan', brands)?.id).toBe('b1');
    expect(matchTaxonomy('Jordan Retro', brands)?.id).toBe('b1');
    expect(matchTaxonomy('Nike SB', brands)?.id).toBe('b2');
    expect(matchTaxonomy('NIKE', brands)?.id).toBe('b2');
  });

  it('resolves duplicate or multi-match taxonomy without returning null', () => {
    const brands = [
      { id: 'b-first', name: 'Jordan', active: true },
      { id: 'b-second', name: 'Jordan', active: true },
    ];
    expect(matchTaxonomy('Jordan', brands)?.id).toBe('b-first');
  });
});

