'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { signInSchema } from '@/lib/schemas/auth.schema';

function SignInForm() {
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get('redirectTo') || '/account';
  const redirectTo = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//')
    ? requestedRedirect : '/account';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = signInSchema.safeParse({ email, password });
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Invalid input');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      // A full navigation ensures the server sees the newly persisted auth
      // cookie before evaluating protected routes and their RLS queries.
      window.location.assign(redirectTo);
    } catch {
      setError('An unexpected error occurred during sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-16 sm:py-24">
      <Container className="max-w-md">
        <GlassPanel intensity="heavy" className="border-black/10 bg-white shadow-xl">
          <div className="mb-6 text-center">
            <span className="text-[10px] font-mono tracking-widest text-lime-700 uppercase block mb-1">
              AUTHENTICATED ACCESS
            </span>
            <h1 className="text-2xl font-black uppercase tracking-tight text-neutral-950">
              SIGN IN TO VAULT
            </h1>
            <p className="mt-1 text-xs font-mono text-neutral-600">
              Access your saved grails, consignments, and orders
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-mono text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              tone="light"
              label="Email Address"
              type="email"
              autoComplete="username"
              placeholder="operator@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              tone="light"
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="flex items-center justify-between text-[11px] font-mono">
              <Link
                href="/auth/forgot-password"
                className="text-neutral-600 hover:text-neutral-950 transition-colors"
              >
                FORGOT PASSWORD?
              </Link>
            </div>

            <Button type="submit" variant="acid" size="lg" className="w-full" isLoading={loading}>
              SIGN IN
            </Button>
          </form>

          <div className="mt-6 border-t border-black/10 pt-4 text-center text-xs font-mono text-neutral-600">
            DON&apos;T HAVE AN ACCOUNT?{' '}
            <Link href="/auth/sign-up" className="text-lime-700 font-semibold hover:underline">
              CREATE ONE
            </Link>
          </div>
        </GlassPanel>
      </Container>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-xs font-mono text-neutral-500">
          INITIALIZING VAULT AUTHENTICATION...
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}

