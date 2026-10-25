import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIMEZONE, allTimezones, canonicalTimezone, defaultTimezoneForCountry, isKnownTimezone,
  isSameTimezone, suggestedTimezonesForCountry, timezoneLabel, utcOffsetLabel,
} from './timezones';

describe('allTimezones', () => {
  it('lists the full browser set, not a short curated list', () => {
    expect(allTimezones().length).toBeGreaterThan(300);
    expect(isKnownTimezone('Europe/Prague')).toBe(true);
    expect(isKnownTimezone('Asia/Kolkata')).toBe(true);
    expect(isKnownTimezone('Not/AZone')).toBe(false);
  });
  it('treats old and modern spellings of a zone as the same', () => {
    expect(isKnownTimezone('Asia/Kolkata')).toBe(true);
    expect(isKnownTimezone('Asia/Calcutta')).toBe(true);
    expect(isSameTimezone('Asia/Kolkata', 'Asia/Calcutta')).toBe(true);
    expect(isSameTimezone('Asia/Kolkata', 'Asia/Tokyo')).toBe(false);
  });
});

describe('suggestedTimezonesForCountry', () => {
  it('returns the single zone for one-zone countries', () => {
    expect(suggestedTimezonesForCountry('CZ')).toEqual(['Europe/Prague']);
    expect(suggestedTimezonesForCountry('de')).toEqual(['Europe/Berlin']);
    expect(suggestedTimezonesForCountry('PL')).toEqual(['Europe/Warsaw']);
  });
  it('returns many zones for multi-zone countries', () => {
    for (const code of ['US', 'CA', 'AU', 'BR']) {
      expect(suggestedTimezonesForCountry(code).length).toBeGreaterThan(3);
    }
  });
  it('only returns zones present in the full list, without duplicates', () => {
    for (const code of ['US', 'CA', 'AU', 'BR', 'AR', 'UA', 'RU']) {
      const zones = suggestedTimezonesForCountry(code);
      expect(zones.every(isKnownTimezone)).toBe(true);
      expect(new Set(zones).size).toBe(zones.length);
    }
  });
  it("doesn't suggest Tokyo for Australia", () => {
    expect(suggestedTimezonesForCountry('AU')).not.toContain('Asia/Tokyo');
  });
  it('is empty for unknown or missing countries', () => {
    expect(suggestedTimezonesForCountry('XX')).toEqual([]);
    expect(suggestedTimezonesForCountry('')).toEqual([]);
    expect(suggestedTimezonesForCountry(null)).toEqual([]);
  });
});

describe('defaultTimezoneForCountry', () => {
  it('auto-selects the only zone of a single-zone country', () => {
    expect(defaultTimezoneForCountry('CZ')).toBe('Europe/Prague');
    expect(defaultTimezoneForCountry('DE')).toBe('Europe/Berlin');
    expect(defaultTimezoneForCountry('GB')).toBe('Europe/London');
    expect(defaultTimezoneForCountry('PL')).toBe('Europe/Warsaw');
  });
  it('picks the main zone of multi-zone countries, inside the suggestions', () => {
    expect(defaultTimezoneForCountry('US')).toBe('America/Chicago');
    expect(defaultTimezoneForCountry('CA')).toBe('America/Toronto');
    expect(defaultTimezoneForCountry('AU')).toBe('Australia/Sydney');
    expect(defaultTimezoneForCountry('BR')).toBe('America/Sao_Paulo');
    for (const code of ['US', 'CA', 'AU', 'BR', 'RU', 'MX', 'AR']) {
      expect(suggestedTimezonesForCountry(code)).toContain(defaultTimezoneForCountry(code));
    }
  });
  it('falls back to America/Chicago when the country is unknown', () => {
    expect(defaultTimezoneForCountry(null)).toBe(DEFAULT_TIMEZONE);
    expect(defaultTimezoneForCountry('')).toBe(DEFAULT_TIMEZONE);
    expect(defaultTimezoneForCountry('XX')).toBe('America/Chicago');
  });
});

describe('canonicalTimezone', () => {
  it('maps package aliases onto the browser spelling', () => {
    expect(isKnownTimezone(canonicalTimezone('America/Argentina/Buenos_Aires'))).toBe(true);
  });
  it('returns an unknown name unchanged', () => {
    expect(canonicalTimezone('Not/AZone')).toBe('Not/AZone');
  });
});

describe('labels', () => {
  it('follows DST', () => {
    expect(utcOffsetLabel('Europe/Prague', new Date('2026-01-15T12:00:00Z'))).toBe('UTC+01:00');
    expect(utcOffsetLabel('Europe/Prague', new Date('2026-07-15T12:00:00Z'))).toBe('UTC+02:00');
  });
  it('formats zero and half-hour offsets', () => {
    expect(utcOffsetLabel('Europe/London', new Date('2026-01-15T12:00:00Z'))).toBe('UTC+00:00');
    expect(timezoneLabel('Asia/Kolkata', new Date('2026-01-15T12:00:00Z'))).toBe('Kolkata (UTC+05:30)');
  });
  it('shows modern city names for old IANA aliases', () => {
    expect(timezoneLabel('Asia/Calcutta', new Date('2026-01-15T12:00:00Z'))).toBe('Kolkata (UTC+05:30)');
    expect(timezoneLabel('Europe/Kiev', new Date('2026-01-15T12:00:00Z'))).toBe('Kyiv (UTC+02:00)');
  });
  it('labels as City (offset)', () => {
    expect(timezoneLabel('Europe/Prague', new Date('2026-07-15T12:00:00Z'))).toBe('Prague (UTC+02:00)');
    expect(timezoneLabel('America/Argentina/Buenos_Aires', new Date('2026-07-15T12:00:00Z'))).toBe('Buenos Aires (UTC-03:00)');
  });
});
