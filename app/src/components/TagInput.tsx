import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { RequiredMark } from './RequiredMark';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-(--ad-ink-faint)';
// Client screens use sentence-case labels; the admin keeps the caps style.
const fieldLblSentence = 'mb-1.5 block text-[13px] font-semibold text-(--ad-ink)';
const inputCls = 'w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)';

/* Tag input - type + Enter (or the separator key, or clicking away) adds
   removable chips. `splitOn` also lets a single paste/typed string like
   "restaurants, cafes, hotels" become three chips at once. Each chip is
   its own array entry - this is what keeps a multi-value field (locations,
   search terms) from ever collapsing into one joined string on save. */
export type ChipTone = 'brand' | 'ink' | 'outline';

export const CHIP_TONE: Record<ChipTone, { chip: string; remove: string }> = {
  brand: { chip: 'bg-(--ad-green-tint) text-(--ad-green)', remove: 'text-(--ad-green)/60 hover:text-(--ad-green)' },
  ink: { chip: 'bg-(--ad-ink) text-(--ad-surface)', remove: 'text-(--ad-surface)/60 hover:text-(--ad-surface)' },
  outline: { chip: 'border border-(--ad-ink-soft) bg-transparent text-(--ad-ink)', remove: 'text-(--ad-ink-soft) hover:text-(--ad-ink)' },
};

export function TagInput({
  label, placeholder, helper, values, onChange, splitOn = ',', maxItems, capLabel, required, tone = 'brand', sentenceLabel = false,
  collapseAfter = 12,
}: {
  /** Long lists show this many chips plus a "Show all" toggle, so a field
   *  with dozens of entries doesn't push the rest of the form off screen. */
  collapseAfter?: number;
  tone?: ChipTone;
  sentenceLabel?: boolean;
  label: string;
  required?: boolean;
  placeholder: string;
  helper?: string;
  values: string[];
  onChange: (v: string[]) => void;
  splitOn?: string;
  /** When set, values beyond this count are refused rather than added — read
   *  from the server's validate_campaign_inputs limits, never hardcoded. */
  maxItems?: number;
  /** Noun shown in the cap message, e.g. "search terms" or "locations". */
  capLabel?: string;
}) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const atCap = maxItems != null && values.length >= maxItems;
  const overCap = maxItems != null && values.length > maxItems;
  const collapsible = values.length > collapseAfter;
  const visible = collapsible && !expanded ? values.slice(0, collapseAfter) : values;
  const hidden = values.length - visible.length;

  function commitDraft(raw: string) {
    const parts = raw.split(splitOn).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) { setDraft(''); return; }
    const next = [...values];
    for (const p of parts) {
      if (maxItems != null && next.length >= maxItems) break;
      if (!next.includes(p)) next.push(p);
    }
    onChange(next);
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== splitOn) return;
    e.preventDefault();
    commitDraft(draft);
  }

  return (
    <div>
      {label && <label className={sentenceLabel ? fieldLblSentence : fieldLbl}>{label}{required && <RequiredMark />}</label>}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commitDraft(draft)}
        placeholder={atCap ? `Limit reached${capLabel ? ` (${maxItems} ${capLabel}s)` : ''}. Remove one to add another` : placeholder}
        disabled={atCap}
        style={FONT}
        className={inputCls}
      />
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {visible.map((v, i) => (
            <span key={`${v}-${i}`} className={`inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1.5 text-[12px] font-semibold ${CHIP_TONE[tone].chip}`}>
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${v}`}
                className={`flex cursor-pointer items-center border-0 bg-transparent p-0 ${CHIP_TONE[tone].remove}`}
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </span>
          ))}
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="cursor-pointer rounded-full border border-dashed border-(--ad-line-strong) bg-transparent px-2.5 py-1 text-[12px] font-semibold text-(--ad-ink-soft) hover:text-(--ad-ink)"
            >
              {expanded ? 'Show fewer' : `+${hidden} more`}
            </button>
          )}
          {(overCap || collapsible) && (
            <button
              type="button"
              onClick={() => { onChange([]); setExpanded(false); }}
              className="cursor-pointer border-0 bg-transparent px-1 py-1 text-[12px] font-semibold text-(--ad-ink-faint) underline-offset-2 hover:text-(--ad-clay) hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}
      {/* At exactly the cap, say why the input went grey - not every screen
          pairs this with a LimitCounter. Over the cap, the screen's own
          LimitCounter / LimitMessages say how many to remove, so this stays
          quiet rather than repeating it. */}
      {values.length === maxItems ? (
        <p className="mt-1 text-[11px] text-(--ad-ink-faint)">
          You've reached the {maxItems}{capLabel ? ` ${capLabel}` : ''} limit. Remove one to add another.
        </p>
      ) : (
        helper && !atCap && <p className="mt-1 text-[11px] text-(--ad-ink-faint)">{helper}</p>
      )}
    </div>
  );
}
