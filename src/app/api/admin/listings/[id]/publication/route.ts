import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';

const publishSchema = z.object({ decisionNotes: z.string().trim().min(20).max(1000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['inventory.manage', 'authentication.review']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const parsed = publishSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success)
    return NextResponse.json(
      { error: 'Record a decision note of at least 20 characters.' },
      { status: 400 }
    );
  const { data, error } = await access.supabase.rpc('publish_store_listing', {
    target_listing_id: id,
    decision_notes: parsed.data.decisionNotes,
  });
  if (error || !data)
    return NextResponse.json(
      { error: error?.message ?? 'Could not publish this listing.' },
      { status: 409 }
    );
  return NextResponse.json({ listingId: data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['inventory.manage']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'Invalid listing ID.' }, { status: 400 });
  const { data, error } = await access.supabase.rpc('unpublish_store_listing', {
    target_listing_id: id,
  });
  if (error || !data)
    return NextResponse.json(
      { error: error?.message ?? 'Could not unpublish this listing.' },
      { status: 409 }
    );
  return NextResponse.json({ listingId: data });
}
