import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('SAVE'),
    checklist: z
      .record(z.string().min(1).max(160), z.boolean())
      .refine((v) => Object.keys(v).length <= 50),
    styleNote: z.string().trim().max(2000),
    comparisonNote: z.string().trim().max(3000),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    claim: z.boolean(),
  }),
  z.object({
    action: z.literal('EVIDENCE'),
    path: z.string().min(1).max(300),
    caption: z.string().trim().min(1).max(300),
  }),
]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['authentication.review']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return adminFailure('VALIDATION', 'Check the inspection fields.');
  const result =
    body.data.action === 'SAVE'
      ? await access.supabase.rpc('save_authentication_inspection', {
          target_record_id: id,
          checklist: body.data.checklist,
          style_note: body.data.styleNote,
          comparison_note: body.data.comparisonNote,
          target_priority: body.data.priority,
          claim_assignment: body.data.claim,
        })
      : await access.supabase.rpc('attach_authentication_evidence', {
          target_record_id: id,
          object_path: body.data.path,
          evidence_caption: body.data.caption,
        });
  if (result.error) return databaseFailure(result.error, 'authentication_inspection');
  return NextResponse.json({ success: true });
}
