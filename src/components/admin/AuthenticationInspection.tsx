'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
export function AuthenticationInspection({
  id,
  checks,
  styleNote,
  comparisonNote,
  priority,
  closed,
}: {
  id: string;
  checks: Record<string, boolean>;
  styleNote: string | null;
  comparisonNote: string | null;
  priority: string;
  closed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function send(payload: object) {
    const response = await fetch(`/api/admin/authentication/${id}/inspection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body: { error?: string } = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Inspection could not be saved.');
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await send({
        action: 'SAVE',
        checklist: Object.fromEntries(
          Object.keys(checks).map((name, index) => [name, form.get(`check-${index}`) === 'on'])
        ),
        styleNote: form.get('style'),
        comparisonNote: form.get('comparison'),
        priority: form.get('priority'),
        claim: form.get('claim') === 'on',
      });
      setMessage('Inspection saved.');
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }
  async function evidence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (
      !(file instanceof File) ||
      !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setMessage('Use a PNG, JPEG, WebP or PDF under 10 MB.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const client = createClient();
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) throw new Error('Sign in again.');
      const extension =
        file.type === 'application/pdf'
          ? 'pdf'
          : file.type === 'image/jpeg'
            ? 'jpg'
            : file.type === 'image/png'
              ? 'png'
              : 'webp';
      const path = `${id}/${user.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await client.storage
        .from('authentication-evidence')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw new Error('Private upload failed.');
      await send({ action: 'EVIDENCE', path, caption: data.get('caption') });
      form.reset();
      setMessage('Private evidence attached.');
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Evidence could not be attached.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-black">Inspection checklist</h2>
      <p className="mt-2 text-xs text-[#61766b]">
        Record only checks actually performed. Evidence is private and signed links expire after
        five minutes.
      </p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <fieldset disabled={closed || busy} className="space-y-4">
          {Object.entries(checks).map(([name, value], index) => (
            <label key={name} className="flex gap-2 text-sm">
              <input type="checkbox" name={`check-${index}`} defaultChecked={value} />
              {name}
            </label>
          ))}
          <label className="block text-xs font-bold">
            Serial / style-code review
            <textarea
              name="style"
              defaultValue={styleNote ?? ''}
              maxLength={2000}
              rows={3}
              className="mt-1 w-full rounded-lg border p-3 text-sm"
            />
          </label>
          <label className="block text-xs font-bold">
            Comparison notes
            <textarea
              name="comparison"
              defaultValue={comparisonNote ?? ''}
              maxLength={3000}
              rows={3}
              className="mt-1 w-full rounded-lg border p-3 text-sm"
            />
          </label>
          <label className="block text-xs font-bold">
            Priority
            <select name="priority" defaultValue={priority} className="ml-3 rounded-lg border p-2">
              {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex gap-2 text-xs">
            <input name="claim" type="checkbox" />
            Assign this inspection to me
          </label>
          <button className="rounded-lg bg-[#0d211a] px-5 py-3 text-xs font-bold text-white">
            Save inspection
          </button>
        </fieldset>
      </form>
      {!closed && (
        <form onSubmit={evidence} className="mt-6 space-y-3 border-t pt-5">
          <label className="block text-xs font-bold">
            Evidence caption
            <input
              required
              name="caption"
              maxLength={300}
              className="mt-1 block w-full rounded-lg border p-2 text-sm"
            />
          </label>
          <input
            type="file"
            name="file"
            required
            accept="image/png,image/jpeg,image/webp,application/pdf"
            aria-label="Private authentication evidence"
            className="max-w-full text-xs"
          />
          <button disabled={busy} className="rounded-lg border px-4 py-2 text-xs font-bold">
            Attach private evidence
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
