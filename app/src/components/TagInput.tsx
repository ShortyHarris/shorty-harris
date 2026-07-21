import { useState, type KeyboardEvent } from 'react';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

/* Tag input — type + Enter (or the separator key, or clicking away) adds
   removable chips. `splitOn` also lets a single paste/typed string like
   "restaurants, cafes, hotels" become three chips at once. Each chip is
   its own array entry — this is what keeps a multi-value field (locations,
   search terms) from ever collapsing into one joined string on save. */
export function TagInput({
  label, placeholder, helper, values, onChange, splitOn = ',',
}: {
  label: string;
  placeholder: string;
  helper?: string;
  values: string[];
  onChange: (v: string[]) => void;
  splitOn?: string;
}) {
  const [draft, setDraft] = useState('');

  function commitDraft(raw: string) {
    const parts = raw.split(splitOn).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) { setDraft(''); return; }
    const next = [...values];
    for (const p of parts) if (!next.includes(p)) next.push(p);
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
      <label className={fieldLbl}>{label}</label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commitDraft(draft)}
        placeholder={placeholder}
        style={FONT}
        className={inputCls}
      />
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span key={`${v}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#edf4ef] px-2.5 py-1 text-[12px] font-semibold text-[#3c7a5b]">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${v}`}
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] leading-none text-[#3c7a5b]/60 hover:text-[#3c7a5b]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {helper && <p className="mt-1 text-[11px] text-[#9a9d92]">{helper}</p>}
    </div>
  );
}
