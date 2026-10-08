import { Component, lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, MapPin, Search } from 'lucide-react';
import { geocodePlace, reverseGeocode, type GeocodeResult } from '../lib/mapboxGeocode';
import {
  type TargetArea, areaDisplayLabel, clampMiles, milesToKm, MAX_RADIUS_MILES, MIN_RADIUS_MILES,
} from '../lib/targetAreas';
import type { MapCircle } from './RadiusMap';

// mapbox-gl is large, so the map (and its CSS) loads as a separate chunk the
// first time a place is picked.
const RadiusMap = lazy(() => import('./RadiusMap'));

class MapBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

/* Target locations - either a plain place name, or a radius around a
   geocoded point. The 3-location cap counts both kinds together, so this
   takes a single `maxItems` the same way TagInput does. */
export function LocationAreaInput({
  label, helper, values, onChange, maxItems, capLabel,
}: {
  label: string;
  helper?: string;
  values: TargetArea[];
  onChange: (v: TargetArea[]) => void;
  maxItems?: number;
  capLabel?: string;
}) {
  const [mode, setMode] = useState<'text' | 'radius'>('text');
  const [textDraft, setTextDraft] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [picked, setPicked] = useState<GeocodeResult | null>(null);
  const [miles, setMiles] = useState(25);
  // Index in `values` of the radius area being adjusted; saving replaces it.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [labelNote, setLabelNote] = useState<string | null>(null);
  const reverseSeq = useRef(0);

  const mapEnabled = !!import.meta.env.VITE_MAPBOX_TOKEN && !mapFailed;
  const atCap = maxItems != null && values.length >= maxItems;
  // At the cap you can still adjust an existing area - that's a replace, not an add.
  const showEditor = !atCap || editingIndex !== null;

  // Memoised: RadiusMap refits whenever this array changes identity.
  const otherCircles = useMemo<MapCircle[]>(() => values.flatMap((v, i) => (
    v.mode === 'radius' && i !== editingIndex
      ? [{ lat: Number(v.lat), lng: Number(v.lng), radiusKm: Number(v.radius_km) }]
      : []
  )), [values, editingIndex]);

  function addArea(area: TargetArea) {
    if (atCap) return;
    if (values.some((v) => v.label === area.label)) return;
    onChange([...values, area]);
  }

  function addTextArea() {
    const v = textDraft.trim();
    if (!v) return;
    addArea({ mode: 'text', label: v });
    setTextDraft('');
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true); setSearchErr(null); setPicked(null);
    const { data, error } = await geocodePlace(query.trim());
    setSearching(false);
    if (error) { setSearchErr(error); return; }
    setResults(data);
  }

  function pickResult(r: GeocodeResult) {
    setPicked(r);
    setResults([]);
    setEditingIndex(null);
    setLabelNote(null);
  }

  function selectArea(i: number) {
    const a = values[i];
    if (a.mode !== 'radius') return;
    setMode('radius');
    setPicked({ label: a.label, lat: a.lat, lng: a.lng });
    setMiles(clampMiles(Math.round(Number(a.radius_km) / 1.60934)));
    setEditingIndex(i);
    setResults([]);
    setLabelNote(null);
  }

  function clearPicked() {
    setPicked(null);
    setEditingIndex(null);
    setLabelNote(null);
    reverseSeq.current++;
  }

  const movePin = useCallback((lat: number, lng: number) => {
    setPicked((p) => (p ? { ...p, lat: lat.toFixed(6), lng: lng.toFixed(6) } : p));
    const seq = ++reverseSeq.current;
    reverseGeocode(lat, lng).then((name) => {
      if (seq !== reverseSeq.current) return;
      if (name) {
        setPicked((p) => (p ? { ...p, label: name } : p));
        setLabelNote(null);
      } else {
        setLabelNote("Couldn't look up a name for this spot. Edit the label if needed.");
      }
    });
  }, []);

  const failMap = useCallback(() => setMapFailed(true), []);

  function addRadiusArea() {
    if (!picked) return;
    const areaLabel = picked.label.trim();
    if (!areaLabel) return;
    const area: TargetArea = {
      mode: 'radius',
      label: areaLabel,
      lat: picked.lat,
      lng: picked.lng,
      radius_km: milesToKm(clampMiles(miles)).toFixed(2),
    };
    if (editingIndex !== null) {
      if (values.some((v, idx) => idx !== editingIndex && v.label === areaLabel)) return;
      onChange(values.map((v, idx) => (idx === editingIndex ? area : v)));
    } else {
      addArea(area);
    }
    clearPicked();
    setQuery('');
    setMiles(25);
  }

  function removeArea(i: number) {
    if (editingIndex === i) clearPicked();
    else if (editingIndex !== null && i < editingIndex) setEditingIndex(editingIndex - 1);
    onChange(values.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <label className={fieldLbl}>{label}</label>

      {values.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {values.map((v, i) => (
            <div
              key={`${v.label}-${i}`}
              className={`flex items-center justify-between gap-2 rounded-lg border bg-[#fbf9f5] px-3 py-2 text-[12.5px] text-[#20211c] ${editingIndex === i ? 'border-[#3c7a5b]' : 'border-[#ece8df]'}`}
            >
              {v.mode === 'radius' ? (
                <button
                  type="button"
                  onClick={() => selectArea(i)}
                  title="Adjust this area"
                  className={`flex min-w-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[12.5px] text-[#20211c] ${editingIndex === i ? 'font-bold' : ''}`}
                >
                  <MapPin size={12} className="shrink-0 text-[#3c7a5b]" />
                  <span className="truncate">{areaDisplayLabel(v)}</span>
                </button>
              ) : (
                <span className="flex items-center gap-1.5 truncate">{areaDisplayLabel(v)}</span>
              )}
              <button
                type="button"
                onClick={() => removeArea(i)}
                aria-label={`Remove ${v.label}`}
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[#9a9d92] hover:text-[#20211c]"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!showEditor ? (
        <p className="m-0 text-[11px] text-[#b9831f]">
          You've reached the {maxItems}{capLabel ? ` ${capLabel}` : ''} limit. Remove one to add another.
        </p>
      ) : (
        <>
          <div className="mb-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11.5px] font-semibold ${mode === 'text' ? 'border-[#3c7a5b] bg-[#edf4ef] text-[#3c7a5b]' : 'border-[#ece8df] bg-transparent text-[#62655c]'}`}
            >
              City or area
            </button>
            <button
              type="button"
              onClick={() => setMode('radius')}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11.5px] font-semibold ${mode === 'radius' ? 'border-[#3c7a5b] bg-[#edf4ef] text-[#3c7a5b]' : 'border-[#ece8df] bg-transparent text-[#62655c]'}`}
            >
              Within X miles of a point
            </button>
          </div>

          {mode === 'text' && (
            <div className="flex gap-2">
              <input
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTextArea(); } }}
                placeholder="e.g. Prague, Czech Republic"
                style={FONT}
                className={`${inputCls} flex-1`}
              />
              <button type="button" onClick={addTextArea} className="cursor-pointer rounded-lg border-0 bg-[#3c7a5b] px-3.5 py-2.5 text-[12.5px] font-bold text-white">Add</button>
            </div>
          )}

          {mode === 'radius' && (
            <div className="flex flex-col gap-2">
              {!picked ? (
                <>
                  <div className="flex gap-2">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
                      placeholder="Search for a city or address"
                      style={FONT}
                      className={`${inputCls} flex-1`}
                    />
                    <button type="button" onClick={runSearch} disabled={searching} className="cursor-pointer rounded-lg border-0 bg-[#3c7a5b] px-3 py-2.5 text-white disabled:opacity-50">
                      <Search size={14} />
                    </button>
                  </div>
                  {searching && <p className="m-0 text-[11.5px] text-[#9a9d92]">Searching…</p>}
                  {searchErr && <p className="m-0 text-[11.5px] text-[#a8533a]">{searchErr}</p>}
                  {results.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-[#ece8df]">
                      {results.map((r) => (
                        <button
                          key={`${r.lat},${r.lng}`}
                          type="button"
                          onClick={() => pickResult(r)}
                          className="block w-full cursor-pointer border-0 border-b border-[#f5f2ec] bg-white px-3 py-2 text-left text-[12.5px] last:border-0 hover:bg-[#fbf9f5]"
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3 py-3">
                  <label htmlFor="area-label" className="mb-1 block text-[11px] text-[#9a9d92]">Label</label>
                  <input
                    id="area-label"
                    value={picked.label}
                    onChange={(e) => setPicked({ ...picked, label: e.target.value })}
                    style={FONT}
                    className={`${inputCls} mb-2`}
                  />
                  {labelNote && <p className="m-0 mb-2 text-[11.5px] text-[#b9831f]">{labelNote}</p>}
                  {mapEnabled && (
                    <div className="mb-3">
                      <MapBoundary onError={failMap}>
                        <Suspense fallback={<div className="flex h-[240px] w-full items-center justify-center rounded-lg border border-[#ece8df] bg-white text-[11.5px] text-[#9a9d92]">Loading map…</div>}>
                          <RadiusMap
                            center={{ lat: Number(picked.lat), lng: Number(picked.lng) }}
                            radiusKm={milesToKm(miles)}
                            existing={otherCircles}
                            onMove={movePin}
                            onFail={failMap}
                          />
                        </Suspense>
                      </MapBoundary>
                      <p className="mt-1 mb-0 text-[11px] text-[#9a9d92]">Drag the pin or tap the map to move it.</p>
                    </div>
                  )}
                  <label className="mb-1 block text-[11px] text-[#9a9d92]">Within {miles} mile{miles === 1 ? '' : 's'}</label>
                  <input
                    type="range"
                    min={MIN_RADIUS_MILES}
                    max={MAX_RADIUS_MILES}
                    value={miles}
                    onChange={(e) => setMiles(clampMiles(Number(e.target.value)))}
                    className="w-full"
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={addRadiusArea} className="cursor-pointer rounded-lg border-0 bg-[#3c7a5b] px-3.5 py-2 text-[12.5px] font-bold text-white">
                      {editingIndex !== null ? 'Update' : 'Add'} "Within {miles} mile{miles === 1 ? '' : 's'} of {picked.label}"
                    </button>
                    <button type="button" onClick={clearPicked} className="cursor-pointer rounded-lg border border-[#ece8df] bg-transparent px-3.5 py-2 text-[12.5px] font-semibold text-[#62655c]">{editingIndex !== null ? 'Cancel' : 'Back'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {helper && showEditor && <p className="mt-1 text-[11px] text-[#9a9d92]">{helper}</p>}
    </div>
  );
}
