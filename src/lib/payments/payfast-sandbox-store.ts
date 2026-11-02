import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type SandboxSession = {
  id: string; created_by: string; created_at: string; amount_minor: number; currency: string;
  callback_token_hash: string; state: 'PENDING' | 'COMPLETE';
  provider_payment_id: string | null; fee_minor: number | null;
  net_minor: number | null; verified_at: string | null;
};

type SandboxDatabase = { public: {
  Tables: { payfast_sandbox_sessions: {
    Row: SandboxSession;
    Insert: Pick<SandboxSession, 'id' | 'created_by' | 'callback_token_hash'>;
    Update: never; Relationships: [];
  } };
  Views: Record<never, never>; Enums: Record<never, never>; CompositeTypes: Record<never, never>;
  Functions: { complete_payfast_sandbox_payment: {
    Args: { target_session: string; target_provider: string; target_gross: number;
      target_fee: number; target_net: number; target_token_hash: string };
    Returns: undefined;
  } };
} };

// This deliberately exposes no real-commerce table or generic query interface.
function sandboxDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key === '[SENSITIVE]') throw new Error('Sandbox storage unavailable.');
  return createClient<SandboxDatabase>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(6000) }) },
  });
}

export async function createSandboxSession(input: Pick<SandboxSession, 'id' | 'created_by' | 'callback_token_hash'>) {
  const { error } = await sandboxDb().from('payfast_sandbox_sessions').insert(input);
  if (error) throw new Error('Could not create Sandbox test record.');
}

export async function getSandboxSession(id: string) {
  const { data, error } = await sandboxDb().from('payfast_sandbox_sessions').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('Sandbox storage temporarily unavailable.');
  return data;
}

export async function completeSandboxSession(input: SandboxDatabase['public']['Functions']['complete_payfast_sandbox_payment']['Args']) {
  const { error } = await sandboxDb().rpc('complete_payfast_sandbox_payment', input);
  if (error) throw new Error('Sandbox notification could not be recorded.');
}
