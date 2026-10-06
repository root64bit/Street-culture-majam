import { NextResponse } from 'next/server';
import { adminApiClient } from '@/lib/admin/access';
import { parseProductImport } from '@/lib/admin/product-import';
import type { Json } from '@/types/database.types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const access = await adminApiClient();
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > 6 * 1024 * 1024) return NextResponse.json({ error: 'Workbook must be under 5 MB.' }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') ||
    !['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', ''].includes(file.type) ||
    file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Upload an .xlsx workbook under 5 MB.' }, { status: 400 });
  }
  const { supabase, user } = access;
  try {
    const [brands, categories] = await Promise.all([
      supabase.from('brands').select('id,name,active').limit(1000),
      supabase.from('categories').select('id,name,active').limit(1000),
    ]);
    if (brands.error || categories.error) throw new Error('Catalog lookup failed.');
    const existingReferences = new Set<string>();
    const existingSkus = new Set<string>();
    // PostgREST caps each response; inspect every page so older catalog entries
    // cannot slip past the preview's duplicate-reference and SKU checks.
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('products').select('import_reference')
        .not('import_reference', 'is', null).order('id').range(offset, offset + 999);
      if (error) throw new Error('Catalog lookup failed.');
      for (const item of data ?? []) if (item.import_reference) existingReferences.add(item.import_reference.toUpperCase());
      if ((data?.length ?? 0) < 1000) break;
    }
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('product_variants').select('sku')
        .not('sku', 'is', null).order('id').range(offset, offset + 999);
      if (error) throw new Error('Catalog lookup failed.');
      for (const item of data ?? []) if (item.sku) existingSkus.add(item.sku.toUpperCase());
      if ((data?.length ?? 0) < 1000) break;
    }
    const parsed = await parseProductImport(Buffer.from(await file.arrayBuffer()), {
      brands: brands.data ?? [], categories: categories.data ?? [],
      existingReferences, existingSkus,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    });
    const validCount = parsed.rows.filter((row) => row.status === 'VALID').length;
    const { data: previous } = await supabase.from('product_import_batches').select('id').eq('file_sha256', parsed.fileHash).limit(1).maybeSingle();
    const { data: batch, error: batchError } = await supabase.from('product_import_batches').insert({
      created_by: user.id, source_type: 'EXCEL', source_filename: file.name.slice(0, 255), file_sha256: parsed.fileHash,
      mode: 'CREATE_ONLY', status: validCount ? 'READY' : 'FAILED', total_rows: parsed.rows.length,
      valid_rows: validCount, invalid_rows: parsed.rows.length - validCount,
    }).select('id').single();
    if (batchError || !batch) throw new Error('Could not create the import batch.');
    for (let index = 0; index < parsed.rows.length; index += 100) {
      const { error } = await supabase.from('product_import_rows').insert(parsed.rows.slice(index, index + 100).map((row) => ({
        batch_id: batch.id, row_number: row.row_number, status: row.status,
        raw_data: row.raw_data as NonNullable<Json>, normalized_data: row.normalized_data as NonNullable<Json>,
        validation_errors: row.validation_errors as unknown as NonNullable<Json>,
        validation_warnings: row.validation_warnings as unknown as NonNullable<Json>,
      })));
      if (error) {
        await supabase.from('product_import_batches').update({ status: 'FAILED' }).eq('id', batch.id);
        throw new Error('Could not stage all workbook rows. No catalog data was changed.');
      }
    }
    return NextResponse.json({ id: batch.id, duplicateOf: previous?.id ?? null, validCount, invalidCount: parsed.rows.length - validCount }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read workbook.' }, { status: 400 });
  }
}
