import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus = 'disconnected';

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('brands').select('*', { count: 'exact', head: true });

    if (!error) {
      dbStatus = 'connected';
    } else {
      dbStatus = `unreachable: ${error.message}`;
    }
  } catch (err: unknown) {
    dbStatus = err instanceof Error ? `error: ${err.message}` : 'error';
  }

  return NextResponse.json(
    {
      status: 'ok',
      application: 'STREET CULTURE Archival Vault',
      database: dbStatus,
      environment: process.env.NODE_ENV || 'development',
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local',
      timestamp,
    },
    { status: 200 }
  );
}
