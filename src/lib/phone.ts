import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

export type PhoneCountry = CountryCode;
export const DEFAULT_PHONE_COUNTRY: PhoneCountry = 'MZ';
const supportedCountries = new Set<string>(getCountries());
const names = new Intl.DisplayNames(['en'], { type: 'region' });
export const PHONE_COUNTRIES = getCountries()
  .map((code) => ({
    code,
    name: names.of(code) || code,
    dialCode: `+${getCountryCallingCode(code)}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

export function phoneCountry(value: unknown): PhoneCountry | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return supportedCountries.has(code) ? (code as PhoneCountry) : null;
}

export function browserPhoneCountry(languages: readonly string[]): PhoneCountry | null {
  for (const language of languages) {
    try {
      const country = phoneCountry(new Intl.Locale(language).region);
      if (country) return country;
    } catch {
      /* A language without a usable region is not a location. */
    }
  }
  return null;
}

export function parsePhoneInput(input: string, country: PhoneCountry = DEFAULT_PHONE_COUNTRY) {
  const text = input.trim();
  if (!text || !/^[+\d\s().-]+$/.test(text)) return undefined;
  return parsePhoneNumberFromString(text.replace(/^00/, '+'), {
    defaultCountry: country,
    extract: false,
  });
}

export function normalizePhoneInput(input: string, country: PhoneCountry) {
  const parsed = parsePhoneInput(input, country);
  return parsed?.country && parsed.isPossible() ? parsed.number : '';
}
