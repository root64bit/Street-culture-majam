import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import {
  SUPPORTED_CURRENCIES,
  convertToMzn,
  sourceToMznRate,
  type CurrencyRates,
  type SupportedCurrency,
} from '@/lib/currency';
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
  currencyRates: CurrencyRates;
  exchangeRateUpdatedAt: string | null;
  exchangeRateSource: string | null;
};

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim().replace(/\s+/g, ' ');
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText
        .map((p) => p.text || '')
        .join('')
        .trim()
        .replace(/\s+/g, ' ');
    }
    if ('formula' in value) {
      throw new Error(`Unsupported formula or rich-text cell at ${cell.address}. Paste values only.`);
    }
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') {
      return (value as { text: string }).text.trim().replace(/\s+/g, ' ');
    }
  }
  if (cell.text) return String(cell.text).trim().replace(/\s+/g, ' ');
  throw new Error(`Unsupported formula or rich-text cell at ${cell.address}. Paste values only.`);
}

function findWorksheet(
  workbook: ExcelJS.Workbook,
  aliases: readonly string[]
): ExcelJS.Worksheet | undefined {
  for (const alias of aliases) {
    const direct = workbook.getWorksheet(alias);
    if (direct) return direct;
  }
  for (const sheet of workbook.worksheets) {
    const name = sheet.name.trim().toLowerCase().replace(/[\s_-]+/g, '');
    for (const alias of aliases) {
      if (name === alias.trim().toLowerCase().replace(/[\s_-]+/g, '')) return sheet;
    }
  }
  return undefined;
}

function sheetRows(
  sheet: ExcelJS.Worksheet | undefined,
  expected: readonly string[],
  required = true
): { rowNumber: number; data: Record<string, string> }[] {
  if (!sheet) {
    if (required) {
      throw new Error(
        `Required sheet missing: ${expected === productHeaders ? 'PRODUCTS' : expected === variantHeaders ? 'VARIANTS' : 'MEDIA'}`
      );
    }
    return [];
  }
  const headerRow = sheet.getRow(1);
  const colMap = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const raw = String(cell.value ?? cell.text ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (raw) colMap.set(raw, colNumber);
  });

  const actual = headerRow.values as unknown[];
  // Maintain backward-compatible positional check if headers are not mapped by name
  if (required && colMap.size === 0) {
    for (let index = 0; index < expected.length; index++) {
      const header = String(actual[index + 1] ?? '')
        .trim()
        .toLowerCase();
      if (header !== expected[index])
        throw new Error(`${sheet.name} column ${index + 1} must be ${expected[index]}.`);
    }
  }

  const rows: { rowNumber: number; data: Record<string, string> }[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const data: Record<string, string> = {};
    for (let index = 0; index < expected.length; index++) {
      const key = expected[index];
      const colIdx = colMap.get(key) ?? index + 1;
      const cell = row.getCell(colIdx);
      data[key] = cell ? cellText(cell) : '';
    }
    if (Object.values(data).some(Boolean)) rows.push({ rowNumber, data });
  });
  return rows;
}

function enumValue(value: string | undefined, allowed: readonly string[]) {
  if (!value) return null;
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return allowed.includes(normalized) ? normalized : null;
}

function booleanValue(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  const clean = String(value).trim().toUpperCase();
  if (['TRUE', 'YES', '1', 'T', 'SIM'].includes(clean)) return true;
  if (['FALSE', 'NO', '0', 'F', 'NAO', 'NÃO'].includes(clean)) return false;
  return null;
}

function cleanMoney(value: string | number | undefined, required: boolean): number | null | undefined {
  if (value === undefined || value === null || value === '') return required ? null : undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 && value <= 9_999_999_999.99
      ? Math.round(value * 100) / 100
      : null;
  }
  const cleanStr = String(value)
    .replace(/[$€£R]|MZN|MT|USD|EUR|GBP|ZAR/gi, '')
    .trim();
  let normalized = cleanStr;
  if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  } else if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/,/g, '');
  }
  const number = Number(normalized);
  return Number.isFinite(number) &&
    number > 0 &&
    number <= 9_999_999_999.99 &&
    Math.abs(number * 100 - Math.round(number * 100)) < 0.000001
    ? Math.round(number * 100) / 100
    : null;
}

function matchTaxonomy(value: string | undefined, options: Taxonomy[]) {
  if (!value) return null;
  const clean = value.trim().toLowerCase();
  const normalized = clean.replace(/[\s_-]+/g, ' ');

  // 1. Exact match
  const exact = options.filter(
    (item) => item.active && item.name.trim().toLowerCase() === clean
  );
  if (exact.length === 1) return exact[0];

  // 2. Normalized spacing match
  const normalizedMatch = options.filter(
    (item) => item.active && item.name.trim().toLowerCase().replace(/[\s_-]+/g, ' ') === normalized
  );
  if (normalizedMatch.length === 1) return normalizedMatch[0];

  // 3. Substring / contains match
  const partial = options.filter(
    (item) =>
      item.active &&
      (normalized.includes(item.name.trim().toLowerCase()) ||
        item.name.trim().toLowerCase().includes(normalized))
  );
  if (partial.length === 1) return partial[0];

  return null;
}

export function revalidateImportTaxonomy({
  rawData,
  normalizedData,
  validationErrors,
  brands,
  categories,
}: {
  rawData: Record<string, string>;
  normalizedData: Record<string, unknown>;
  validationErrors: ImportIssue[];
  brands: Taxonomy[];
  categories: Taxonomy[];
}) {
  const nextErrors = validationErrors.filter(
    (issue) => issue.field !== 'brand' && issue.field !== 'category'
  );
  const brand = matchTaxonomy(rawData.brand ?? '', brands);
  const category = matchTaxonomy(rawData.category ?? '', categories);
  if (!brand)
    nextErrors.push({
      field: 'brand',
      value: rawData.brand ?? '',
      error: 'Unknown or ambiguous brand. Create or map it in admin first.',
    });
  if (!category)
    nextErrors.push({
      field: 'category',
      value: rawData.category ?? '',
      error: 'Unknown or ambiguous category. Create or map it in admin first.',
    });
  return {
    normalizedData: {
      ...normalizedData,
      brandId: brand?.id ?? null,
      categoryId: category?.id ?? null,
    },
    validationErrors: nextErrors,
    status: nextErrors.length ? ('INVALID' as const) : ('VALID' as const),
  };
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

function parseCsvRows(text: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if ((char === ',' || char === ';') && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.some((col) => col.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((col) => col.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseCsvMultiSection(text: string): {
  products: { rowNumber: number; data: Record<string, string> }[];
  variants: { rowNumber: number; data: Record<string, string> }[];
  media: { rowNumber: number; data: Record<string, string> }[];
} {
  const rows = parseCsvRows(text);
  const products: { rowNumber: number; data: Record<string, string> }[] = [];
  const variants: { rowNumber: number; data: Record<string, string> }[] = [];
  const media: { rowNumber: number; data: Record<string, string> }[] = [];

  let section: 'PRODUCTS' | 'VARIANTS' | 'MEDIA' | 'IGNORE' = 'PRODUCTS';
  let productHeaderMap = new Map<string, number>();
  let variantHeaderMap = new Map<string, number>();
  let mediaHeaderMap = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const first = (row[0] || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const second = (row[1] || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

    if (first === 'product_reference' && (second === 'product_name' || second === 'name')) {
      section = 'PRODUCTS';
      productHeaderMap = new Map();
      row.forEach((h, idx) => {
        const norm = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (norm) productHeaderMap.set(norm, idx);
      });
      continue;
    }
    if (first === 'product_reference' && second === 'size') {
      section = 'VARIANTS';
      variantHeaderMap = new Map();
      row.forEach((h, idx) => {
        const norm = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (norm) variantHeaderMap.set(norm, idx);
      });
      continue;
    }
    if (first === 'product_reference' && (second === 'image_url' || second === 'image_1')) {
      section = 'MEDIA';
      mediaHeaderMap = new Map();
      row.forEach((h, idx) => {
        const norm = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (norm) mediaHeaderMap.set(norm, idx);
      });
      continue;
    }
    if (
      first.startsWith('import_contract') ||
      first.startsWith('import contract') ||
      first === 'field' ||
      first === 'reference_values'
    ) {
      section = 'IGNORE';
      continue;
    }

    if (section === 'PRODUCTS') {
      const data: Record<string, string> = {};
      if (productHeaderMap.size > 0) {
        for (const [key, colIdx] of productHeaderMap.entries()) {
          data[key] = (row[colIdx] || '').trim();
        }
      } else {
        productHeaders.forEach((key, idx) => {
          data[key] = (row[idx] || '').trim();
        });
      }
      if (Object.values(data).some(Boolean)) {
        products.push({ rowNumber: i + 1, data });
      }
    } else if (section === 'VARIANTS') {
      const data: Record<string, string> = {};
      if (variantHeaderMap.size > 0) {
        for (const [key, colIdx] of variantHeaderMap.entries()) {
          data[key] = (row[colIdx] || '').trim();
        }
      } else {
        variantHeaders.forEach((key, idx) => {
          data[key] = (row[idx] || '').trim();
        });
      }
      if (Object.values(data).some(Boolean)) {
        variants.push({ rowNumber: i + 1, data });
      }
    } else if (section === 'MEDIA') {
      const data: Record<string, string> = {};
      if (mediaHeaderMap.size > 0) {
        for (const [key, colIdx] of mediaHeaderMap.entries()) {
          data[key] = (row[colIdx] || '').trim();
        }
      } else {
        canonicalMediaHeaders.forEach((key, idx) => {
          data[key] = (row[idx] || '').trim();
        });
      }
      if (Object.values(data).some(Boolean)) {
        media.push({ rowNumber: i + 1, data });
      }
    }
  }

  return { products, variants, media };
}

export async function sanitizeWorkbookBuffer(buffer: Buffer): Promise<Buffer> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    let modified = false;

    const relsFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith('xl/worksheets/_rels/') && name.endsWith('.rels')
    );
    for (const relsPath of relsFiles) {
      const file = zip.file(relsPath);
      if (!file) continue;
      const xml = await file.async('text');
      const cleaned = xml.replace(
        /<Relationship\b[^>]*?(?:comments|vmlDrawing|drawing|printerSettings)[^>]*?\/>/gi,
        ''
      );
      if (cleaned !== xml) {
        zip.file(relsPath, cleaned);
        modified = true;
      }
    }

    for (const name of Object.keys(zip.files)) {
      if (
        name.startsWith('xl/comments/') ||
        /^xl\/comments\d+\.xml$/i.test(name) ||
        name.startsWith('xl/drawings/') ||
        name.startsWith('xl/printerSettings/')
      ) {
        zip.remove(name);
        modified = true;
      }
    }

    const sheetFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith('xl/worksheets/') && name.endsWith('.xml')
    );
    for (const sheetPath of sheetFiles) {
      const file = zip.file(sheetPath);
      if (!file) continue;
      const xml = await file.async('text');
      const cleaned = xml
        .replace(/<legacyDrawing\b[^>]*?\/>/gi, '')
        .replace(/<legacyDrawingHF\b[^>]*?\/>/gi, '')
        .replace(/<drawing\b[^>]*?\/>/gi, '')
        .replace(/<comments\b[^>]*?\/>/gi, '')
        .replace(/<commentPr\b[\s\S]*?<\/commentPr>/gi, '')
        .replace(/<pageSetUpPr\b[^>]*?\/>/gi, '')
        .replace(/<printerSettings\b[^>]*?\/>/gi, '');
      if (cleaned !== xml) {
        zip.file(sheetPath, cleaned);
        modified = true;
      }
    }

    if (modified) {
      const sanitized = await zip.generateAsync({ type: 'nodebuffer' });
      return Buffer.from(sanitized);
    }
  } catch {
    // If ZIP manipulation fails, fall back to the original buffer.
  }
  return buffer;
}

export async function parseProductImport(buffer: Buffer, context: ImportContext) {
  if (buffer.length > 5 * 1024 * 1024)
    throw new Error('Upload a valid .xlsx or .csv file under 5 MB.');

  let products: { rowNumber: number; data: Record<string, string> }[] = [];
  let variants: { rowNumber: number; data: Record<string, string> }[] = [];
  let media: { rowNumber: number; data: Record<string, string> }[] = [];
  let longMedia = true;

  if (buffer.subarray(0, 2).toString() === 'PK') {
    let workbook = new ExcelJS.Workbook();
    let loaded = false;
    try {
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      loaded = true;
    } catch {
      try {
        const sanitizedBuffer = await sanitizeWorkbookBuffer(buffer);
        workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(
          sanitizedBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
        );
        loaded = true;
      } catch (err) {
        console.error('Excel parse error:', err);
      }
    }

    if (!loaded) {
      throw new Error(
        'Could not parse Excel workbook. Ensure the file is not corrupted or password-protected.'
      );
    }

    const productsSheet =
      findWorksheet(workbook, ['PRODUCTS', 'products', 'Products', 'PRODUTOS', 'Sheet1']) ??
      workbook.worksheets[0];
    const variantsSheet = findWorksheet(workbook, ['VARIANTS', 'variants', 'Variants', 'VARIANTES']);
    const mediaSheet = findWorksheet(workbook, ['MEDIA', 'media', 'Media', 'FOTOS', 'IMAGES', 'Photos']);

    products = sheetRows(productsSheet, productHeaders, true);
    variants = variantsSheet ? sheetRows(variantsSheet, variantHeaders, false) : [];
    longMedia = mediaSheet?.getRow(1).getCell(2).text.trim().toLowerCase() === 'image_url';
    media = mediaSheet ? sheetRows(mediaSheet, longMedia ? canonicalMediaHeaders : mediaHeaders, false) : [];
  } else {
    const text = buffer.toString('utf8');
    if (
      !text.includes(',') &&
      !text.includes(';') &&
      !text.includes('\t') &&
      !text.includes('\n')
    ) {
      throw new Error('Upload a valid .xlsx or .csv file under 5 MB.');
    }
    const parsedCsv = parseCsvMultiSection(text);
    products = parsedCsv.products;
    variants = parsedCsv.variants;
    media = parsedCsv.media;
    longMedia = true;
    if (products.length === 0) {
      throw new Error('Upload a valid .xlsx or .csv file containing product rows.');
    }
  }

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

    const rawRef = (data.product_reference ?? '').trim();
    let reference = rawRef.toUpperCase();
    if (!reference) {
      const baseSlug = slugify(data.product_name || `item-${rowNumber}`)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '-')
        .slice(0, 30);
      reference = `SC-${baseSlug || 'ITEM'}-${rowNumber}`;
    }
    reference = reference.replace(/[^A-Z0-9._-]/g, '-');
    if (!/^[A-Z0-9][A-Z0-9._-]{0,99}$/.test(reference)) {
      add('product_reference', 'Use 1–100 letters, digits, dots, dashes or underscores.');
    }
    if (references.has(reference)) {
      add('product_reference', 'Duplicate reference in workbook.');
    }
    references.add(reference);

    if (context.existingReferences.has(reference))
      add(
        'product_reference',
        'This product reference already exists; CREATE ONLY cannot overwrite it.'
      );

    const name = (data.product_name ?? '').trim();
    if (name.length < 3 || name.length > 160)
      add('product_name', 'Name must be 3–160 characters.');

    const brand = matchTaxonomy(data.brand, context.brands);
    const category = matchTaxonomy(data.category, context.categories);
    if (!brand) add('brand', 'Unknown or ambiguous brand. Create or map it in admin first.');
    if (!category)
      add('category', 'Unknown or ambiguous category. Create or map it in admin first.');

    const sourcePrice = cleanMoney(data.selling_price, true);
    const sourceRetailPrice = cleanMoney(data.retail_price, false);
    if (sourcePrice === null || sourcePrice === undefined)
      add('selling_price', 'Enter a positive amount with at most two decimal places.');
    if (sourceRetailPrice === null)
      add('retail_price', 'Enter a positive amount with at most two decimal places.');

    const rawCurr = (data.currency ?? '').trim().toUpperCase();
    const currMapped =
      rawCurr === '$'
        ? 'USD'
        : rawCurr === '€'
          ? 'EUR'
          : rawCurr === '£'
            ? 'GBP'
            : rawCurr === 'R'
              ? 'ZAR'
              : rawCurr === 'MT' || rawCurr === 'MTN'
                ? 'MZN'
                : rawCurr;
    const currency = (currMapped
      ? enumValue(currMapped, SUPPORTED_CURRENCIES)
      : 'MZN') as SupportedCurrency | null;
    if (!currency) add('currency', 'Unsupported currency.', 'MZN');

    const conversionRate = currency ? sourceToMznRate(currency, context.currencyRates) : null;
    if (currency && !conversionRate)
      add(
        'currency',
        'A current MZN exchange rate is unavailable. Retry later or upload MZN prices.',
        'MZN'
      );

    const price =
      typeof sourcePrice === 'number' && currency && conversionRate
        ? convertToMzn(sourcePrice, currency, context.currencyRates)
        : sourcePrice;
    const retailPrice =
      typeof sourceRetailPrice === 'number' && currency && conversionRate
        ? convertToMzn(sourceRetailPrice, currency, context.currencyRates)
        : sourceRetailPrice;

    if (typeof sourcePrice === 'number' && conversionRate && price === null)
      add('selling_price', 'Converted MZN amount exceeds the supported price range.');
    if (typeof sourceRetailPrice === 'number' && conversionRate && retailPrice === null)
      add('retail_price', 'Converted MZN amount exceeds the supported price range.');

    if (currency && currency !== 'MZN' && conversionRate)
      warnings.push({
        field: 'currency',
        value: currency,
        error: `Converted to MZN at 1 ${currency} = ${conversionRate.toFixed(6)} MZN${context.exchangeRateUpdatedAt ? ` using the rate dated ${context.exchangeRateUpdatedAt.slice(0, 10)}` : ''}. Review the MZN amount before confirming the import.`,
      });

    const rawCond = (data.condition ?? '').trim();
    const condition = rawCond
      ? (enumValue(rawCond, ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']) ?? 'NEW')
      : 'NEW';

    const rawOwner = (data.ownership_type ?? '').trim();
    const ownershipType = rawOwner
      ? (enumValue(rawOwner, ['STREET_CULTURE', 'CONSIGNMENT', 'PROFESSIONAL_SELLER']) ??
        'STREET_CULTURE')
      : 'STREET_CULTURE';
    if (ownershipType !== 'STREET_CULTURE')
      add(
        'ownership_type',
        'This import safely supports store-owned stock only. Use consignment workflow for seller stock.'
      );
    if (data.seller_email)
      add('seller_email', 'Seller email is unsupported for store-owned stock; leave blank.');

    const rawGender = (data.gender ?? '').trim().toUpperCase();
    const gender = rawGender
      ? (enumValue(rawGender, ['MEN', 'WOMEN', 'UNISEX', 'KIDS']) ||
        (rawGender.startsWith('M')
          ? 'MEN'
          : rawGender.startsWith('W') || rawGender.startsWith('F')
            ? 'WOMEN'
            : 'UNISEX'))
      : 'UNISEX';

    const rawYear = (data.release_year ?? '').trim();
    const releaseYear = rawYear ? Number(rawYear) : null;
    if (
      releaseYear !== null &&
      (!Number.isInteger(releaseYear) ||
        releaseYear < 1900 ||
        releaseYear > new Date().getFullYear() + 2)
    )
      add('release_year', 'Enter a valid year.');

    for (const key of ['featured', 'most_wanted', 'active'] as const)
      if (data[key] && booleanValue(data[key], false) === null) add(key, 'Use TRUE or FALSE.');

    if (data.active && booleanValue(data.active, true) === true)
      warnings.push({
        field: 'active',
        value: data.active,
        error: 'Import creates unpublished drafts even when TRUE. Publish after review.',
      });

    if ((data.description ?? '').length > 5000) add('description', 'Maximum 5,000 characters.');
    if (
      (data.model ?? '').length > 120 ||
      (data.style_code ?? '').length > 100 ||
      (data.colorway ?? '').length > 120
    )
      add('model', 'Model, style code, or colorway is too long.');

    const linkedVariants = variants.filter(
      (item) =>
        item.data.product_reference.trim().toUpperCase() === reference ||
        item.data.product_reference.trim().toUpperCase() === rawRef.toUpperCase()
    );
    const effectiveVariants =
      linkedVariants.length > 0
        ? linkedVariants
        : [
            {
              rowNumber,
              data: {
                product_reference: reference,
                size: 'ONE_SIZE',
                size_system: 'STANDARD',
                color: data.colorway || '',
                sku: data.style_code ? `${data.style_code}-TMP` : `${reference}-STD`,
                quantity: '1',
                price_override: '',
                active: 'TRUE',
              },
            },
          ];

    const sizeKeys = new Set<string>();
    const normalizedVariants = effectiveVariants
      .map((item) => {
        const variant = item.data;
        const rawSizeSys = (variant.size_system ?? '').trim().toUpperCase();
        const sizeSystem =
          (rawSizeSys ? enumValue(rawSizeSys, ['US', 'UK', 'EU', 'CM', 'STANDARD']) : null) ??
          'STANDARD';
        const sizeVal = (variant.size ?? '').trim() || 'ONE_SIZE';
        const quantity = Number(variant.quantity) || 1;
        const sourcePriceOverride = cleanMoney(variant.price_override, false);
        const priceOverride =
          typeof sourcePriceOverride === 'number' && currency && conversionRate
            ? convertToMzn(sourcePriceOverride, currency, context.currencyRates)
            : sourcePriceOverride;

        if (sizeVal.length > 24)
          add('product_reference', `VARIANTS row ${item.rowNumber}: size must be 1–24 characters.`);
        if (!sizeSystem)
          add('product_reference', `VARIANTS row ${item.rowNumber}: invalid size system.`);
        if (quantity !== 1)
          add(
            'product_reference',
            `VARIANTS row ${item.rowNumber}: one-of-one listings require quantity 1.`
          );

        const colorVal = (variant.color ?? '').trim();
        const sizeKey = `${sizeSystem}:${sizeVal.toUpperCase()}:${colorVal.toUpperCase()}`;
        if (sizeKeys.has(sizeKey))
          add('product_reference', `VARIANTS row ${item.rowNumber}: duplicate size/color variant.`);
        sizeKeys.add(sizeKey);

        if (sourcePriceOverride === null)
          add('product_reference', `VARIANTS row ${item.rowNumber}: invalid price override.`);
        else if (
          typeof sourcePriceOverride === 'number' &&
          conversionRate &&
          priceOverride === null
        )
          add(
            'product_reference',
            `VARIANTS row ${item.rowNumber}: converted MZN price override is out of range.`
          );

        let finalSku = (variant.sku ?? '').trim();
        if (finalSku.length > 100)
          add('product_reference', `VARIANTS row ${item.rowNumber}: SKU too long.`);
        if (finalSku) {
          const key = finalSku.toUpperCase();
          if (skuSet.has(key) || context.existingSkus.has(key)) {
            finalSku = `${finalSku}-${item.rowNumber}`;
          }
          skuSet.add(finalSku.toUpperCase());
        }

        if (booleanValue(variant.active, true) === false)
          warnings.push({
            field: 'product_reference',
            value: reference,
            error: `VARIANTS row ${item.rowNumber}: inactive variant will be skipped.`,
          });

        return {
          size: sizeVal,
          sizeSystem,
          color: colorVal,
          sku: finalSku,
          quantity,
          priceOverride,
          active: booleanValue(variant.active, true),
        };
      })
      .filter((item) => item.active !== false);

    if (!normalizedVariants.length)
      add('product_reference', 'At least one active variant is required.');

    const linkedMedia = media.filter(
      (item) =>
        item.data.product_reference.trim().toUpperCase() === reference ||
        item.data.product_reference.trim().toUpperCase() === rawRef.toUpperCase()
    );
    if (!longMedia && linkedMedia.length > 1)
      add('product_reference', 'Only one legacy MEDIA row per product reference is allowed.');
    if (longMedia)
      for (const photo of linkedMedia) {
        if (!photo.data.image_url) continue;
        if (
          photo.data.sort_order &&
          (!/^\d{1,3}$/.test(photo.data.sort_order) || Number(photo.data.sort_order) > 99)
        )
          add('product_reference', `MEDIA row ${photo.rowNumber}: sort_order must be 0–99.`);
        if ((photo.data.alt_text ?? '').length > 300)
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
        description: data.description ?? '',
        model: data.model ?? '',
        styleCode: data.style_code ?? '',
        colorway: data.colorway ?? '',
        gender,
        releaseYear,
        retailPrice,
        sellingPrice: price,
        currency: currency && conversionRate ? 'MZN' : null,
        condition,
        ownershipType,
        featured: booleanValue(data.featured, false),
        mostWanted: booleanValue(data.most_wanted, false),
        variants: normalizedVariants,
        sourcePricing: currency
          ? {
              currency,
              sellingPrice: sourcePrice,
              retailPrice: sourceRetailPrice,
              sourceToMznRate: conversionRate,
              rateUpdatedAt: context.exchangeRateUpdatedAt,
              rateSource: context.exchangeRateSource,
            }
          : null,
        mediaPaths,
        mediaDetails: longMedia
          ? linkedMedia
              .filter((item) => Boolean(item.data.image_url))
              .map((item) => ({
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

  for (const item of variants) {
    const vRef = (item.data.product_reference || '').trim().toUpperCase();
    if (vRef && !references.has(vRef))
      throw new Error(`VARIANTS row ${item.rowNumber} references no PRODUCT.`);
  }
  for (const item of media) {
    const mRef = (item.data.product_reference || '').trim().toUpperCase();
    if (mRef && !references.has(mRef))
      throw new Error(`MEDIA row ${item.rowNumber} references no PRODUCT.`);
  }

  return { fileHash: createHash('sha256').update(buffer).digest('hex'), rows };
}
