'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { PhoneNumberInput } from '@/components/ui/PhoneNumberInput';

export function PhoneVerification({ currentPhone }: { currentPhone?: string }) {
  const [phone, setPhone] = useState(currentPhone ? `+${currentPhone.replace(/^\+/, '')}` : '');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (cooldown || loading) return;
    const normalized = phone.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      setError('Choose your country and enter a valid mobile number.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { error: sendError } = await createClient().auth.updateUser({ phone: normalized });
      if (sendError) {
        setError(sendError.message);
        return;
      }
      setPhone(normalized);
      setSent(true);
      setCooldown(60);
      setMessage(`A verification code was sent by SMS to ${normalized}.`);
    } catch {
      setError('Could not send your code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: verifyError } = await createClient().auth.verifyOtp({
        phone,
        token: code.trim(),
        type: 'phone_change',
      });
      if (verifyError) {
        setError('This code is invalid or expired. Please request another code.');
        return;
      }
      setMessage('Your phone is verified. You can now use it to sign in with a code.');
      setSent(false);
      setCode('');
    } catch {
      setError('Could not verify your number. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-black uppercase text-neutral-950">Phone verification</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Add a mobile number to this account for code-based sign-in. Delivery depends on your country
        and carrier.
      </p>
      {message && (
        <p role="status" className="mt-4 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {!sent ? (
        <form onSubmit={send} className="mt-5 space-y-4">
          <PhoneNumberInput initialValue={phone} onChange={setPhone} disabled={loading} />
          <Button type="submit" variant="acid" isLoading={loading} disabled={cooldown > 0}>
            {cooldown ? `Send again in ${cooldown}s` : 'Send verification code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-5 space-y-4">
          <Input
            tone="light"
            label="Verification code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6,10}"
            maxLength={10}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            required
          />
          <Button variant="acid" type="submit" isLoading={loading}>
            Verify phone
          </Button>
          <button
            type="button"
            className="ml-4 text-sm text-emerald-800"
            disabled={cooldown > 0 || loading}
            onClick={() => void send()}
          >
            {cooldown ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
          <button
            type="button"
            className="ml-4 text-sm text-emerald-800"
            disabled={loading}
            onClick={() => {
              setSent(false);
              setCode('');
              setMessage('');
              setError('');
            }}
          >
            Change number
          </button>
        </form>
      )}
    </section>
  );
}
