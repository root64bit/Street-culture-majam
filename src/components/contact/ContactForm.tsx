'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const topics = [
  ['ORDER', 'Order or delivery'],
  ['RETURN', 'Return or refund'],
  ['CONSIGNMENT', 'Consignment'],
  ['AUTHENTICITY', 'Authenticity concern'],
  ['PRIVACY', 'Privacy request'],
  ['OTHER', 'Something else'],
] as const;

export function ContactForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('sending');
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) {
      setState('idle');
      setError(result?.error || 'We could not send your request. Please try again shortly.');
      return;
    }
    event.currentTarget.reset();
    setState('sent');
  }

  if (state === 'sent') {
    return (
      <div className="rounded-[1.7rem] border border-[#b6d3c6] bg-[#edf8f1] p-7" role="status">
        <CheckCircle2 className="h-7 w-7 text-[#087456]" />
        <h2 className="mt-4 text-2xl font-black tracking-[-0.04em]">Request received</h2>
        <p className="mt-3 text-sm leading-6 text-black/60">
          Our operations team can now review your message. Keep your order number and any delivery
          evidence available; we may ask for it when we respond through the contact details you
          provided.
        </p>
        <button
          type="button"
          onClick={() => setState('idle')}
          className="mt-6 text-xs font-black uppercase tracking-[0.12em] underline underline-offset-4"
        >
          Send another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name">
          <input name="name" required minLength={2} maxLength={100} autoComplete="name" />
        </Field>
        <Field label="Email">
          <input name="email" required type="email" maxLength={254} autoComplete="email" />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Phone or WhatsApp (optional)">
          <input name="phone" maxLength={30} autoComplete="tel" />
        </Field>
        <Field label="Topic">
          <select name="topic" defaultValue="ORDER">
            {topics.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Order number (optional)">
        <input name="orderNumber" maxLength={32} placeholder="For example, SC12AB34CD" />
      </Field>
      <Field label="How can we help?">
        <textarea name="message" required minLength={20} maxLength={2000} rows={7} />
      </Field>
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <p className="text-xs leading-5 text-black/50">
        By sending this request, you agree that we may use the information to respond and resolve
        the issue as described in our{' '}
        <Link href="/privacy" className="underline">
          Privacy Notice
        </Link>
        . Never send a card PIN, password or one-time code.
      </p>
      {error && (
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={state === 'sending'}
        className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-black px-6 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d4938] disabled:opacity-50"
      >
        {state === 'sending' ? 'Sending…' : 'Send support request'}
        {state !== 'sending' && <ArrowRight className="h-4 w-4" />}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-black uppercase tracking-[0.1em] text-black/70 [&_input]:mt-2 [&_input]:h-12 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-black/15 [&_input]:bg-white [&_input]:px-4 [&_input]:text-sm [&_input]:font-normal [&_input]:tracking-normal [&_input]:outline-none [&_input]:focus:border-black [&_select]:mt-2 [&_select]:h-12 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-black/15 [&_select]:bg-white [&_select]:px-4 [&_select]:text-sm [&_select]:font-normal [&_select]:tracking-normal [&_select]:outline-none [&_textarea]:mt-2 [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-black/15 [&_textarea]:bg-white [&_textarea]:p-4 [&_textarea]:text-sm [&_textarea]:font-normal [&_textarea]:leading-6 [&_textarea]:tracking-normal [&_textarea]:outline-none [&_textarea]:focus:border-black">
      {label}
      {children}
    </label>
  );
}
