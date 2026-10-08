'use client';
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <section className="p-8">
      <h1 className="text-2xl font-black">This workspace is temporarily unavailable.</h1>
      <p className="mt-3 text-sm text-[#61766b]">
        Your saved data is unchanged. Retry the request or contact the system administrator if this
        persists.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-lg bg-[#0d211a] px-5 py-3 text-sm font-bold text-white"
      >
        Retry
      </button>
    </section>
  );
}
