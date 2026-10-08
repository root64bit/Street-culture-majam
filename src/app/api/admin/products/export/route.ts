import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure } from '@/lib/admin/errors';
import { catalogFilters, type CatalogFilters } from '@/lib/admin/catalog.service';
import { buildCatalogExport } from '@/lib/admin/catalog-export';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const access = await capabilityApiClient(['products.export', 'products.read']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams) as CatalogFilters;
  const ids: string[] = [];
  if (url.searchParams.has('ids')) {
    const parsed = z
      .array(z.string().uuid())
      .min(1)
      .max(100)
      .safeParse(url.searchParams.get('ids')?.split(','));
    if (!parsed.success) return adminFailure('VALIDATION', 'Select up to 100 valid product IDs.');
    ids.push(...new Set(parsed.data));
  } else {
    const filters = catalogFilters(params);
    for (let offset = 0; offset < 5000; offset += 100) {
      const page = await access.supabase.rpc('admin_catalog_products', {
        ...filters.rpc,
        page_offset: offset,
        page_limit: 100,
      });
      if (page.error) return adminFailure('UNAVAILABLE', 'Catalog export unavailable.', 503);
      if ((page.data?.[0]?.total_count ?? 0) > 5000)
        return adminFailure(
          'EXPORT_LIMIT',
          'This export exceeds 5,000 products. Narrow the filters before exporting.',
          422
        );
      ids.push(...(page.data ?? []).map((v) => v.id));
      if (!page.data || page.data.length < 100) break;
    }
  }
  const products = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const page = await access.supabase
      .from('products')
      .select(
        '*,brand:brands(name),category:categories(name),product_variants(*),listings(*),product_media(*)'
      )
      .in('id', ids.slice(offset, offset + 100))
      .order('name');
    if (page.error) return adminFailure('UNAVAILABLE', 'Could not read export records.', 503);
    products.push(...(page.data ?? []));
  }
  const buffer = await buildCatalogExport(products, process.env.NEXT_PUBLIC_SUPABASE_URL!);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="street-culture-catalog-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
