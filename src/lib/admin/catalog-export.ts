import ExcelJS from 'exceljs';
import type { Database } from '@/types/database.types';
type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type CatalogExportProduct = Row<'products'> & {
  brand: { name: string } | null;
  category: { name: string } | null;
  product_variants: Row<'product_variants'>[];
  listings: Row<'listings'>[];
  product_media: Row<'product_media'>[];
};
export function formatDataSheet(sheet: ExcelJS.Worksheet, headers: readonly string[]) {
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1, showGridLines: false }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: headers.length },
  };
  sheet.columns = headers.map((name) => ({
    width: name.includes('description')
      ? 50
      : name.includes('name')
        ? 36
        : name.endsWith('_id') || name.includes('path')
          ? 42
          : Math.max(18, Math.min(28, name.length + 3)),
  }));
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D211A' } };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.height = 22;
    row.eachCell((cell, column) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF17251F' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: typeof cell.value === 'number' ? 'right' : 'left',
      };
      if (typeof cell.value === 'number')
        cell.numFmt = /price|amount/.test(headers[column - 1]) ? '#,##0.00' : '0';
      if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd hh:mm';
    });
  });
}
export async function buildCatalogExport(products: CatalogExportProduct[], supabaseUrl: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'STREET CULTURE';
  workbook.created = new Date();
  const sheets = {
    PRODUCTS: [
      'product_id',
      'product_reference',
      'product_name',
      'brand',
      'category',
      'description',
      'model',
      'style_code',
      'sku',
      'colorway',
      'gender',
      'release_year',
      'retail_price',
      'currency',
      'active',
      'featured',
      'most_wanted',
      'archived_at',
      'updated_at',
    ],
    VARIANTS: [
      'product_id',
      'variant_id',
      'size',
      'size_system',
      'color',
      'sku',
      'active',
      'price_override',
      'available_units',
      'reserved_units',
      'sold_units',
    ],
    LISTINGS: [
      'product_id',
      'listing_id',
      'variant_id',
      'seller_id',
      'ownership_type',
      'condition',
      'asking_price',
      'currency',
      'quantity',
      'authentication_status',
      'status',
      'reserved_by_order_id',
      'reservation_expires_at',
      'sold_at',
    ],
    MEDIA: ['product_id', 'media_id', 'storage_path', 'public_url', 'sort_order', 'alt_text'],
  };
  const dataSheets = Object.fromEntries(
    Object.entries(sheets).map(([name, headers]) => {
      const sheet = workbook.addWorksheet(name);
      sheet.addRow(headers);
      return [name, sheet];
    })
  );
  for (const product of products) {
    dataSheets.PRODUCTS.addRow([
      product.id,
      product.import_reference ?? '',
      product.name,
      product.brand?.name ?? '',
      product.category?.name ?? '',
      product.description ?? '',
      product.model ?? '',
      product.style_code ?? '',
      product.sku ?? '',
      product.colorway ?? '',
      product.gender ?? '',
      product.release_year,
      product.retail_price,
      product.currency,
      product.active,
      product.featured,
      product.most_wanted,
      product.archived_at ? new Date(product.archived_at) : null,
      new Date(product.updated_at),
    ]);
    for (const variant of product.product_variants) {
      const stock = product.listings.filter((item) => item.variant_id === variant.id);
      const quantity = (statuses: string[]) =>
        stock
          .filter((item) => statuses.includes(item.status))
          .reduce((sum, item) => sum + item.quantity, 0);
      dataSheets.VARIANTS.addRow([
        product.id,
        variant.id,
        variant.size,
        variant.size_system,
        variant.color ?? '',
        variant.sku ?? '',
        variant.active,
        variant.price_override,
        quantity(['LIVE', 'DRAFT', 'APPROVED']),
        quantity(['RESERVED']),
        stock.filter((item) => item.status === 'SOLD').length,
      ]);
    }
    for (const item of product.listings)
      dataSheets.LISTINGS.addRow([
        product.id,
        item.id,
        item.variant_id,
        item.seller_id ?? '',
        item.ownership_type,
        item.condition,
        item.asking_price,
        item.currency,
        item.quantity,
        item.authentication_status,
        item.status,
        item.reserved_by_order_id ?? '',
        item.reservation_expires_at ? new Date(item.reservation_expires_at) : null,
        item.sold_at ? new Date(item.sold_at) : null,
      ]);
    for (const media of [...product.product_media].sort((a, b) => a.sort_order - b.sort_order))
      dataSheets.MEDIA.addRow([
        product.id,
        media.id,
        media.storage_path,
        media.storage_path.startsWith('/')
          ? media.storage_path
          : `${supabaseUrl}/storage/v1/object/public/product-images/${media.storage_path}`,
        media.sort_order,
        media.alt_text ?? '',
      ]);
  }
  for (const [name, headers] of Object.entries(sheets)) formatDataSheet(dataSheets[name], headers);
  const instructions = workbook.addWorksheet('INSTRUCTIONS');
  instructions.columns = [{ width: 100 }];
  instructions.addRows([
    ['Catalog export'],
    ['Source: STREET CULTURE Supabase database. Generated at ' + new Date().toISOString()],
    [
      'This workbook is a reporting snapshot, not the product import template. Use Download Template in Product Imports for staged creation.',
    ],
    [
      'One listing represents one physical unit. Available units include live, approved and draft stock; reserved and sold units are separate.',
    ],
    [
      'Products and variants do not by themselves create sellable inventory. Checkout charges MZN; other currencies are historical source values, not display estimates.',
    ],
  ]);
  instructions.eachRow((row) => {
    row.height = 40;
    row.alignment = { wrapText: true, vertical: 'middle' };
  });
  instructions.getRow(1).font = { name: 'Arial', size: 14, bold: true };
  instructions.views = [{ showGridLines: false }];
  return workbook.xlsx.writeBuffer();
}
