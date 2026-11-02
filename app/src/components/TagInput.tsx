import { useState, type KeyboardEvent } from 'react';
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
}: {
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
  const atCap = maxItems != null && values.length >= maxItems;

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
        placeholder={atCap ? `Limit reached. Remove one to add another` : placeholder}
        disabled={atCap}
        style={FONT}
        className={inputCls}
      />
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span key={`${v}-${i}`} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${CHIP_TONE[tone].chip}`}>
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${v}`}
                className={`cursor-pointer border-0 bg-transparent p-0 text-[13px] leading-none ${CHIP_TONE[tone].remove}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {atCap ? (
        <p className="mt-1 text-[11px] text-(--ad-amber)">
          You've reached the {maxItems}{capLabel ? ` ${capLabel}` : ''} limit. Remove one to add another.
        </p>
      ) : (
        helper && <p className="mt-1 text-[11px] text-(--ad-ink-faint)">{helper}</p>
      )}
    </div>
  );
}
