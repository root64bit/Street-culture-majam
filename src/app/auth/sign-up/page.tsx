'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { signUpSchema } from '@/lib/schemas/auth.schema';

export default function SignUpPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = signUpSchema.safeParse({ fullName, email, password });
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Invalid input');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            display_name: fullName.split(' ')[0],
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session) {
        window.location.assign('/account');
      } else {
        setPendingEmail(email.trim().toLowerCase());
        setSuccess('Check your email for the confirmation code or link.');
      }
    } catch {
      setError('An unexpected error occurred during account creation.');
    } finally {
      setLoading(false);
    }
  };

  const verifyEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: verifyError } = await createClient().auth.verifyOtp({
        email: pendingEmail,
        token: code.trim(),
        type: 'email',
      });
      if (verifyError) {
        setError(
          'This code is invalid or expired. Use the latest email, or request another code from the sign-in page.'
        );
        return;
      }
      window.location.assign('/account');
    } catch {
      setError('Could not verify your email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-16 sm:py-24">
      <Container className="max-w-md">
        <GlassPanel intensity="heavy" className="border-black/10 bg-white shadow-xl">
          <div className="mb-6 text-center">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-lime-700">
              NEW VAULT COLLECTOR
            </span>
            <h1 className="text-2xl font-black uppercase tracking-tight text-neutral-950">
              CREATE AN ACCOUNT
            </h1>
            <p className="mt-1 font-mono text-xs text-neutral-600">
              Join the Street Culture verified marketplace
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 font-mono text-xs text-red-700"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mb-4 rounded-lg border border-lime-300 bg-lime-50 p-3 font-mono text-xs text-lime-800"
            >
              {success}
            </div>
          )}

          {pendingEmail && process.env.NEXT_PUBLIC_EMAIL_OTP_ENABLED === 'true' ? (
            <form onSubmit={verifyEmail} className="space-y-4">
              <p className="text-sm text-neutral-600">Enter the code sent to {pendingEmail}.</p>
              <Input
                tone="light"
                label="Email verification code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6,10}"
                maxLength={10}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                required
              />
              <Button type="submit" variant="acid" className="w-full" isLoading={loading}>
                Verify email
              </Button>
              <Link href="/auth/sign-in" className="block text-center text-sm text-emerald-800">
                Request a new sign-in code
              </Link>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                tone="light"
                label="Full Name"
                type="text"
                autoComplete="name"
                placeholder="Alexander McQueen"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />

              <Input
                tone="light"
                label="Email Address"
                type="email"
                autoComplete="username"
                placeholder="collector@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                tone="light"
                label="Password (min 8 chars)"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button type="submit" variant="acid" size="lg" className="w-full" isLoading={loading}>
                CREATE ACCOUNT
              </Button>
            </form>
          )}

          <div className="mt-6 border-t border-black/10 pt-4 text-center font-mono text-xs text-neutral-600">
            ALREADY REGISTERED?{' '}
            <Link href="/auth/sign-in" className="font-semibold text-lime-700 hover:underline">
              SIGN IN
            </Link>
          </div>
        </GlassPanel>
      </Container>
    </div>
  );
}
