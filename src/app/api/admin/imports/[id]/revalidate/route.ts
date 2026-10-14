import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import {
  revalidateImportTaxonomy,
  type ImportIssue,
  type Taxonomy,
} from '@/lib/admin/product-import';
import { ensureTaxonomiesExist } from '@/lib/admin/taxonomy-sync';
import type { Json } from '@/types/database.types';

export const runtime = 'nodejs';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['products.import']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const { supabase } = access;
  const [{ data: batch, error: batchError }, rows] = await Promise.all([
    supabase
      .from('product_import_batches')
      .select('id,status,mode,total_rows,imported_rows,failed_rows')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('product_import_rows')
      .select('id,raw_data,normalized_data,validation_errors,status')
      .eq('batch_id', id)
      .in('status', ['VALID', 'INVALID'])
      .order('row_number')
      .limit(2000),
  ]);
  if (batchError || !batch)
    return NextResponse.json({ error: 'Import batch not found.' }, { status: 404 });
  if (
    batch.mode !== 'CREATE_ONLY' ||
    !['FAILED', 'READY'].includes(batch.status) ||
    batch.imported_rows > 0 ||
    batch.failed_rows > 0
  )
    return NextResponse.json(
      { error: 'This batch cannot be revalidated after importing has started.' },
      { status: 409 }
    );
  if (rows.error)
    return NextResponse.json({ error: 'Catalog lookup failed.' }, { status: 503 });
  if ((rows.data?.length ?? 0) !== batch.total_rows)
    return NextResponse.json(
      { error: 'The staged batch is incomplete and cannot be revalidated.' },
      { status: 409 }
    );

  const brandCandidates = (rows.data ?? []).map(
    (r) => (r.raw_data as Record<string, string>)?.brand
  );
  const categoryCandidates = (rows.data ?? []).map(
    (r) => (r.raw_data as Record<string, string>)?.category
  );

  const { brands, categories } = await ensureTaxonomiesExist(
    supabase,
    brandCandidates,
    categoryCandidates
  );

  const revalidated = (rows.data ?? []).map((row) => ({
    id: row.id,
    ...revalidateImportTaxonomy({
      rawData: row.raw_data as Record<string, string>,
      normalizedData: row.normalized_data as Record<string, unknown>,
      validationErrors: Array.isArray(row.validation_errors)
        ? (row.validation_errors as unknown as ImportIssue[])
        : [],
      brands: brands as Taxonomy[],
      categories: categories as Taxonomy[],
    }),
  }));

  for (let index = 0; index < revalidated.length; index += 25) {
    const results = await Promise.all(
      revalidated.slice(index, index + 25).map((row) =>
        supabase
          .from('product_import_rows')
          .update({
            normalized_data: row.normalizedData as NonNullable<Json>,
            validation_errors: row.validationErrors as unknown as NonNullable<Json>,
            status: row.status,
          })
          .eq('id', row.id)
          .eq('batch_id', id)
      )
    );
    if (results.some((result) => result.error))
      return NextResponse.json(
        { error: 'Could not update every staged row. Retry revalidation.' },
        { status: 500 }
      );
  }

  const validCount = revalidated.filter((row) => row.status === 'VALID').length;
  const invalidCount = revalidated.length - validCount;
  const { error: updateError } = await supabase
    .from('product_import_batches')
    .update({
      status: validCount ? 'READY' : 'FAILED',
      valid_rows: validCount,
      invalid_rows: invalidCount,
      completed_at: null,
    })
    .eq('id', id);
  if (updateError)
    return NextResponse.json({ error: 'Could not update the import batch.' }, { status: 500 });
  return NextResponse.json({ validCount, invalidCount });
}
