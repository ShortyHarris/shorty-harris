// Curated IANA timezones for clients.send_timezone. WF2.5 sends each client's
// emails only Mon-Fri 9:00-17:00 in this zone. Offsets are computed with Intl
// at render time so DST is always correct.

export const DEFAULT_TIMEZONE = 'America/Chicago';

export interface TimezoneOption {
  id: string;
  city: string;
}

export const TIMEZONES: readonly TimezoneOption[] = [
  { id: 'America/New_York', city: 'New York' },
  { id: 'America/Chicago', city: 'Chicago' },
  { id: 'America/Denver', city: 'Denver' },
  { id: 'America/Los_Angeles', city: 'Los Angeles' },
  { id: 'America/Toronto', city: 'Toronto' },
  { id: 'America/Sao_Paulo', city: 'São Paulo' },
  { id: 'Europe/London', city: 'London' },
  { id: 'Europe/Dublin', city: 'Dublin' },
  { id: 'Europe/Paris', city: 'Paris' },
  { id: 'Europe/Berlin', city: 'Berlin' },
  { id: 'Europe/Prague', city: 'Prague' },
  { id: 'Europe/Warsaw', city: 'Warsaw' },
  { id: 'Europe/Madrid', city: 'Madrid' },
  { id: 'Europe/Rome', city: 'Rome' },
  { id: 'Europe/Athens', city: 'Athens' },
  { id: 'Africa/Johannesburg', city: 'Johannesburg' },
  { id: 'Africa/Lagos', city: 'Lagos' },
  { id: 'Africa/Nairobi', city: 'Nairobi' },
  { id: 'Asia/Dubai', city: 'Dubai' },
  { id: 'Asia/Kolkata', city: 'Kolkata' },
  { id: 'Asia/Singapore', city: 'Singapore' },
  { id: 'Asia/Tokyo', city: 'Tokyo' },
  { id: 'Australia/Sydney', city: 'Sydney' },
  { id: 'Pacific/Auckland', city: 'Auckland' },
];

// "UTC+02:00" for the zone at `at`. Falls back to '' if the runtime can't
// resolve the zone.
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!part) return '';
    // Intl prints "GMT" for zero offset and "GMT+5:30"/"GMT+05:30" otherwise.
    if (part === 'GMT') return 'UTC+00:00';
    return part.replace('GMT', 'UTC');
  } catch {
    return '';
  }
}

export function timezoneLabel(timeZone: string, at: Date = new Date()): string {
  const city = TIMEZONES.find((t) => t.id === timeZone)?.city
    ?? timeZone.split('/').pop()?.replace(/_/g, ' ')
    ?? timeZone;
  const offset = utcOffsetLabel(timeZone, at);
  return offset ? `${city} (${offset})` : city;
}

// Options for a select whose current value may be a zone outside the list;
// the unknown zone is appended so opening and saving never rewrites it.
export function timezoneOptionsFor(current: string | null | undefined): TimezoneOption[] {
  if (!current || TIMEZONES.some((t) => t.id === current)) return [...TIMEZONES];
  return [...TIMEZONES, { id: current, city: current.split('/').pop()?.replace(/_/g, ' ') ?? current }];
}

// Countries map to the nearest zone in the curated list (same UTC offset and
// DST rules where the country's own capital isn't listed).
const COUNTRY_TIMEZONE: Record<string, string> = {
  US: 'America/Chicago',
  CA: 'America/Toronto',
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  PT: 'Europe/London',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  AT: 'Europe/Berlin',
  NL: 'Europe/Berlin',
  BE: 'Europe/Berlin',
  LU: 'Europe/Berlin',
  DK: 'Europe/Berlin',
  SE: 'Europe/Berlin',
  CZ: 'Europe/Prague',
  SK: 'Europe/Prague',
  HU: 'Europe/Prague',
  SI: 'Europe/Prague',
  HR: 'Europe/Prague',
  MT: 'Europe/Prague',
  PL: 'Europe/Warsaw',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  GR: 'Europe/Athens',
  CY: 'Europe/Athens',
  BG: 'Europe/Athens',
  RO: 'Europe/Athens',
  FI: 'Europe/Athens',
  EE: 'Europe/Athens',
  LV: 'Europe/Athens',
  LT: 'Europe/Athens',
  AU: 'Australia/Sydney',
};

export function defaultTimezoneForCountry(code: string | null | undefined): string {
  return COUNTRY_TIMEZONE[(code ?? '').trim().toUpperCase()] ?? DEFAULT_TIMEZONE;
}
