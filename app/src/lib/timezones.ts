// IANA timezones for clients.send_timezone. WF2.5 sends each client's emails
// only Mon-Fri 9:00-17:00 in this zone. The full list comes from the browser
// (Intl.supportedValuesOf), offsets are computed with Intl so DST is always
// correct, and countries-and-timezones maps a country to its zones.

import { getCountry } from 'countries-and-timezones';

export const DEFAULT_TIMEZONE = 'America/Chicago';

// Used only if the runtime has no Intl.supportedValuesOf.
const FALLBACK_TIMEZONES: readonly string[] = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'Europe/London', 'Europe/Dublin',
  'Europe/Paris', 'Europe/Berlin', 'Europe/Prague', 'Europe/Warsaw',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Athens', 'Africa/Johannesburg',
  'Africa/Lagos', 'Africa/Nairobi', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

// The browser's own canonical spelling of a zone ('Europe/Kyiv' vs
// 'Europe/Kiev', 'America/Argentina/Buenos_Aires' vs 'America/Buenos_Aires'),
// so data from other sources lines up with the browser's list.
export function canonicalTimezone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return timeZone;
  }
}

let allTimezonesCache: string[] | null = null;

// Every zone the browser knows, alphabetical.
export function allTimezones(): string[] {
  if (allTimezonesCache) return allTimezonesCache;
  let list: string[] = [];
  try {
    list = Intl.supportedValuesOf('timeZone');
  } catch {
    // older runtime - fall through to the curated list
  }
  allTimezonesCache = list.length > 0 ? [...list] : [...FALLBACK_TIMEZONES];
  return allTimezonesCache;
}

// True when the browser lists the zone, under either spelling
// ('Asia/Kolkata' is known even if the browser lists 'Asia/Calcutta').
export function isKnownTimezone(timeZone: string): boolean {
  return allTimezones().includes(canonicalTimezone(timeZone));
}

export function isSameTimezone(a: string, b: string): boolean {
  return a === b || canonicalTimezone(a) === canonicalTimezone(b);
}

// Some browsers still list the pre-rename IANA names; show the modern city.
const CITY_ALIASES: Record<string, string> = {
  Calcutta: 'Kolkata',
  Kiev: 'Kyiv',
  Katmandu: 'Kathmandu',
  Rangoon: 'Yangon',
  Saigon: 'Ho Chi Minh City',
  Godthab: 'Nuuk',
  Asmera: 'Asmara',
  Faeroe: 'Faroe',
  Ponape: 'Pohnpei',
  Truk: 'Chuuk',
};

// "Prague", "Buenos Aires", "Port-au-Prince" - the last path segment.
export function timezoneCity(timeZone: string): string {
  const last = timeZone.split('/').pop() ?? timeZone;
  return (CITY_ALIASES[last] ?? last).replace(/_/g, ' ');
}

const offsetCache = new Map<string, string>();

// "UTC+02:00" for the zone at `at`. '' if the runtime can't resolve the zone.
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const key = `${timeZone}|${at.toISOString().slice(0, 13)}`;
  const cached = offsetCache.get(key);
  if (cached !== undefined) return cached;
  let label = '';
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    // Intl prints "GMT" for a zero offset and "GMT+5:30"/"GMT+05:30" otherwise.
    if (part) label = part === 'GMT' ? 'UTC+00:00' : part.replace('GMT', 'UTC');
  } catch {
    label = '';
  }
  offsetCache.set(key, label);
  return label;
}

// "Prague (UTC+02:00)"
export function timezoneLabel(timeZone: string, at: Date = new Date()): string {
  const offset = utcOffsetLabel(timeZone, at);
  return offset ? `${timezoneCity(timeZone)} (${offset})` : timezoneCity(timeZone);
}

// Zones the package lists for a country that we don't want to suggest.
const EXCLUDED_SUGGESTIONS: Record<string, readonly string[]> = {
  AU: ['Asia/Tokyo'],
  DE: ['Europe/Zurich'], // Büsingen exclave
};

// The most populous zone for countries that span several. US stays on Chicago
// (the DB default); for everything else this is the biggest city's zone.
const MULTI_ZONE_DEFAULT: Record<string, string> = {
  US: 'America/Chicago',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  BR: 'America/Sao_Paulo',
  RU: 'Europe/Moscow',
  MX: 'America/Mexico_City',
  ID: 'Asia/Jakarta',
  AR: 'America/Buenos_Aires',
  CL: 'America/Santiago',
  CN: 'Asia/Shanghai',
  KZ: 'Asia/Almaty',
  ES: 'Europe/Madrid',
  PT: 'Europe/Lisbon',
  UA: 'Europe/Kyiv',
  MN: 'Asia/Ulaanbaatar',
  VN: 'Asia/Ho_Chi_Minh',
  CY: 'Asia/Nicosia',
};

// A country's zones in the browser's spelling, restricted to zones the browser
// lists. [] for an unknown country ('XX' = Other, '' = none).
export function suggestedTimezonesForCountry(code: string | null | undefined): string[] {
  const norm = (code ?? '').trim().toUpperCase();
  const zones = norm ? getCountry(norm)?.timezones : undefined;
  if (!zones) return [];
  const skip = new Set(EXCLUDED_SUGGESTIONS[norm] ?? []);
  const known = new Set(allTimezones());
  const out: string[] = [];
  for (const z of zones) {
    if (skip.has(z)) continue;
    const canon = canonicalTimezone(z);
    if (known.has(canon) && !out.includes(canon)) out.push(canon);
  }
  return out;
}

// One zone for a country: its only zone, or the most populous for a
// multi-zone country. DEFAULT_TIMEZONE when the country is unknown.
export function defaultTimezoneForCountry(code: string | null | undefined): string {
  const suggested = suggestedTimezonesForCountry(code);
  if (suggested.length === 0) return DEFAULT_TIMEZONE;
  if (suggested.length === 1) return suggested[0];
  const preferred = MULTI_ZONE_DEFAULT[(code ?? '').trim().toUpperCase()];
  const canon = preferred ? canonicalTimezone(preferred) : undefined;
  return canon && suggested.includes(canon) ? canon : suggested[0];
}
