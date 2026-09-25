'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { forgotPasswordSchema } from '@/lib/schemas/auth.schema';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const validation = forgotPasswordSchema.safeParse({ email });
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Invalid email');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setMessage('Password reset link has been dispatched to your email.');
    } catch {
      setError('An unexpected error occurred.');
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
              CREDENTIAL RECOVERY
            </span>
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">
              RESET PASSWORD
            </h1>
            <p className="mt-1 text-xs font-mono text-neutral-400">
              Enter your email address to receive recovery instructions
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs font-mono text-red-300">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-lg border border-acid/40 bg-acid/10 p-3 text-xs font-mono text-acid">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="collector@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Button type="submit" variant="acid" size="lg" className="w-full" isLoading={loading}>
              SEND RECOVERY LINK
            </Button>
          </form>

          <div className="mt-6 border-t border-white/5 pt-4 text-center text-xs font-mono text-neutral-400">
            REMEMBERED PASSWORD?{' '}
            <Link href="/auth/sign-in" className="text-acid font-semibold hover:underline">
              BACK TO SIGN IN
            </Link>
          </div>
        </GlassPanel>
      </Container>
    </div>
  );
}
