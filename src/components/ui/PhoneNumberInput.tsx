'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { Input } from './Input';
import {
  browserPhoneCountry,
  DEFAULT_PHONE_COUNTRY,
  normalizePhoneInput,
  parsePhoneInput,
  phoneCountry,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from '@/lib/phone';

const preferenceKey = 'street-culture.phone-country';

export function PhoneNumberInput({
  initialValue = '',
  onChange,
  label = 'Mobile number',
  disabled = false,
}: {
  initialValue?: string;
  onChange: (internationalNumber: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const initial = parsePhoneInput(initialValue);
  const [country, setCountry] = useState<PhoneCountry>(initial?.country || DEFAULT_PHONE_COUNTRY);
  const [number, setNumber] = useState(initial?.nationalNumber || initialValue);
  const [source, setSource] = useState<'location' | 'browser' | 'saved' | 'manual' | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const interacted = useRef(Boolean(initialValue));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const options = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = PHONE_COUNTRIES.find((entry) => entry.code === country)!;
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/^00/, '+');
    return PHONE_COUNTRIES.filter((entry) =>
      `${entry.name} ${entry.code} ${entry.dialCode}`.toLowerCase().includes(query)
    );
  }, [search]);

  useEffect(() => {
    if (interacted.current) return;
    try {
      const saved = phoneCountry(localStorage.getItem(preferenceKey));
      if (saved) {
        setCountry(saved);
        setSource('saved');
        interacted.current = true;
        return;
      }
    } catch {
      /* Storage is optional. */
    }
    const fallback = browserPhoneCountry(navigator.languages || [navigator.language]);
    if (fallback) {
      setCountry(fallback);
      setSource('browser');
    }
    const controller = new AbortController();
    void fetch('/api/location', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const suggested = phoneCountry(data?.country);
        if (suggested && !interacted.current) {
          setCountry(suggested);
          setSource('location');
        }
      })
      .catch(() => {
        /* Keep browser region/fallback when location is unavailable. */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    function outside(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  useEffect(() => {
    if (open)
      options.current
        ?.querySelector(`[data-option-index="${active}"]`)
        ?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  function choose(next: PhoneCountry) {
    interacted.current = true;
    setCountry(next);
    setSource('manual');
    setOpen(false);
    setSearch('');
    setActive(0);
    onChange(normalizePhoneInput(number, next));
    try {
      localStorage.setItem(preferenceKey, next);
    } catch {
      /* Storage is optional. */
    }
    trigger.current?.focus();
  }

  function updateNumber(value: string) {
    interacted.current = true;
    const parsed = parsePhoneInput(value, country);
    // Pasted full international numbers take precedence over the suggested country.
    if (/^(\+|00)/.test(value.trim()) && parsed?.country) {
      setCountry(parsed.country);
      setSource('manual');
      setNumber(parsed.nationalNumber);
      onChange(normalizePhoneInput(value, parsed.country));
      try {
        localStorage.setItem(preferenceKey, parsed.country);
      } catch {
        /* Storage is optional. */
      }
    } else {
      setNumber(value);
      onChange(normalizePhoneInput(value, country));
    }
  }

  function searchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) =>
        Math.max(0, Math.min(matches.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)))
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (matches[active]) choose(matches[active].code);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === 'Tab') setOpen(false);
  }

  const international = normalizePhoneInput(number, country);
  return (
    <div className="space-y-3">
      <div ref={root} className="relative">
        <span
          id={`${id}-country-label`}
          className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-neutral-700"
        >
          Country / calling code
        </span>
        <button
          ref={trigger}
          type="button"
          disabled={disabled}
          aria-labelledby={`${id}-country-label ${id}-selected`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={`${id}-options`}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-left text-sm text-neutral-950 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-50"
          onClick={() => {
            interacted.current = true;
            setOpen(!open);
            setSearch('');
            setActive(
              Math.max(
                0,
                PHONE_COUNTRIES.findIndex((entry) => entry.code === country)
              )
            );
          }}
        >
          <span id={`${id}-selected`} className="min-w-0">
            <span className="mr-2 font-mono text-xs text-neutral-500">{country}</span>
            {selected.name} <span className="font-semibold">{selected.dialCode}</span>
          </span>
          <ChevronDown size={16} className="shrink-0" aria-hidden="true" />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-neutral-300 bg-white text-neutral-950 shadow-xl">
            <div className="relative border-b border-neutral-200 p-2">
              <Search
                size={15}
                className="absolute left-5 top-5 text-neutral-500"
                aria-hidden="true"
              />
              <input
                ref={searchInput}
                role="combobox"
                aria-label="Search country or calling code"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls={`${id}-options`}
                aria-activedescendant={
                  matches[active] ? `${id}-${matches[active].code}` : undefined
                }
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setActive(0);
                }}
                onKeyDown={searchKey}
                placeholder="Search country or code"
                className="h-10 w-full rounded border border-neutral-300 bg-white pl-9 pr-3 text-base text-neutral-950 outline-none focus:ring-2 focus:ring-emerald-700 sm:text-sm"
                autoComplete="off"
              />
            </div>
            <div
              ref={options}
              id={`${id}-options`}
              role="listbox"
              aria-label="Countries and calling codes"
              className="max-h-56 overflow-y-auto overscroll-contain"
            >
              {matches.map((entry, index) => (
                <button
                  key={entry.code}
                  id={`${id}-${entry.code}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={country === entry.code}
                  data-option-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry.code)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm ${index === active ? 'bg-emerald-50 text-emerald-950' : 'bg-white text-neutral-950'} hover:bg-emerald-50`}
                >
                  <span className="w-6 shrink-0 font-mono text-xs text-neutral-500">
                    {entry.code}
                  </span>
                  <span className="min-w-0 flex-1">{entry.name}</span>
                  <span className="shrink-0 font-mono text-xs">{entry.dialCode}</span>
                  {country === entry.code && (
                    <Check size={14} className="shrink-0 text-emerald-800" aria-hidden="true" />
                  )}
                </button>
              ))}
              {!matches.length && (
                <p className="p-3 text-sm text-neutral-600">No matching country.</p>
              )}
            </div>
          </div>
        )}
      </div>
      <Input
        id={`${id}-number`}
        tone="light"
        label={label}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={number}
        onChange={(event) => updateNumber(event.target.value)}
        onFocus={() => {
          interacted.current = true;
        }}
        placeholder="Your mobile number"
        className="text-base sm:text-sm"
        maxLength={32}
        aria-describedby={`${id}-help`}
        disabled={disabled}
        required
      />
      <p id={`${id}-help`} className="text-xs leading-5 text-neutral-600">
        {international ? (
          <>
            Code destination:{' '}
            <span className="font-semibold text-neutral-900">{international}</span>.
          </>
        ) : (
          <>Enter your number; the country code is added automatically.</>
        )}{' '}
        {source === 'location'
          ? 'Country suggested from your connection; change it if needed.'
          : source === 'browser'
            ? 'Country suggested from your browser region; change it if needed.'
            : 'You can choose any country above.'}
      </p>
    </div>
  );
}
