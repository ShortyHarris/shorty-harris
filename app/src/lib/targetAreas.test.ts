import { describe, expect, it } from 'vitest';
import { areaDisplayLabel, buildAreaColumns, campaignAreas, joinedLocationsError, locationsToAreas, type TargetArea } from './targetAreas';

const text = (label: string): TargetArea => ({ mode: 'text', label });
const radius = (label: string, km = '40.23'): TargetArea => ({
  mode: 'radius', label, lat: '40.5142', lng: '-88.9906', radius_km: km,
});

describe('buildAreaColumns', () => {
  it('text-only: writes target_locations and leaves target_areas null', () => {
    const cols = buildAreaColumns([text('Peoria, IL'), text('Springfield, IL')]);
    expect(cols.target_locations).toEqual(['Peoria, IL', 'Springfield, IL']);
    expect(cols.target_areas).toBeNull();
    // The key must be present (not omitted) so an update overwrites a stale value.
    expect(cols).toHaveProperty('target_areas');
  });

  it('radius-only: writes the structured list and the labels', () => {
    const areas = [radius('Normal, IL')];
    const cols = buildAreaColumns(areas);
    expect(cols.target_areas).toEqual(areas);
    expect(cols.target_locations).toEqual(['Normal, IL']);
  });

  it('mixed: target_areas lists every area, text ones included, in order', () => {
    const areas = [text('Peoria, IL'), radius('Normal, IL'), text('Springfield, IL')];
    const cols = buildAreaColumns(areas);
    expect(cols.target_areas).toHaveLength(3);
    expect(cols.target_areas).toEqual(areas);
    expect(cols.target_locations).toHaveLength(3);
    // The DB trigger requires target_areas to be at least as long as target_locations.
    expect(cols.target_areas!.length).toBeGreaterThanOrEqual(cols.target_locations.length);
  });

  it('removing the last radius area clears target_areas instead of leaving it stale', () => {
    const before = buildAreaColumns([text('Peoria, IL'), radius('Normal, IL')]);
    expect(before.target_areas).not.toBeNull();
    const after = buildAreaColumns([text('Peoria, IL')]);
    expect(after.target_areas).toBeNull();
  });

  it('empty list clears both columns', () => {
    expect(buildAreaColumns([])).toEqual({ target_locations: [], target_areas: null });
  });
});

describe('campaignAreas / areaDisplayLabel', () => {
  it('falls back to target_locations for text-only campaigns', () => {
    expect(campaignAreas({ target_areas: null, target_locations: ['Peoria, IL'] })).toEqual(locationsToAreas(['Peoria, IL']));
  });

  it('prefers target_areas when present', () => {
    const areas = [radius('Normal, IL')];
    expect(campaignAreas({ target_areas: areas, target_locations: ['Normal, IL'] })).toBe(areas);
  });

  it('labels radius areas in miles and leaves text labels unchanged', () => {
    expect(areaDisplayLabel(text('Peoria, IL'))).toBe('Peoria, IL');
    expect(areaDisplayLabel(radius('Normal, IL', '40.23'))).toBe('Within 25 miles of Normal, IL');
  });
});

describe('joinedLocationsError', () => {
  it('does not block a single radius area whose Mapbox label has several commas', () => {
    expect(joinedLocationsError([radius('Normal, Illinois, United States')])).toBeNull();
  });

  it('still flags a typed text area that joins several cities', () => {
    const msg = joinedLocationsError([text('Normal, Bloomington, Peoria')]);
    expect(msg).toContain('"Normal, Bloomington, Peoria" looks like more than one location');
  });

  it('flags the typed area even when a radius area sits alongside it', () => {
    // One typed entry + one radius entry: only the typed entry is judged.
    expect(joinedLocationsError([text('Normal, Bloomington, Peoria'), radius('Normal, Illinois, United States')])).not.toBeNull();
  });

  it('accepts ordinary "City, ST" text areas', () => {
    expect(joinedLocationsError([text('Peoria, IL')])).toBeNull();
    expect(joinedLocationsError([])).toBeNull();
  });
});
