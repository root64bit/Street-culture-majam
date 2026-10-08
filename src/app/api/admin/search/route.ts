import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure } from '@/lib/admin/errors';
export async function GET(request: Request) {
  const access = await capabilityApiClient(['dashboard.read']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 120);
  if (q.length < 2)
    return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const { data, error } = await access.supabase.rpc('admin_global_search', { search_text: q });
  if (error) return adminFailure('UNAVAILABLE', 'Search is temporarily unavailable.', 503);
  return NextResponse.json({ results: data }, { headers: { 'Cache-Control': 'no-store' } });
}
