'use client';
import { useState, type FormEvent } from 'react';

export function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent }),
      });
      const data = await response.json();
      setMessage(response.ok ? data.message : data.error || 'Please try again.');
      if (response.ok) {
        setEmail('');
        setConsent(false);
      }
    } catch {
      setMessage('Could not subscribe. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="mb-10 max-w-xl rounded-xl border border-white/10 p-5">
      <h2 className="text-sm font-semibold text-white">Get first access to new drops</h2>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="flex gap-2">
          <input
            aria-label="Newsletter email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Your email address"
            className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
          />
          <button
            disabled={loading}
            className="rounded-lg bg-acid px-4 py-2 text-xs font-bold text-black"
          >
            {loading ? 'Joining…' : 'Subscribe'}
          </button>
        </div>
        <label className="flex gap-2 text-xs leading-5">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1"
          />
          I agree to receive Street Culture news, drops and offers by email. I can unsubscribe at
          any time.
        </label>
        {message && (
          <p role="status" className="text-xs text-white">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
