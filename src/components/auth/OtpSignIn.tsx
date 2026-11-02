'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { safeAuthRedirect } from '@/lib/auth-redirect';
import { PhoneNumberInput } from '@/components/ui/PhoneNumberInput';

export function OtpSignIn({ redirectTo = '/account' }: { redirectTo?: string }) {
  const phoneEnabled = process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === 'true';
  const whatsappEnabled = process.env.NEXT_PUBLIC_WHATSAPP_OTP_ENABLED === 'true';
  const [method, setMethod] = useState<'email' | 'sms' | 'whatsapp'>('email');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (cooldown || loading) return;
    setError(null);
    const value =
      method === 'email' ? identifier.trim().toLowerCase() : identifier.replace(/[\s()-]/g, '');
    if (
      method === 'email'
        ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        : !/^\+[1-9]\d{6,14}$/.test(value)
    ) {
      setError(
        method === 'email'
          ? 'Enter a valid email address.'
          : 'Choose your country and enter a valid mobile number.'
      );
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: sendError } = await supabase.auth.signInWithOtp(
        method === 'email'
          ? { email: value, options: { shouldCreateUser: false } }
          : { phone: value, options: { shouldCreateUser: false, channel: method } }
      );
      if (sendError) {
        setError(
          'Could not send a code. Check your details and try again shortly. Phone sign-in requires a number already verified on your account.'
        );
        return;
      }
      setIdentifier(value);
      setSent(true);
      setCooldown(60);
    } catch {
      setError('Could not send a code. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6,10}$/.test(code.trim())) {
      setError('Enter the verification code from your message.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp(
        method === 'email'
          ? { email: identifier, token: code.trim(), type: 'email' }
          : { phone: identifier, token: code.trim(), type: 'sms' }
      );
      if (verifyError) {
        setError('This code is invalid or expired. Request another code and try again.');
        return;
      }
      window.location.assign(safeAuthRedirect(redirectTo));
    } catch {
      setError('Could not verify your code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-6 border-t border-black/10 pt-5">
      <h2 className="text-sm font-bold text-neutral-950">Sign in with a code</h2>
      {!sent && (phoneEnabled || whatsappEnabled) && (
        <div className="my-3 flex flex-wrap gap-2" aria-label="Code delivery method">
          {(
            [
              'email',
              ...(phoneEnabled ? ['sms'] : []),
              ...(whatsappEnabled ? ['whatsapp'] : []),
            ] as ('email' | 'sms' | 'whatsapp')[]
          ).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={method === value}
              className={`rounded-lg border px-3 py-2 text-xs ${method === value ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-neutral-200 text-neutral-600'}`}
              onClick={() => {
                setMethod(value);
                setIdentifier('');
                setError(null);
              }}
            >
              {value === 'sms' ? 'SMS' : value === 'email' ? 'Email' : 'WhatsApp'}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="my-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {!sent ? (
        <form onSubmit={send} className="mt-4 space-y-4">
          {method === 'email' ? (
            <Input
              tone="light"
              label="Your account email"
              type="email"
              autoComplete="email"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="you@example.com"
              required
            />
          ) : (
            <PhoneNumberInput
              key={method}
              initialValue={identifier}
              onChange={setIdentifier}
              label="Verified mobile number"
              disabled={loading}
            />
          )}
          {method !== 'email' && (
            <p className="text-xs text-neutral-500">
              First verify your phone number in your account settings. Delivery depends on your
              country and carrier.
            </p>
          )}
          <Button
            variant="acid"
            type="submit"
            className="w-full"
            isLoading={loading}
            disabled={cooldown > 0}
          >
            {cooldown
              ? `Send again in ${cooldown}s`
              : `Send ${method === 'whatsapp' ? 'WhatsApp' : method === 'sms' ? 'SMS' : 'email'} code`}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-4 space-y-4">
          <p role="status" className="text-sm text-neutral-600">
            If this account is eligible, a code has been sent to {identifier}.
          </p>
          <Input
            tone="light"
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            required
          />
          <Button variant="acid" type="submit" className="w-full" isLoading={loading}>
            Verify and sign in
          </Button>
          <div className="flex justify-between text-xs text-emerald-800">
            <button type="button" disabled={cooldown > 0 || loading} onClick={() => void send()}>
              {cooldown ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setCode('');
                setError(null);
              }}
            >
              Change details
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
