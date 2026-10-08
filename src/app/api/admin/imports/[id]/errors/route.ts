import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import type { ImportIssue } from '@/lib/admin/product-import';

export const runtime = 'nodejs';

function safeCell(value: unknown) {
  const text = String(value ?? '');
  return /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['products.import']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const { data: batch } = await access.supabase
    .from('product_import_batches')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: 'Import not found.' }, { status: 404 });
  const { data: rows, error } = await access.supabase
    .from('product_import_rows')
    .select('row_number,raw_data,validation_errors,status')
    .eq('batch_id', id)
    .in('status', ['INVALID', 'FAILED'])
    .order('row_number')
    .limit(500);
  if (error) return NextResponse.json({ error: 'Could not read import errors.' }, { status: 500 });
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('ERRORS');
  const fields = [
    'row_number',
    'product_reference',
    'product_name',
    'brand',
    'category',
    'selling_price',
    'currency',
    'condition',
    'ownership_type',
    'status',
    'error_field',
    'error_value',
    'error',
    'suggested_correction',
  ];
  sheet.addRow(fields);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
  sheet.columns = fields.map((field) => ({
    key: field,
    width: field === 'error' ? 60 : field === 'suggested_correction' ? 30 : 22,
  }));
  for (const row of rows ?? []) {
    const raw = row.raw_data as Record<string, string>;
    const issues = row.validation_errors as unknown as ImportIssue[];
    for (const issue of issues.length
      ? issues
      : [{ field: 'import', value: '', error: 'Import failed.', suggested: '' }]) {
      sheet.addRow([
        row.row_number,
        ...[
          'product_reference',
          'product_name',
          'brand',
          'category',
          'selling_price',
          'currency',
          'condition',
          'ownership_type',
        ].map((key) => safeCell(raw[key])),
        row.status,
        safeCell(issue.field),
        safeCell(issue.value),
        safeCell(issue.error),
        safeCell(issue.suggested),
      ]);
    }
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await book.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="street-culture-import-errors-${date}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
