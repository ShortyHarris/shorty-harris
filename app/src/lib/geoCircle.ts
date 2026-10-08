// Geometry for the radius map preview. Kept free of mapbox-gl so it is cheap
// to import and testable without WebGL.

const EARTH_RADIUS_KM = 6371.0088;

export type LngLat = [lng: number, lat: number];

// Point `km` away from (lat, lng) along `bearing` degrees (great-circle).
function destination(lat: number, lng: number, km: number, bearing: number): LngLat {
  const d = km / EARTH_RADIUS_KM;
  const b = (bearing * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b));
  const λ2 = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  // Normalise longitude to [-180, 180].
  return [((((λ2 * 180) / Math.PI + 540) % 360) - 180), (φ2 * 180) / Math.PI];
}

// Closed ring approximating a circle on the globe, as a GeoJSON polygon.
export function circlePolygon(lat: number, lng: number, radiusKm: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: LngLat[] = [];
  for (let i = 0; i < steps; i++) ring.push(destination(lat, lng, radiusKm, (i / steps) * 360));
  ring.push(ring[0]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

// [west, south, east, north] box that contains every given circle.
export function circlesBounds(circles: { lat: number; lng: number; radiusKm: number }[]): [number, number, number, number] | null {
  if (circles.length === 0) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const c of circles) {
    for (const bearing of [0, 90, 180, 270]) {
      const [lng, lat] = destination(c.lat, c.lng, c.radiusKm, bearing);
      w = Math.min(w, lng); e = Math.max(e, lng);
      s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  return [w, s, e, n];
}
