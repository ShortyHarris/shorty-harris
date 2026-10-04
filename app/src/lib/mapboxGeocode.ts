export interface GeocodeResult {
  label: string;
  lat: string;
  lng: string;
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
    return { data: results, error: null };
  } catch {
    return { data: [], error: 'Could not reach place search right now.' };
  }
}
