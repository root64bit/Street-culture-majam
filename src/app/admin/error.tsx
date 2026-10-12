'use client';

import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin workspace error:', error);
  }, [error]);

  return (
    <section className="p-8">
      <h1 className="text-2xl font-black">This workspace is temporarily unavailable.</h1>
      <p className="mt-3 text-sm text-[#61766b]">
        {error?.message
          ? `Details: ${error.message}`
          : 'Your saved data is unchanged. Retry the request or contact the system administrator if this persists.'}
      </p>
      {error?.digest && (
        <p className="mt-1 font-mono text-xs text-[#8ca397]">Digest: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-lg bg-[#0d211a] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1a382e]"
      >
        Retry
      </button>
    </section>
  );
}

