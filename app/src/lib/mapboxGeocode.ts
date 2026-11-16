export interface GeocodeResult {
  label: string;
  lat: string;
  lng: string;
}

/**
 * A tidier place name than Mapbox's place_name: drops postcodes and repeated parts, so
 * "Prague, Prague, Czechia" reads "Prague, Czechia" and "Bozeman, Montana 59715, United States"
 * reads "Bozeman, Montana, United States". This label is also what the search uses as the area.
 */
export function cleanPlaceLabel(name: string): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of name.split(',')) {
    // A postcode on its own or after a region name ("Montana 59715", "110 00"). Short numbers
    // stay: "Prague 1" is a district, not a postcode.
    const part = raw.replace(/\b\d{3,}(?:[\s-]\d{2,})?\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!part || !/\p{L}/u.test(part)) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  return parts.join(', ') || name.trim();
}

/** Clean labels, and one suggestion per label (Mapbox can return the same name twice). */
export function tidySuggestions(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  const out: GeocodeResult[] = [];
  for (const r of results) {
    const label = cleanPlaceLabel(r.label);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, label });
  }
  return out;
}

// Mapbox returns [longitude, latitude] in `center` - the constraint can't
// catch a swapped lat/lng pair when both happen to be in range, so this is
// the one place that order matters: read by index here, name the fields
// correctly immediately, and nothing downstream ever has to think about
// coordinate order again.
export async function geocodePlace(query: string): Promise<{ data: GeocodeResult[]; error: string | null }> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (!token) return { data: [], error: 'Place search is not configured.' };
  if (!query.trim()) return { data: [], error: null };

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&types=place,locality,region,country&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return { data: [], error: `Place search failed (${res.status}).` };
    const json = await res.json() as { features?: { place_name: string; center: [number, number] }[] };
    const results: GeocodeResult[] = (json.features ?? []).map((f) => ({
      label: f.place_name,
      lng: String(f.center[0]),
      lat: String(f.center[1]),
    }));
    return { data: tidySuggestions(results), error: null };
  } catch {
    return { data: [], error: 'Could not reach place search right now.' };
  }
}

// Used after the map pin is dragged, so the saved label describes where the
// pin actually ended up instead of the place that was first searched for.
// Returns null on any failure - the caller keeps the existing label.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=place,locality,region,country&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as { features?: { place_name: string }[] };
    const name = json.features?.[0]?.place_name;
    return name ? cleanPlaceLabel(name) : null;
  } catch {
    return null;
  }
}
