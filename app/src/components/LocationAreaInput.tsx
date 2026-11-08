import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, MapPin, Search } from 'lucide-react';
import { geocodePlace, reverseGeocode, type GeocodeResult } from '../lib/mapboxGeocode';
import {
  type TargetArea, areaDisplayLabel, clampMiles, milesToKm, MAX_RADIUS_MILES, MIN_RADIUS_MILES,
} from '../lib/targetAreas';
import type { MapCircle } from './RadiusMap';
import { RequiredMark } from './RequiredMark';

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
const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-(--ad-ink-faint)';
// Client screens use sentence-case labels; the admin keeps the caps style.
const fieldLblSentence = 'mb-1.5 block text-[13px] font-semibold text-(--ad-ink)';
const inputCls = 'w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)';

/* Place suggestions while typing (Mapbox), so people pick a real place instead of typing one
   freely. Waits 250ms after the last key; without a token it returns nothing and plain typing
   still works. Older answers never overwrite newer ones. */
function usePlaceSuggestions(query: string, enabled: boolean): GeocodeResult[] {
  const q = query.trim();
  const [found, setFound] = useState<GeocodeResult[]>([]);
  useEffect(() => {
    if (!enabled || q.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      geocodePlace(q).then(({ data }) => { if (live) setFound(data); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, enabled]);
  return enabled && q.length >= 2 ? found : [];
}

const optionCls = (active: boolean) =>
  `flex w-full cursor-pointer items-center gap-2 border-0 border-b border-(--ad-fill) px-3.5 py-2.5 text-left text-[13px] text-(--ad-ink) last:border-0 ${active ? 'bg-(--ad-green-tint)' : 'bg-(--ad-surface) hover:bg-(--ad-surface-2)'}`;

/* Target locations - either a plain place name, or a radius around a
   geocoded point. The 3-location cap counts both kinds together, so this
   takes a single `maxItems` the same way TagInput does. */
export function LocationAreaInput({
  label, helper, values, onChange, maxItems, capLabel, required, sentenceLabel = false,
}: {
  label: string;
  sentenceLabel?: boolean;
  required?: boolean;
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
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(0);

  const mapEnabled = !!import.meta.env.VITE_MAPBOX_TOKEN && !mapFailed;
  const placeSearch = !!import.meta.env.VITE_MAPBOX_TOKEN;
  const textSuggestions = usePlaceSuggestions(textDraft, placeSearch && mode === 'text' && suggestOpen);
  const radiusSuggestions = usePlaceSuggestions(query, placeSearch && mode === 'radius' && !picked);
  // An explicit search (Enter / the search button) wins over the as-you-type list.
  const radiusList = results.length ? results : radiusSuggestions;
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

  function addTextArea(label = textDraft) {
    const v = label.trim();
    if (!v) return;
    addArea({ mode: 'text', label: v });
    setTextDraft('');
    setSuggestOpen(false);
    setActive(0);
  }

  function onTextKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const open = suggestOpen && textSuggestions.length > 0;
    if (open && e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, textSuggestions.length - 1)); }
    else if (open && e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSuggestOpen(false); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter takes the highlighted suggestion; with none showing it adds what was typed.
      addTextArea(open ? textSuggestions[Math.min(active, textSuggestions.length - 1)].label : textDraft);
    }
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
      <label className={sentenceLabel ? fieldLblSentence : fieldLbl}>{label}{required && <RequiredMark />}</label>

      {values.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {values.map((v, i) => (
            <div
              key={`${v.label}-${i}`}
              className={`flex items-center justify-between gap-2 rounded-lg border bg-(--ad-surface-2) px-3 py-2 text-[12.5px] text-(--ad-ink) ${editingIndex === i ? 'border-(--ad-green)' : 'border-(--ad-line)'}`}
            >
              {v.mode === 'radius' ? (
                <button
                  type="button"
                  onClick={() => selectArea(i)}
                  title="Adjust this area"
                  className={`flex min-w-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[12.5px] text-(--ad-ink) ${editingIndex === i ? 'font-bold' : ''}`}
                >
                  <MapPin size={12} className="shrink-0 text-(--ad-green)" />
                  <span className="truncate">{areaDisplayLabel(v)}</span>
                </button>
              ) : (
                <span className="flex items-center gap-1.5 truncate">{areaDisplayLabel(v)}</span>
              )}
              <button
                type="button"
                onClick={() => removeArea(i)}
                aria-label={`Remove ${v.label}`}
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-(--ad-ink-faint) hover:text-(--ad-ink)"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!showEditor ? (
        <p className="m-0 text-[11px] text-(--ad-amber)">
          You've reached the {maxItems}{capLabel ? ` ${capLabel}` : ''} limit. Remove one to add another.
        </p>
      ) : (
        <>
          <div className="mb-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11.5px] font-semibold ${mode === 'text' ? 'border-(--ad-green) bg-(--ad-green-tint) text-(--ad-green)' : 'border-(--ad-line) bg-transparent text-(--ad-ink-soft)'}`}
            >
              City or area
            </button>
            <button
              type="button"
              onClick={() => setMode('radius')}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11.5px] font-semibold ${mode === 'radius' ? 'border-(--ad-green) bg-(--ad-green-tint) text-(--ad-green)' : 'border-(--ad-line) bg-transparent text-(--ad-ink-soft)'}`}
            >
              Within X miles of a point
            </button>
          </div>

          {mode === 'text' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <input
                  value={textDraft}
                  onChange={(e) => { setTextDraft(e.target.value); setSuggestOpen(true); setActive(0); }}
                  onKeyDown={onTextKey}
                  onBlur={() => setSuggestOpen(false)}
                  placeholder={placeSearch ? 'Start typing a city or region' : 'e.g. Prague, Czech Republic'}
                  aria-label={`Add ${label.toLowerCase()}`}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={suggestOpen && textSuggestions.length > 0}
                  aria-controls="place-suggestions"
                  style={FONT}
                  className={`${inputCls} flex-1`}
                />
                <button type="button" onClick={() => addTextArea()} className="cursor-pointer rounded-lg border-0 bg-(--ad-green) px-3.5 py-2.5 text-[12.5px] font-bold text-(--ad-on-accent)">Add</button>
              </div>
              {suggestOpen && textSuggestions.length > 0 && (
                <div id="place-suggestions" role="listbox" aria-label="Places" className="overflow-hidden rounded-lg border border-(--ad-line)">
                  {textSuggestions.map((r, i) => (
                    <button key={`${r.lat},${r.lng}`} type="button" role="option" aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => addTextArea(r.label)}
                      className={optionCls(i === active)}>
                      <MapPin size={13} className="shrink-0 text-(--ad-green)" aria-hidden />{r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'radius' && (
            <div className="flex flex-col gap-2">
              {!picked ? (
                <>
                  <div className="flex gap-2">
                    <input
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setResults([]); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
                      placeholder="Search for a city or address"
                      style={FONT}
                      className={`${inputCls} flex-1`}
                    />
                    <button type="button" onClick={runSearch} disabled={searching} className="cursor-pointer rounded-lg border-0 bg-(--ad-green) px-3 py-2.5 text-white disabled:opacity-50">
                      <Search size={14} />
                    </button>
                  </div>
                  {searching && <p className="m-0 text-[11.5px] text-(--ad-ink-faint)">Searching…</p>}
                  {searchErr && <p className="m-0 text-[11.5px] text-(--ad-clay)">{searchErr}</p>}
                  {radiusList.length > 0 && (
                    <div role="listbox" aria-label="Places" className="overflow-hidden rounded-lg border border-(--ad-line)">
                      {radiusList.map((r) => (
                        <button key={`${r.lat},${r.lng}`} type="button" role="option" aria-selected={false} onClick={() => pickResult(r)} className={optionCls(false)}>
                          <MapPin size={13} className="shrink-0 text-(--ad-green)" aria-hidden />{r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3 py-3">
                  <label htmlFor="area-label" className="mb-1 block text-[11px] text-(--ad-ink-faint)">Label</label>
                  <input
                    id="area-label"
                    value={picked.label}
                    onChange={(e) => setPicked({ ...picked, label: e.target.value })}
                    style={FONT}
                    className={`${inputCls} mb-2`}
                  />
                  {labelNote && <p className="m-0 mb-2 text-[11.5px] text-(--ad-amber)">{labelNote}</p>}
                  {mapEnabled && (
                    <div className="mb-3">
                      <MapBoundary onError={failMap}>
                        <Suspense fallback={<div className="flex h-[240px] w-full items-center justify-center rounded-lg border border-(--ad-line) bg-(--ad-surface) text-[11.5px] text-(--ad-ink-faint)">Loading map…</div>}>
                          <RadiusMap
                            center={{ lat: Number(picked.lat), lng: Number(picked.lng) }}
                            radiusKm={milesToKm(miles)}
                            existing={otherCircles}
                            onMove={movePin}
                            onFail={failMap}
                          />
                        </Suspense>
                      </MapBoundary>
                      <p className="mt-1 mb-0 text-[11px] text-(--ad-ink-faint)">Drag the pin or tap the map to move it.</p>
                    </div>
                  )}
                  <label className="mb-1 block text-[11px] text-(--ad-ink-faint)">Within {miles} mile{miles === 1 ? '' : 's'}</label>
                  <input
                    type="range"
                    min={MIN_RADIUS_MILES}
                    max={MAX_RADIUS_MILES}
                    value={miles}
                    onChange={(e) => setMiles(clampMiles(Number(e.target.value)))}
                    className="w-full"
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={addRadiusArea} className="cursor-pointer rounded-lg border-0 bg-(--ad-green) px-3.5 py-2 text-[12.5px] font-bold text-white">
                      {editingIndex !== null ? 'Update' : 'Add'} "Within {miles} mile{miles === 1 ? '' : 's'} of {picked.label}"
                    </button>
                    <button type="button" onClick={clearPicked} className="cursor-pointer rounded-lg border border-(--ad-line) bg-transparent px-3.5 py-2 text-[12.5px] font-semibold text-(--ad-ink-soft)">{editingIndex !== null ? 'Cancel' : 'Back'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {helper && showEditor && <p className="mt-1 text-[11px] text-(--ad-ink-faint)">{helper}</p>}
    </div>
  );
}
