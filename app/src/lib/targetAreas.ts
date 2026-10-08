import { looksLikeMultipleLocationsJoined } from './validation';

// campaigns.target_areas: a jsonb array (max 25) enforced by a CHECK
// constraint on the DB. Each entry is either a plain place name, or a radius
// around a geocoded point. lat/lng/radius_km are stored as STRINGS in the
// jsonb, not numbers - the constraint expects that shape.
export type TargetArea =
  | { mode: 'text'; label: string }
  | { mode: 'radius'; label: string; lat: string; lng: string; radius_km: string };

export const MAX_RADIUS_MILES = 50;
// 50 miles = 80.47 km; the DB constraint caps radius_km at 81, not a round
// 80, specifically so a full 50-mile radius isn't rejected.
export const MAX_RADIUS_KM = 80.47;
export const MIN_RADIUS_MILES = 1;

export function milesToKm(miles: number): number {
  return miles * 1.60934;
}

export function clampMiles(miles: number): number {
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, miles));
}

export function areaDisplayLabel(area: TargetArea): string {
  if (area.mode === 'text') return area.label;
  const miles = Math.round(Number(area.radius_km) / 1.60934);
  return `Within ${miles} mile${miles === 1 ? '' : 's'} of ${area.label}`;
}

// The plain-string list other screens and the old target_locations column
// expect - used as a human-readable fallback, never as what the scraper
// actually targets once any radius area exists.
export function areasToLocationLabels(areas: TargetArea[]): string[] {
  return areas.map((a) => a.label);
}

// WF0 uses target_areas completely if it's set and non-empty, falling back
// to target_locations only when target_areas is null/empty - so these two
// columns are never meant to merge. We always write target_locations (for
// any screen still reading it for display), and only also write
// target_areas when at least one entry is a radius area; a campaign made of
// only plain places keeps saving exactly as before, through target_locations
// alone, with target_areas left null.
export function buildAreaColumns(areas: TargetArea[]): { target_locations: string[]; target_areas: TargetArea[] | null } {
  const hasRadius = areas.some((a) => a.mode === 'radius');
  return {
    target_locations: areasToLocationLabels(areas),
    target_areas: hasRadius ? areas : null,
  };
}

// What a campaign's areas are when loaded for display or editing: the
// structured list if it was saved with one, else its plain-text locations.
export function campaignAreas(campaign: { target_areas: TargetArea[] | null; target_locations: string[] }): TargetArea[] {
  return campaign.target_areas ?? locationsToAreas(campaign.target_locations);
}

export function locationsToAreas(locations: string[]): TargetArea[] {
  return locations.map((label) => ({ mode: 'text', label }));
}

// Only typed text entries can be "several cities joined together" (e.g.
// "Normal, Bloomington, Peoria" with no semicolons). A radius area's label
// comes from Mapbox ("Normal, Illinois, United States") and legitimately has
// several commas, so it is never checked. Returns the message to show, or null.
export function joinedLocationsError(areas: TargetArea[]): string | null {
  const typed = areas.filter((a) => a.mode === 'text').map((a) => a.label);
  if (!looksLikeMultipleLocationsJoined(typed)) return null;
  return `"${typed[0]}" looks like more than one location joined together - press Enter (or use a semicolon) after each city so they save as separate entries.`;
}
