// @vitest-environment node
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildCatalogExport, formatDataSheet } from '@/lib/admin/catalog-export';
describe('catalog Excel reporting contract', () => {
  it('exports all reporting sheets even for an empty catalog', async () => {
    const buffer = await buildCatalogExport([], 'https://example.supabase.co');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets.map((v) => v.name)).toEqual([
      'PRODUCTS',
      'VARIANTS',
      'LISTINGS',
      'MEDIA',
      'INSTRUCTIONS',
    ]);
    expect(workbook.getWorksheet('PRODUCTS')!.getCell('A1').value).toBe('product_id');
    expect(workbook.getWorksheet('PRODUCTS')!.views[0]).toMatchObject({
      state: 'frozen',
      xSplit: 1,
      ySplit: 1,
    });
  });
  it('keeps prices numeric, quantities integral and identifiers as literal strings', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('test');
    sheet.addRow(['sku', 'asking_price', 'quantity']);
    sheet.addRow(['=not-a-formula', 1234.5, 1]);
    formatDataSheet(sheet, ['sku', 'asking_price', 'quantity']);
    expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('B2').value).toBe(1234.5);
    expect(sheet.getCell('B2').numFmt).toBe('#,##0.00');
    expect(sheet.getCell('C2').numFmt).toBe('0');
  });
});
