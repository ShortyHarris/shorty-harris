import { describe, it, expect } from 'vitest';
import { circlePolygon, circlesBounds } from './geoCircle';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(a));
}

describe('geoCircle', () => {
  it('builds a closed ring with every point at the radius', () => {
    const ring = circlePolygon(50.08, 14.43, 40).geometry.coordinates[0];
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    for (const [lng, lat] of ring) expect(haversineKm(50.08, 14.43, lat, lng)).toBeCloseTo(40, 1);
  });

  it('emits [lng, lat] order', () => {
    const [lng, lat] = circlePolygon(50, 14, 1).geometry.coordinates[0][0];
    expect(lat).toBeGreaterThan(50);
    expect(lng).toBeCloseTo(14, 2);
  });

  it('bounds contain every circle and are null when empty', () => {
    expect(circlesBounds([])).toBeNull();
    const [w, s, e, n] = circlesBounds([{ lat: 10, lng: 20, radiusKm: 10 }, { lat: 12, lng: 22, radiusKm: 5 }])!;
    expect(w).toBeLessThan(20); expect(s).toBeLessThan(10);
    expect(e).toBeGreaterThan(22); expect(n).toBeGreaterThan(12);
  });
});
