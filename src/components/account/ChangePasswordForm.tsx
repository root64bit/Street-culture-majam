'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema } from '@/lib/schemas/auth.schema';

export function ChangePasswordForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const validation = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Invalid new password.');
      return;
    }
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (currentPassword === password) {
      setError('Choose a password different from your current one.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) {
        setError('Current password could not be verified.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch {
      setError('Could not update your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-black uppercase tracking-tight text-neutral-950">Change password</h2>
      <p className="mt-1 text-sm text-neutral-600">Verify your current password, then choose a new one.</p>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-lg border border-lime-300 bg-lime-50 p-3 text-sm text-lime-800">Password updated. Use your new password next time you sign in.</p>}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input tone="light" label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        </div>
        <Input tone="light" label="New password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
        <Input tone="light" label="Confirm new password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        <div className="sm:col-span-2">
          <Button variant="acid" type="submit" isLoading={loading}>Update password</Button>
        </div>
      </form>
    </section>
  );
}
