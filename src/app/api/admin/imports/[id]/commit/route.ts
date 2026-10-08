import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['products.import']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const { supabase } = access;
  const { data: batch, error: batchError } = await supabase
    .from('product_import_batches')
    .select('id,status,mode,total_rows,valid_rows,invalid_rows,imported_rows,failed_rows')
    .eq('id', id)
    .maybeSingle();
  if (batchError || !batch)
    return NextResponse.json({ error: 'Import batch not found.' }, { status: 404 });
  if (!['READY', 'IMPORTING'].includes(batch.status) || batch.mode !== 'CREATE_ONLY') {
    return NextResponse.json({ error: 'This batch cannot be imported.' }, { status: 409 });
  }
  const { data: rows, error: rowsError } = await supabase
    .from('product_import_rows')
    .select('id,row_number')
    .eq('batch_id', id)
    .eq('status', 'VALID')
    .order('row_number')
    .limit(20);
  if (rowsError)
    return NextResponse.json({ error: 'Could not read staged rows.' }, { status: 500 });
  let imported = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const { error } = await supabase.rpc('commit_product_import_row', { target_row_id: row.id });
    if (!error) imported++;
    else {
      failed++;
      await supabase
        .from('product_import_rows')
        .update({
          status: 'FAILED',
          validation_errors: [
            {
              field: 'import',
              value: '',
              error:
                error.code === '23505'
                  ? 'Duplicate product reference or SKU.'
                  : 'Database import failed; inspect catalog and retry after correction.',
            },
          ],
        })
        .eq('id', row.id)
        .eq('status', 'VALID');
    }
  }
  const { count: remaining } = await supabase
    .from('product_import_rows')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', id)
    .eq('status', 'VALID');
  if (!remaining) {
    const { count: importedCount } = await supabase
      .from('product_import_rows')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', id)
      .eq('status', 'IMPORTED');
    const { count: failedCount } = await supabase
      .from('product_import_rows')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', id)
      .eq('status', 'FAILED');
    await supabase
      .from('product_import_batches')
      .update({
        status: (failedCount ?? 0) || batch.invalid_rows ? 'PARTIAL' : 'COMPLETED',
        imported_rows: importedCount ?? 0,
        failed_rows: failedCount ?? 0,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);
  }
  return NextResponse.json({ imported, failed, remaining: remaining ?? 0 });
}
