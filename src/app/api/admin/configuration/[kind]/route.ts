import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import {
  configurationSchemas,
  configurationCapabilities,
  type ConfigurationKind,
} from '@/lib/admin/configuration';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
import type { Json } from '@/types/database.types';

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!Object.hasOwn(configurationSchemas, kind))
    return adminFailure('NOT_FOUND', 'Configuration not found.', 404);
  const key = kind as ConfigurationKind;
  const access = await capabilityApiClient([configurationCapabilities[key]]);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const envelope = z
    .object({ id: z.string().uuid().nullable(), payload: z.unknown() })
    .safeParse(await request.json().catch(() => null));
  if (!envelope.success) return adminFailure('VALIDATION', 'A valid record is required.');
  const body = configurationSchemas[key].safeParse(envelope.data.payload);
  if (!body.success)
    return adminFailure(
      'VALIDATION',
      body.error.issues[0].message,
      400,
      body.error.issues[0].path.join('.')
    );
  const { data, error } = await access.supabase.rpc('save_admin_configuration', {
    configuration_kind: key,
    target_id: envelope.data.id as unknown as string,
    payload: body.data as Json,
  });
  if (error) return databaseFailure(error, `save_${key}`);
  return NextResponse.json({ id: data }, { headers: { 'Cache-Control': 'no-store' } });
}
