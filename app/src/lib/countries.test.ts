import { describe, expect, it } from 'vitest';
import {
  COUNTRY_OPTIONS, EU_COUNTRIES, OTHER_COUNTRY_CODE,
  countryName, countryOptionsFor, defaultCampaignCountry, findCountryHold, isEuCountry, privacyUrlError,
} from './countries';

describe('country list', () => {
  it('has the 27 EU countries first, then US, GB, CA, AU and Other', () => {
    expect(EU_COUNTRIES).toHaveLength(27);
    expect(COUNTRY_OPTIONS.slice(0, 27)).toEqual(EU_COUNTRIES);
    expect(COUNTRY_OPTIONS.slice(27).map((c) => c.code)).toEqual(['US', 'GB', 'CA', 'AU', OTHER_COUNTRY_CODE]);
    expect(COUNTRY_OPTIONS.slice(-1)[0].name).toBe('Other');
  });

  it('has unique two-letter uppercase codes', () => {
    const codes = COUNTRY_OPTIONS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z]{2}$/));
  });

  it('resolves names and falls back to the raw code', () => {
    expect(countryName('cz')).toBe('Czechia');
    expect(countryName('NZ')).toBe('NZ');
    expect(countryName(null)).toBe('');
  });

  it('appends a code outside the list so it is preserved', () => {
    expect(countryOptionsFor('DE')).toEqual([...COUNTRY_OPTIONS]);
    expect(countryOptionsFor(null)).toEqual([...COUNTRY_OPTIONS]);
    const withNz = countryOptionsFor('nz');
    expect(withNz).toHaveLength(COUNTRY_OPTIONS.length + 1);
    expect(withNz[withNz.length - 1]).toEqual({ code: 'NZ', name: 'NZ' });
  });
});

describe('isEuCountry', () => {
  it('is true for every listed EU member, case- and space-insensitive', () => {
    EU_COUNTRIES.forEach((c) => expect(isEuCountry(c.code)).toBe(true));
    expect(isEuCountry('cz')).toBe(true);
    expect(isEuCountry(' de ')).toBe(true);
  });

  it('is false for non-EU, Other, GB and empty values', () => {
    ['US', 'GB', 'CA', 'AU', OTHER_COUNTRY_CODE, 'CH', 'NO', '', null, undefined].forEach((c) =>
      expect(isEuCountry(c)).toBe(false));
  });
});

describe('defaultCampaignCountry', () => {
  it('uses the client country when it is in the list', () => {
    expect(defaultCampaignCountry('CZ')).toBe('CZ');
    expect(defaultCampaignCountry(' us ')).toBe('US');
  });

  it('falls back to Other for a country outside the list', () => {
    expect(defaultCampaignCountry('NZ')).toBe(OTHER_COUNTRY_CODE);
  });

  it('is empty when the client has no country', () => {
    expect(defaultCampaignCountry(null)).toBe('');
    expect(defaultCampaignCountry(undefined)).toBe('');
    expect(defaultCampaignCountry('  ')).toBe('');
  });
});

describe('findCountryHold', () => {
  const holds = [
    { country: 'DE', reason: 'Awaiting legal basis review' },
    { country: 'AT', reason: 'Awaiting legal basis review' },
  ];

  it('finds an active hold for the country', () => {
    expect(findCountryHold(holds, 'de')).toEqual(holds[0]);
    expect(findCountryHold(holds, 'AT')).toEqual(holds[1]);
  });

  it('returns null when there is no hold or no country', () => {
    expect(findCountryHold(holds, 'CZ')).toBeNull();
    expect(findCountryHold(holds, null)).toBeNull();
    expect(findCountryHold([], 'DE')).toBeNull();
  });
});

describe('privacyUrlError', () => {
  it('allows empty (optional) and valid https URLs', () => {
    expect(privacyUrlError('')).toBeNull();
    expect(privacyUrlError('   ')).toBeNull();
    expect(privacyUrlError('https://example.com/privacy')).toBeNull();
    expect(privacyUrlError(' https://example.com ')).toBeNull();
  });

  it('rejects non-https and malformed values', () => {
    expect(privacyUrlError('http://example.com')).toMatch(/https:\/\//);
    expect(privacyUrlError('example.com/privacy')).toMatch(/https:\/\//);
    expect(privacyUrlError('https://')).not.toBeNull();
  });
});
