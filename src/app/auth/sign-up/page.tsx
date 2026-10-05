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
        setSuccess('Account created. Check your email for the confirmation link, then sign in.');
      }
    } catch {
      setError('An unexpected error occurred during account creation.');
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
              NEW VAULT COLLECTOR
            </span>
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">
              CREATE AN ACCOUNT
            </h1>
            <p className="mt-1 text-xs font-mono text-neutral-400">
              Join the Street Culture verified marketplace
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs font-mono text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-acid/40 bg-acid/10 p-3 text-xs font-mono text-acid">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              placeholder="Alexander McQueen"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <Input
              label="Email Address"
              type="email"
              placeholder="collector@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Password (min 8 chars)"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button type="submit" variant="acid" size="lg" className="w-full" isLoading={loading}>
              CREATE ACCOUNT
            </Button>
          </form>

          <div className="mt-6 border-t border-white/5 pt-4 text-center text-xs font-mono text-neutral-400">
            ALREADY REGISTERED?{' '}
            <Link href="/auth/sign-in" className="text-acid font-semibold hover:underline">
              SIGN IN
            </Link>
          </div>
        </GlassPanel>
      </Container>
    </div>
  );
}
