import { describe, expect, it } from 'vitest';
import { cleanPlaceLabel, tidySuggestions } from './mapboxGeocode';

describe('cleanPlaceLabel', () => {
  it('drops a repeated part', () => {
    expect(cleanPlaceLabel('Prague, Prague, Czechia')).toBe('Prague, Czechia');
    expect(cleanPlaceLabel('New York, New York, United States')).toBe('New York, United States');
  });
  it('drops postcodes', () => {
    expect(cleanPlaceLabel('Bozeman, Montana 59715, United States')).toBe('Bozeman, Montana, United States');
    expect(cleanPlaceLabel('Prague 1, 110 00, Czechia')).toBe('Prague 1, Czechia');
  });
  it('leaves an ordinary name alone', () => {
    expect(cleanPlaceLabel('Bozeman, Montana, United States')).toBe('Bozeman, Montana, United States');
    expect(cleanPlaceLabel('Montana, United States')).toBe('Montana, United States');
  });
});

describe('tidySuggestions', () => {
  it('cleans labels and keeps one suggestion per label', () => {
    const out = tidySuggestions([
      { label: 'Prague, Prague, Czechia', lat: '50.08', lng: '14.43' },
      { label: 'Prague, Czechia', lat: '50.07', lng: '14.41' },
      { label: 'Prague, Oklahoma, United States', lat: '35.48', lng: '-96.68' },
    ]);
    expect(out.map((r) => r.label)).toEqual(['Prague, Czechia', 'Prague, Oklahoma, United States']);
    expect(out[0].lat).toBe('50.08');
  });
});
