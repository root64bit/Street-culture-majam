'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { safeAuthRedirect } from '@/lib/auth-redirect';
export function SwitchAccountButton({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const { error: failure } = await createClient().auth.signOut({ scope: 'local' });
            if (failure) throw failure;
            window.location.assign(
              `/auth/sign-in?redirectTo=${encodeURIComponent(safeAuthRedirect(returnTo))}`
            );
          } catch {
            setError('We could not switch accounts. Please try again.');
            setBusy(false);
          }
        }}
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-acid px-6 py-3 text-sm font-bold text-black disabled:opacity-50"
      >
        {busy ? 'Switching account…' : 'Sign in with another account'}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
