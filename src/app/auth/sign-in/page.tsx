'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { signInSchema } from '@/lib/schemas/auth.schema';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/account';

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

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('An unexpected error occurred during sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-16 sm:py-24">
      <Container className="max-w-md">
        <GlassPanel intensity="heavy" className="border-white/10 shadow-glass">
          <div className="mb-6 text-center">
            <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
              AUTHENTICATED ACCESS
            </span>
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">
              SIGN IN TO VAULT
            </h1>
            <p className="mt-1 text-xs font-mono text-neutral-400">
              Access your saved grails, consignments, and orders
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs font-mono text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="operator@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="flex items-center justify-between text-[11px] font-mono">
              <Link
                href="/auth/forgot-password"
                className="text-neutral-400 hover:text-acid transition-colors"
              >
                FORGOT PASSWORD?
              </Link>
            </div>

            <Button type="submit" variant="acid" size="lg" className="w-full" isLoading={loading}>
              SIGN IN
            </Button>
          </form>

          <div className="mt-6 border-t border-white/5 pt-4 text-center text-xs font-mono text-neutral-400">
            DON&apos;T HAVE AN ACCOUNT?{' '}
            <Link href="/auth/sign-up" className="text-acid font-semibold hover:underline">
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

