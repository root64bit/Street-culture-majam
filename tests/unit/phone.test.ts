// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  browserPhoneCountry,
  normalizePhoneInput,
  parsePhoneInput,
  phoneCountry,
  PHONE_COUNTRIES,
} from '@/lib/phone';
import { GET } from '@/app/api/location/route';

describe('international phone input', () => {
  it.each([
    ['MZ', '84 123 4567', '+258841234567'],
    ['ZA', '082 123 4567', '+27821234567'],
    ['PT', '912 345 678', '+351912345678'],
    ['FR', '06 12 34 56 78', '+33612345678'],
    ['CA', '416 555 1234', '+14165551234'],
  ] as const)('normalizes %s local numbers, including trunk zeroes', (country, input, expected) => {
    expect(normalizePhoneInput(input, country)).toBe(expected);
  });
  it('recognizes pasted international numbers without doubling country codes', () => {
    expect(normalizePhoneInput('+44 7400 123456', 'ZA')).toBe('+447400123456');
    expect(normalizePhoneInput('0044 7400 123456', 'MZ')).toBe('+447400123456');
    expect(parsePhoneInput('+14165551234')?.country).toBe('CA');
  });
  it('rejects short numbers, extensions and phone numbers embedded in text', () => {
    for (const value of ['', '123', 'Call +27821234567', '+27821234567 ext 2', 'invalid'])
      expect(normalizePhoneInput(value, 'ZA')).toBe('');
  });
  it('lists countries sharing a calling code separately', () => {
    expect(PHONE_COUNTRIES.find((entry) => entry.code === 'US')?.dialCode).toBe('+1');
    expect(PHONE_COUNTRIES.find((entry) => entry.code === 'CA')?.dialCode).toBe('+1');
    expect(PHONE_COUNTRIES.find((entry) => entry.code === 'MZ')?.dialCode).toBe('+258');
  });
  it('uses supported country codes and explicit browser regions only', () => {
    expect(phoneCountry('za')).toBe('ZA');
    expect(phoneCountry('ZZ')).toBeNull();
    expect(browserPhoneCountry(['en', 'pt-MZ'])).toBe('MZ');
    expect(browserPhoneCountry(['en-ZA'])).toBe('ZA');
    expect(browserPhoneCountry(['en', 'not_a_locale'])).toBeNull();
  });
});

describe('private approximate-country endpoint', () => {
  it('returns only a supported country and prevents shared caching', async () => {
    const response = await GET(
      new Request('https://www.streetculturevault.com/api/location', {
        headers: { 'x-vercel-ip-country': 'ZA', 'x-forwarded-for': '192.0.2.1' },
      })
    );
    expect(await response.json()).toEqual({ country: 'ZA' });
    expect(response.headers.get('cache-control')).toContain('private, no-store');
  });
  it('returns null when location is unavailable or unrecognized', async () => {
    for (const country of ['', 'ZZ']) {
      const response = await GET(
        new Request('http://localhost/api/location', {
          headers: { 'x-vercel-ip-country': country },
        })
      );
      expect(await response.json()).toEqual({ country: null });
    }
  });
});
