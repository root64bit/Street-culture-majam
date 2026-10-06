import { NextResponse } from 'next/server';
import { adminApiClient } from '@/lib/admin/access';
import { slugify, taxonomySchema } from '@/lib/schemas/admin-catalog.schema';

export async function POST(request: Request) {
  const access = await adminApiClient();
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = taxonomySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a brand or category name.' }, { status: 400 });
  }

  const { kind, name } = parsed.data;
  const slug = slugify(name);
  if (!slug) return NextResponse.json({ error: 'Use a name with letters or numbers.' }, { status: 400 });
  const { supabase } = access;
  const result = kind === 'brand'
    ? await supabase.from('brands').insert({ name, slug, active: true }).select('id, name').single()
    : await supabase.from('categories').insert({ name, slug, active: true }).select('id, name').single();
  if (result.error?.code === '23505') {
    return NextResponse.json({ error: 'That brand or category already exists. Select it from the list.' }, { status: 409 });
  }
  if (result.error || !result.data) {
    return NextResponse.json({ error: 'Could not create the brand or category.' }, { status: 500 });
  }
  return NextResponse.json(result.data, { status: 201 });
}
