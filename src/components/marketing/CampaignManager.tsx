'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Campaign } from '@/lib/communications/store';

export function CampaignManager({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(payload: object) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      setMessage(result.error || result.message);
      if (response.ok) router.refresh();
    } catch {
      setMessage('Request interrupted. Check campaign status before retrying.');
    } finally {
      setBusy(false);
      setConfirmed(null);
    }
  }
  return (
    <div className="mt-6 space-y-6">
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void submit({ action: 'draft', subject, body });
        }}
        className="space-y-4 rounded-xl border bg-white p-5"
      >
        <h2 className="font-bold">Create a draft</h2>
        <label className="block text-sm">
          Subject
          <input
            className="mt-1 block w-full rounded border p-3"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            minLength={3}
            maxLength={150}
            required
          />
        </label>
        <label className="block text-sm">
          Message
          <textarea
            className="mt-1 block min-h-44 w-full rounded border p-3"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            minLength={20}
            maxLength={12000}
            required
          />
        </label>
        <p className="text-xs text-neutral-600">
          Messages use the Street Culture email layout, shop link, business address and unsubscribe
          link. Drafts do not send emails.
        </p>
        <button
          className="rounded bg-emerald-800 px-4 py-2 text-white disabled:opacity-50"
          disabled={busy}
        >
          Save draft
        </button>
      </form>
      {message && (
        <p role="status" className="rounded border bg-white p-4 text-sm">
          {message}
        </p>
      )}
      {campaigns.map((campaign) => (
        <section key={campaign.id} className="space-y-3 rounded-xl border bg-white p-5">
          <p className="text-xs uppercase text-emerald-800">{campaign.status}</p>
          <h2 className="text-xl font-bold">{campaign.subject}</h2>
          <p className="whitespace-pre-wrap text-sm">{campaign.body}</p>
          {campaign.status !== 'sent' && (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed === campaign.id}
                  onChange={(event) => setConfirmed(event.target.checked ? campaign.id : null)}
                />
                I approve this campaign and sending the next batch to confirmed newsletter
                subscribers. Messaging charges may apply.
              </label>
              <button
                disabled={busy || confirmed !== campaign.id}
                onClick={() => void submit({ action: 'send', id: campaign.id, confirmed: true })}
                className="rounded bg-emerald-800 px-4 py-2 text-white disabled:opacity-50"
              >
                {busy
                  ? 'Processing…'
                  : campaign.status === 'draft'
                    ? 'Send first batch (up to 10)'
                    : 'Send next batch / finish'}
              </button>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
