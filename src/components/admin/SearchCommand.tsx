'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
type Result = { kind: string; label: string; detail: string; href: string };
export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      input.current?.focus();
    } else {
      dialog.current?.close();
      trigger.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const body: { results?: Result[]; error?: string } = await response.json();
        if (!response.ok) throw new Error('Search unavailable');
        setResults(body.results ?? []);
      } catch {
        if (!controller.signal.aborted) setError('Search unavailable. Please try again.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search admin records"
        className="inline-flex items-center gap-2 rounded-lg border border-[#dce6dc] px-3 py-2 text-xs text-[#61766b]"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden text-[10px] lg:inline">Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(false);
        }}
        aria-label="Search admin records"
        className="w-[620px] max-w-[calc(100%-2rem)] rounded-2xl border border-[#dce6dc] bg-white p-0 text-[#17251f] shadow-2xl backdrop:bg-[#0d211a]/60"
      >
        <div className="flex gap-3 border-b border-[#e7ede4] p-4">
          <Search className="mt-2 h-5 w-5 text-[#61766b]" />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            aria-label="Search products, orders and people"
            placeholder="Product, SKU, order, customer, payment reference…"
            className="min-w-0 flex-1 bg-white py-2 text-sm outline-none"
          />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close search">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {results.map((result, index) => (
            <Link
              key={`${result.kind}-${result.href}-${index}`}
              href={result.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl p-3 hover:bg-[#f0f6ed] focus:bg-[#f0f6ed]"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#087456]">
                {result.kind}
              </span>
              <p className="mt-1 text-sm font-bold">{result.label}</p>
              <p className="mt-1 text-xs text-[#61766b]">{result.detail}</p>
            </Link>
          ))}
          {busy ? (
            <p role="status" className="p-5 text-sm text-[#61766b]">
              Searching…
            </p>
          ) : error ? (
            <p role="alert" className="p-5 text-sm text-red-700">
              {error}
            </p>
          ) : (
            !results.length && (
              <p className="p-5 text-sm text-[#61766b]">
                {query.trim().length < 2
                  ? 'Type at least two characters. Results respect your permissions.'
                  : 'No matching records.'}
              </p>
            )
          )}
        </div>
      </dialog>
    </>
  );
}
