'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function ConsignmentResponseForm({ id }: { id: string }) {
  const router = useRouter();
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error: resultError } = await createClient().rpc('respond_to_consignment_request', {
        target_submission_id: id, seller_response: response,
      });
      if (resultError) setError('Your response could not be submitted. Check the status and try again.');
      else { setResponse(''); router.refresh(); }
    } catch { setError('Your response could not be submitted.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-6 rounded-[1.5rem] border border-[#c6d8bf] bg-[#eff7eb] p-6"><h2 className="text-lg font-black">More information requested</h2><p className="mt-2 text-sm text-black/60">Reply with the requested details. Your submission returns to the review queue.</p><label className="mt-4 block text-xs font-bold uppercase tracking-wider">Your response<textarea required minLength={10} maxLength={1000} rows={4} value={response} onChange={(event) => setResponse(event.target.value)} className="mt-2 block w-full rounded-xl border border-[#c6d8bf] bg-white p-3 text-sm" /></label>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<button disabled={busy || response.trim().length < 10} className="mt-4 rounded-full bg-[#0d211a] px-5 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send response'}</button></form>;
}
