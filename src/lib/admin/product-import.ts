import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { slugify } from '@/lib/schemas/admin-catalog.schema';

export const productHeaders = [
  'product_reference',
  'product_name',
  'brand',
  'category',
  'subcategory',
  'description',
  'model',
  'style_code',
  'colorway',
  'gender',
  'release_year',
  'retail_price',
  'selling_price',
  'currency',
  'condition',
  'ownership_type',
  'seller_email',
  'featured',
  'most_wanted',
  'active',
] as const;
export const variantHeaders = [
  'product_reference',
  'size',
  'size_system',
  'color',
  'sku',
  'quantity',
  'price_override',
  'active',
] as const;
export const mediaHeaders = [
  'product_reference',
  'image_1',
  'image_2',
  'image_3',
  'image_4',
  'image_5',
  'image_6',
  'image_7',
  'image_8',
] as const;
export const canonicalMediaHeaders = [
  'product_reference',
  'image_url',
  'sort_order',
  'alt_text',
] as const;

export type ImportIssue = { field: string; value: string; error: string; suggested?: string };
export type ImportRow = {
  row_number: number;
  raw_data: Record<string, string>;
  normalized_data: Record<string, unknown>;
  validation_errors: ImportIssue[];
  validation_warnings: ImportIssue[];
  status: 'VALID' | 'INVALID';
};
export type Taxonomy = { id: string; name: string; active: boolean };
export type ImportContext = {
  brands: Taxonomy[];
  categories: Taxonomy[];
  existingReferences: Set<string>;
  existingSkus: Set<string>;
  supabaseUrl: string;
};

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim().replace(/\s+/g, ' ');
  if (value instanceof Date) return value.toISOString();
  throw new Error(`Unsupported formula or rich-text cell at ${cell.address}. Paste values only.`);
}

function sheetRows(sheet: ExcelJS.Worksheet | undefined, expected: readonly string[]) {
  if (!sheet)
    throw new Error(
      `Required sheet missing: ${expected === productHeaders ? 'PRODUCTS' : expected === variantHeaders ? 'VARIANTS' : 'MEDIA'}`
    );
  const actual = sheet.getRow(1).values as unknown[];
  for (let index = 0; index < expected.length; index++) {
    const header = String(actual[index + 1] ?? '')
      .trim()
      .toLowerCase();
    if (header !== expected[index])
      throw new Error(`${sheet.name} column ${index + 1} must be ${expected[index]}.`);
  }
  const rows: { rowNumber: number; data: Record<string, string> }[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const data = Object.fromEntries(
      expected.map((key, index) => [key, cellText(row.getCell(index + 1))])
    );
    if (Object.values(data).some(Boolean)) rows.push({ rowNumber, data });
  });
  return rows;
}

function enumValue(value: string, allowed: readonly string[]) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return allowed.includes(normalized) ? normalized : null;
}

function booleanValue(value: string, fallback: boolean) {
  if (!value) return fallback;
  if (['TRUE', 'YES', '1'].includes(value.toUpperCase())) return true;
  if (['FALSE', 'NO', '0'].includes(value.toUpperCase())) return false;
  return null;
}

function money(value: string, required: boolean) {
  if (!value) return required ? null : undefined;
  const number = Number(value);
  return Number.isFinite(number) &&
    number > 0 &&
    number <= 9_999_999_999.99 &&
    Math.abs(number * 100 - Math.round(number * 100)) < 0.000001
    ? number
    : null;
}

function matchTaxonomy(value: string, options: Taxonomy[]) {
  const matches = options.filter(
    (item) => item.active && item.name.trim().toLocaleLowerCase() === value.toLocaleLowerCase()
  );
  return matches.length === 1 ? matches[0] : null;
}

function storagePathFromUrl(value: string, supabaseUrl: string): string | null {
  try {
    const url = new URL(value);
    const origin = new URL(supabaseUrl);
    const prefix = '/storage/v1/object/public/product-images/';
    if (
      url.protocol !== 'https:' ||
      url.origin !== origin.origin ||
      !url.pathname.startsWith(prefix) ||
      url.search ||
      url.hash
    )
      return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!path || path.includes('..') || !/^[a-zA-Z0-9/_\-.]+\.(png|jpe?g|webp)$/i.test(path))
      return null;
    return path;
  } catch {
    return null;
  }
}

export async function parseProductImport(buffer: Buffer, context: ImportContext) {
  if (buffer.length > 5 * 1024 * 1024 || buffer.subarray(0, 2).toString() !== 'PK')
    throw new Error('Upload a valid .xlsx file under 5 MB.');
  const workbook = new ExcelJS.Workbook();
  // ExcelJS's bundled Buffer type predates the resizable-ArrayBuffer Node types.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const products = sheetRows(workbook.getWorksheet('PRODUCTS'), productHeaders);
  const variants = sheetRows(workbook.getWorksheet('VARIANTS'), variantHeaders);
  const mediaSheet = workbook.getWorksheet('MEDIA');
  const longMedia = mediaSheet?.getRow(1).getCell(2).text.trim().toLowerCase() === 'image_url';
  const media = sheetRows(mediaSheet, longMedia ? canonicalMediaHeaders : mediaHeaders);
  if (products.length === 0 || products.length > 500)
    throw new Error('Workbook must contain 1–500 products.');
  if (variants.length > 1500) throw new Error('Workbook exceeds 1,500 variants.');
  if (media.length > 4000) throw new Error('Workbook exceeds 4,000 photos.');
  const references = new Set<string>();
  const skuSet = new Set<string>();
  const rows: ImportRow[] = products.map(({ rowNumber, data }) => {
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const add = (field: string, error: string, suggested?: string) =>
      errors.push({ field, value: data[field] ?? '', error, suggested });
    const reference = data.product_reference.toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{0,99}$/.test(reference))
      add('product_reference', 'Use 1–100 letters, digits, dots, dashes or underscores.');
    if (references.has(reference)) add('product_reference', 'Duplicate reference in workbook.');
    references.add(reference);
    if (context.existingReferences.has(reference))
      add(
        'product_reference',
        'This product reference already exists; CREATE ONLY cannot overwrite it.'
      );
    if (data.product_name.length < 3 || data.product_name.length > 160)
      add('product_name', 'Name must be 3–160 characters.');
    const brand = matchTaxonomy(data.brand, context.brands);
    const category = matchTaxonomy(data.category, context.categories);
    if (!brand) add('brand', 'Unknown or ambiguous brand. Create or map it in admin first.');
    if (!category)
      add('category', 'Unknown or ambiguous category. Create or map it in admin first.');
    const price = money(data.selling_price, true);
    const retailPrice = money(data.retail_price, false);
    if (price === null)
      add('selling_price', 'Enter a positive amount with at most two decimal places.');
    if (retailPrice === null)
      add('retail_price', 'Enter a positive amount with at most two decimal places.');
    const currency = enumValue(data.currency, ['MZN', 'EUR', 'ZAR', 'USD', 'GBP']);
    if (!currency) add('currency', 'Unsupported currency.', 'MZN');
    else if (currency !== 'MZN')
      add('currency', 'M-Pesa catalog import currently requires MZN.', 'MZN');
    const condition = enumValue(data.condition, ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']);
    if (!condition) add('condition', 'Unsupported condition.', 'NEW');
    const ownershipType = enumValue(data.ownership_type, [
      'STREET_CULTURE',
      'CONSIGNMENT',
      'PROFESSIONAL_SELLER',
    ]);
    if (!ownershipType) add('ownership_type', 'Unsupported ownership type.', 'STREET_CULTURE');
    else if (ownershipType !== 'STREET_CULTURE')
      add(
        'ownership_type',
        'This import safely supports store-owned stock only. Use consignment workflow for seller stock.'
      );
    if (data.seller_email)
      add('seller_email', 'Seller email is unsupported for store-owned stock; leave blank.');
    const gender = data.gender ? enumValue(data.gender, ['MEN', 'WOMEN', 'UNISEX', 'KIDS']) : null;
    if (data.gender && !gender) add('gender', 'Unsupported audience.');
    const releaseYear = data.release_year ? Number(data.release_year) : null;
    if (
      releaseYear !== null &&
      (!Number.isInteger(releaseYear) ||
        releaseYear < 1900 ||
        releaseYear > new Date().getFullYear() + 1)
    )
      add('release_year', 'Enter a valid year.');
    for (const key of ['featured', 'most_wanted', 'active'] as const)
      if (booleanValue(data[key], false) === null) add(key, 'Use TRUE or FALSE.');
    if (data.active && booleanValue(data.active, false) === true)
      warnings.push({
        field: 'active',
        value: data.active,
        error: 'Import creates unpublished drafts even when TRUE. Publish after review.',
      });
    if (data.description.length > 3000) add('description', 'Maximum 3,000 characters.');
    if (data.model.length > 120 || data.style_code.length > 100 || data.colorway.length > 120)
      add('model', 'Model, style code, or colorway is too long.');

    const linkedVariants = variants.filter(
      (item) => item.data.product_reference.toUpperCase() === reference
    );
    if (!linkedVariants.length)
      add('product_reference', 'At least one matching VARIANTS row is required.');
    const sizeKeys = new Set<string>();
    const normalizedVariants = linkedVariants
      .map((item) => {
        const variant = item.data;
        const sizeSystem = enumValue(variant.size_system, ['US', 'UK', 'EU', 'CM', 'STANDARD']);
        const quantity = Number(variant.quantity);
        const priceOverride = money(variant.price_override, false);
        if (!variant.size || variant.size.length > 24)
          add('product_reference', `VARIANTS row ${item.rowNumber}: size must be 1–24 characters.`);
        if (!sizeSystem)
          add('product_reference', `VARIANTS row ${item.rowNumber}: invalid size system.`);
        if (quantity !== 1)
          add(
            'product_reference',
            `VARIANTS row ${item.rowNumber}: one-of-one listings require quantity 1.`
          );
        const sizeKey = `${sizeSystem}:${variant.size.toUpperCase()}:${variant.color.toUpperCase()}`;
        if (sizeKeys.has(sizeKey))
          add('product_reference', `VARIANTS row ${item.rowNumber}: duplicate size/color variant.`);
        sizeKeys.add(sizeKey);
        if (priceOverride === null)
          add('product_reference', `VARIANTS row ${item.rowNumber}: invalid price override.`);
        if (variant.sku.length > 100)
          add('product_reference', `VARIANTS row ${item.rowNumber}: SKU too long.`);
        if (variant.sku) {
          const key = variant.sku.toUpperCase();
          if (skuSet.has(key) || context.existingSkus.has(key))
            add(
              'product_reference',
              `VARIANTS row ${item.rowNumber}: duplicate SKU ${variant.sku}.`
            );
          skuSet.add(key);
        }
        if (booleanValue(variant.active, true) === false)
          warnings.push({
            field: 'product_reference',
            value: reference,
            error: `VARIANTS row ${item.rowNumber}: inactive variant will be skipped.`,
          });
        return {
          size: variant.size,
          sizeSystem,
          color: variant.color,
          sku: variant.sku,
          quantity,
          priceOverride,
          active: booleanValue(variant.active, true),
        };
      })
      .filter((item) => item.active !== false);
    if (!normalizedVariants.length)
      add('product_reference', 'At least one active variant is required.');
    const linkedMedia = media.filter(
      (item) => item.data.product_reference.toUpperCase() === reference
    );
    if (!longMedia && linkedMedia.length > 1)
      add('product_reference', 'Only one legacy MEDIA row per product reference is allowed.');
    if (longMedia)
      for (const photo of linkedMedia) {
        if (!photo.data.image_url)
          add('product_reference', `MEDIA row ${photo.rowNumber}: image_url is required.`);
        if (!/^\d{1,3}$/.test(photo.data.sort_order) || Number(photo.data.sort_order) > 99)
          add('product_reference', `MEDIA row ${photo.rowNumber}: sort_order must be 0–99.`);
        if (photo.data.alt_text.length > 300)
          add(
            'product_reference',
            `MEDIA row ${photo.rowNumber}: alt_text maximum 300 characters.`
          );
      }
    linkedMedia.sort((a, b) => Number(a.data.sort_order ?? 0) - Number(b.data.sort_order ?? 0));
    const imageUrls = linkedMedia.flatMap((item) =>
      longMedia
        ? [item.data.image_url].filter(Boolean)
        : mediaHeaders
            .slice(1)
            .map((header) => item.data[header])
            .filter(Boolean)
    );
    if (imageUrls.length > 100) add('product_reference', 'Maximum 100 photos per product.');
    const mediaPaths = imageUrls
      .map((url) => {
        const path = storagePathFromUrl(url, context.supabaseUrl);
        if (!path)
          add(
            'product_reference',
            'MEDIA URLs must point to this project’s public product-images bucket.'
          );
        return path;
      })
      .filter((path): path is string => Boolean(path));
    if (new Set(mediaPaths).size !== mediaPaths.length)
      add('product_reference', 'Duplicate image in MEDIA row.');
    if (!mediaPaths.length)
      warnings.push({
        field: 'product_reference',
        value: reference,
        error: 'No product image. Add media before publishing.',
      });
    return {
      row_number: rowNumber,
      raw_data: data,
      normalized_data: {
        reference,
        name: data.product_name,
        slug: slugify(data.product_name),
        brandId: brand?.id,
        categoryId: category?.id,
        description: data.description,
        model: data.model,
        styleCode: data.style_code,
        colorway: data.colorway,
        gender,
        releaseYear,
        retailPrice,
        sellingPrice: price,
        currency,
        condition,
        ownershipType,
        featured: booleanValue(data.featured, false),
        mostWanted: booleanValue(data.most_wanted, false),
        variants: normalizedVariants,
        mediaPaths,
        mediaDetails: longMedia
          ? linkedMedia.map((item) => ({
              path: storagePathFromUrl(item.data.image_url, context.supabaseUrl),
              altText: item.data.alt_text || data.product_name,
            }))
          : [],
      },
      validation_errors: errors,
      validation_warnings: warnings,
      status: errors.length ? 'INVALID' : 'VALID',
    };
  });
  for (const item of variants)
    if (!references.has(item.data.product_reference.toUpperCase()))
      throw new Error(`VARIANTS row ${item.rowNumber} references no PRODUCT.`);
  for (const item of media)
    if (!references.has(item.data.product_reference.toUpperCase()))
      throw new Error(`MEDIA row ${item.rowNumber} references no PRODUCT.`);
  return { fileHash: createHash('sha256').update(buffer).digest('hex'), rows };
}
