import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { productDraftSchema, slugify } from '@/lib/schemas/admin-catalog.schema';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['products.write']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid product ID.' }, { status: 400 });
  }
  const parsed = productDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the product details.' },
      { status: 400 }
    );
  }

  const { supabase } = access;
  const product = parsed.data;
  const slug = slugify(product.name);
  if (!slug)
    return NextResponse.json(
      { error: 'Enter a product name with letters or numbers.' },
      { status: 400 }
    );
  const [{ data: brand }, { data: category }] = await Promise.all([
    supabase.from('brands').select('id').eq('id', product.brandId).eq('active', true).maybeSingle(),
    supabase
      .from('categories')
      .select('id')
      .eq('id', product.categoryId)
      .eq('active', true)
      .maybeSingle(),
  ]);
  if (!brand || !category) {
    return NextResponse.json({ error: 'Choose an active brand and category.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('products')
    .update({
      name: product.name,
      brand_id: brand.id,
      category_id: category.id,
      description: product.description || null,
      model: product.model || null,
      sku: product.sku || null,
      style_code: product.styleCode || null,
      colorway: product.colorway || null,
      release_year: product.releaseYear,
      gender: product.gender,
    })
    .eq('id', id)
    .eq('active', false)
    .select('id')
    .maybeSingle();
  if (error?.code === '23505') {
    return NextResponse.json(
      { error: 'A product with that name or SKU already exists.' },
      { status: 409 }
    );
  }
  if (error)
    return NextResponse.json({ error: 'Product draft could not be updated.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Draft product not found.' }, { status: 404 });
  return NextResponse.json({ id: data.id });
}
