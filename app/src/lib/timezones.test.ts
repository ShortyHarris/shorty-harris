import { describe, it, expect } from 'vitest';
import {
  TIMEZONES, defaultTimezoneForCountry, timezoneLabel, timezoneOptionsFor, utcOffsetLabel,
} from './timezones';

describe('defaultTimezoneForCountry', () => {
  it('maps known countries', () => {
    expect(defaultTimezoneForCountry('CZ')).toBe('Europe/Prague');
    expect(defaultTimezoneForCountry('de')).toBe('Europe/Berlin');
    expect(defaultTimezoneForCountry('GB')).toBe('Europe/London');
    expect(defaultTimezoneForCountry('PL')).toBe('Europe/Warsaw');
    expect(defaultTimezoneForCountry('US')).toBe('America/Chicago');
  });
  it('falls back to America/Chicago', () => {
    expect(defaultTimezoneForCountry(null)).toBe('America/Chicago');
    expect(defaultTimezoneForCountry('XX')).toBe('America/Chicago');
  });
  it('only maps to zones in the curated list', () => {
    for (const code of ['US', 'CA', 'GB', 'IE', 'PT', 'FR', 'DE', 'CZ', 'PL', 'ES', 'IT', 'GR', 'AU', 'FI']) {
      expect(TIMEZONES.some((t) => t.id === defaultTimezoneForCountry(code))).toBe(true);
    }
  });
});

describe('offset labels', () => {
  it('follows DST', () => {
    expect(utcOffsetLabel('Europe/Prague', new Date('2026-01-15T12:00:00Z'))).toBe('UTC+01:00');
    expect(utcOffsetLabel('Europe/Prague', new Date('2026-07-15T12:00:00Z'))).toBe('UTC+02:00');
  });
  it('formats zero offset', () => {
    expect(utcOffsetLabel('Europe/London', new Date('2026-01-15T12:00:00Z'))).toBe('UTC+00:00');
  });
  it('includes the city', () => {
    expect(timezoneLabel('Asia/Kolkata', new Date('2026-01-15T12:00:00Z'))).toBe('Kolkata (UTC+05:30)');
  });
});

describe('timezoneOptionsFor', () => {
  it('appends an unknown zone', () => {
    const opts = timezoneOptionsFor('Asia/Seoul');
    expect(opts).toHaveLength(TIMEZONES.length + 1);
    expect(opts.at(-1)?.id).toBe('Asia/Seoul');
  });
  it('leaves the list alone for a known zone', () => {
    expect(timezoneOptionsFor('Europe/Rome')).toHaveLength(TIMEZONES.length);
  });
});
