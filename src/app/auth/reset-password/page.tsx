'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema } from '@/lib/schemas/auth.schema';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Invalid password');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setMessage('Password updated successfully! Redirecting...');
      setTimeout(() => {
        router.push('/auth/sign-in');
      }, 1500);
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
              SECURITY KEY UPDATE
            </span>
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">
              NEW PASSWORD
            </h1>
            <p className="mt-1 text-xs font-mono text-neutral-400">
              Enter your updated vault password below
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
              label="New Password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Input
              label="Confirm New Password"
              type="password"
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <Button type="submit" variant="acid" size="lg" className="w-full" isLoading={loading}>
              UPDATE PASSWORD
            </Button>
          </form>
        </GlassPanel>
      </Container>
    </div>
  );
}
