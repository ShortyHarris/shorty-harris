import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { circlePolygon, circlesBounds } from '../lib/geoCircle';

export interface MapCircle { lat: number; lng: number; radiusKm: number }

const SELECTED_SRC = 'radius-selected';
const EXISTING_SRC = 'radius-existing';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// Map preview for the "Within X miles of a point" picker: a draggable pin, a
// circle that follows the slider, and the campaign's other radius areas as
// lighter circles. Loaded lazily (mapbox-gl is large) and only mounted when a
// Mapbox token exists. Mapbox is the only consumer of this token.
export default function RadiusMap({
  center, radiusKm, existing, onMove, onFail,
}: {
  center: { lat: number; lng: number };
  radiusKm: number;
  existing: MapCircle[];
  onMove: (lat: number, lng: number) => void;
  /** Called if the map can't be created or its style fails to load, so the parent can hide it. */
  onFail?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const readyRef = useRef(false);
  // Latest props, readable from map callbacks without re-creating the map.
  const live = useRef({ center, radiusKm, existing, onMove, onFail });
  // Declared before the effects below so they always see the newest props.
  useEffect(() => { live.current = { center, radiusKm, existing, onMove, onFail }; });

  function draw() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { center: c, radiusKm: r, existing: ex } = live.current;
    (map.getSource(SELECTED_SRC) as mapboxgl.GeoJSONSource | undefined)?.setData(circlePolygon(c.lat, c.lng, r));
    (map.getSource(EXISTING_SRC) as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: ex.map((e) => circlePolygon(e.lat, e.lng, e.radiusKm)),
    });
  }

  function fit(animate: boolean) {
    const map = mapRef.current;
    if (!map) return;
    const { center: c, radiusKm: r, existing: ex } = live.current;
    const b = circlesBounds([{ lat: c.lat, lng: c.lng, radiusKm: r }, ...ex]);
    if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 28, duration: animate ? 300 : 0, maxZoom: 12 });
  }

  // Create the map once.
  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token || !containerRef.current) { live.current.onFail?.(); return; }
    mapboxgl.accessToken = token;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [live.current.center.lng, live.current.center.lat],
        zoom: 8,
        // Scrolling the page/modal over the map must not zoom it by accident.
        cooperativeGestures: true,
        attributionControl: true,
      });
    } catch {
      live.current.onFail?.();
      return;
    }
    mapRef.current = map;
    // Tapping/clicking the map moves the pin there.
    map.on('click', (e) => live.current.onMove(e.lngLat.lat, e.lngLat.lng));
    // A style/token failure before the first load means the map is unusable.
    map.on('error', () => { if (!readyRef.current) live.current.onFail?.(); });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    const marker = new mapboxgl.Marker({ draggable: true, color: '#3c7a5b' })
      .setLngLat([live.current.center.lng, live.current.center.lat])
      .addTo(map);
    markerRef.current = marker;
    // The circle follows the pin while it is being dragged; the parent only
    // hears about the final position.
    marker.on('drag', () => {
      const p = marker.getLngLat();
      (map.getSource(SELECTED_SRC) as mapboxgl.GeoJSONSource | undefined)
        ?.setData(circlePolygon(p.lat, p.lng, live.current.radiusKm));
    });
    marker.on('dragend', () => {
      const p = marker.getLngLat();
      live.current.onMove(p.lat, p.lng);
    });

    map.on('load', () => {
      map.addSource(EXISTING_SRC, { type: 'geojson', data: EMPTY });
      map.addSource(SELECTED_SRC, { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'existing-fill', type: 'fill', source: EXISTING_SRC, paint: { 'fill-color': '#3c7a5b', 'fill-opacity': 0.07 } });
      map.addLayer({ id: 'existing-line', type: 'line', source: EXISTING_SRC, paint: { 'line-color': '#3c7a5b', 'line-opacity': 0.35, 'line-width': 1.5 } });
      map.addLayer({ id: 'selected-fill', type: 'fill', source: SELECTED_SRC, paint: { 'fill-color': '#3c7a5b', 'fill-opacity': 0.18 } });
      map.addLayer({ id: 'selected-line', type: 'line', source: SELECTED_SRC, paint: { 'line-color': '#3c7a5b', 'line-width': 2 } });
      readyRef.current = true;
      draw();
      fit(false);
    });

    return () => {
      readyRef.current = false;
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Pin or other areas changed from outside (search result, chip click, reverse geocode).
  useEffect(() => {
    markerRef.current?.setLngLat([center.lng, center.lat]);
    draw();
    fit(true);
  }, [center.lat, center.lng, existing]);

  // Slider: the circle resizes immediately; the view re-fits once it settles.
  useEffect(() => {
    draw();
    const t = setTimeout(() => fit(true), 250);
    return () => clearTimeout(t);
  }, [radiusKm]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map preview. Drag the pin to move the search area; use the slider to change the radius."
      className="h-[240px] w-full overflow-hidden rounded-lg border border-[#ece8df]"
    />
  );
}
