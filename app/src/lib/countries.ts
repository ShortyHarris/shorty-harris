// Country list + EU check for the EU outreach compliance rule.
//
// campaigns.country and clients.country hold an ISO-2 code (CZ, US, DE...).
// "Other" has no ISO code of its own, so it is stored as OTHER_COUNTRY_CODE
// ('XX', the ISO 3166 user-assigned "unknown" code) - never null, so a
// required select always has a real value to save.

export interface CountryOption {
  code: string;
  name: string;
}

export const OTHER_COUNTRY_CODE = 'XX';

// The 27 EU member states, alphabetical by name.
export const EU_COUNTRIES: readonly CountryOption[] = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
];

const NON_EU_COUNTRIES: readonly CountryOption[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: OTHER_COUNTRY_CODE, name: 'Other' },
];

// EU first, then US, GB, CA, AU, Other - the order the selects render in.
export const COUNTRY_OPTIONS: readonly CountryOption[] = [...EU_COUNTRIES, ...NON_EU_COUNTRIES];

const EU_CODES: ReadonlySet<string> = new Set(EU_COUNTRIES.map((c) => c.code));

function normalizeCode(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase();
}

export function isEuCountry(code: string | null | undefined): boolean {
  return EU_CODES.has(normalizeCode(code));
}

export function countryName(code: string | null | undefined): string {
  const norm = normalizeCode(code);
  return COUNTRY_OPTIONS.find((c) => c.code === norm)?.name ?? norm;
}

// Options for a select whose current value may be a code outside the list
// (e.g. a client saved as NZ elsewhere). The unknown code is appended as its
// own option so opening and saving the form never silently rewrites it.
export function countryOptionsFor(current: string | null | undefined): CountryOption[] {
  const norm = normalizeCode(current);
  if (!norm || COUNTRY_OPTIONS.some((c) => c.code === norm)) return [...COUNTRY_OPTIONS];
  return [...COUNTRY_OPTIONS, { code: norm, name: norm }];
}

// Pre-selected "Target country" for a new campaign: the client's own country
// when it is in the list, Other when the client has a country outside the
// list, and '' (nothing selected) when the client has none.
export function defaultCampaignCountry(clientCountry: string | null | undefined): string {
  const norm = normalizeCode(clientCountry);
  if (!norm) return '';
  return COUNTRY_OPTIONS.some((c) => c.code === norm) ? norm : OTHER_COUNTRY_CODE;
}

export interface CountryHold {
  country: string;
  reason: string;
}

// Looks up an active hold for a country code in the rows read from
// country_send_holds (cleared = false). Case-insensitive.
export function findCountryHold(
  holds: readonly CountryHold[],
  code: string | null | undefined,
): CountryHold | null {
  const norm = normalizeCode(code);
  if (!norm) return null;
  return holds.find((h) => normalizeCode(h.country) === norm) ?? null;
}

// Optional field: empty is fine, anything else must be an https:// URL.
export function privacyUrlError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (!value.toLowerCase().startsWith('https://')) return 'Privacy notice URL must start with https://';
  try {
    const url = new URL(value);
    if (!url.hostname) return 'Enter a valid privacy notice URL.';
  } catch {
    return 'Enter a valid privacy notice URL.';
  }
  return null;
}
