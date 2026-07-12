import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MenuItem =
  | { type: 'action'; label: string; onClick: () => void; destructive?: boolean; dot?: string; checked?: boolean; disabled?: boolean; title?: string }
  | { type: 'separator' }
  | { type: 'header'; label: string };

const MARGIN = 8;

export function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ left: 0, top: undefined as number | undefined, bottom: undefined as number | undefined, maxHeight: 320 });
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!btnRef.current) return;
    const rect  = btnRef.current.getBoundingClientRect();
    const menuW = 192;
    // right-align to button, clamped within the viewport
    const left = Math.max(MARGIN, Math.min(rect.right - menuW, window.innerWidth - menuW - MARGIN));

    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    // prefer opening below; flip above only when below is cramped and above has more room
    const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;

    if (openAbove) {
      setPos({ left, top: undefined, bottom: window.innerHeight - rect.top + 4, maxHeight: Math.max(120, spaceAbove) });
    } else {
      setPos({ left, top: rect.bottom + 4, bottom: undefined, maxHeight: Math.max(120, spaceBelow) });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    function onDown(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        aria-label="Row actions"
        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border text-[17px] leading-none transition-all ${
          open
            ? 'border-[#ddd8cb] bg-[#f5f2ec] text-[#20211c]'
            : 'border-transparent bg-transparent text-[#c4bfb5] hover:border-[#ece8df] hover:bg-[#f5f2ec] hover:text-[#62655c]'
        }`}
      >
        ⋮
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            maxHeight: pos.maxHeight,
            zIndex: 9999,
          }}
          className="w-48 overflow-y-auto overscroll-contain rounded-xl border border-[#ece8df] bg-white py-1 shadow-[0_8px_28px_rgba(0,0,0,0.12)]"
        >
          {items.map((item, i) => {
            if (item.type === 'separator') {
              return <hr key={i} className="my-1 border-[#f5f2ec]" />;
            }
            if (item.type === 'header') {
              return (
                <div key={i} className="px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[.07em] text-[#c4bfb5]">
                  {item.label}
                </div>
              );
            }
            return (
              <button
                key={i}
                disabled={item.disabled}
                title={item.title}
                onClick={(e) => { e.stopPropagation(); item.onClick(); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                } ${
                  item.destructive
                    ? 'text-[#a8533a] hover:bg-[#fdf0ec]'
                    : 'text-[#20211c] hover:bg-[#fbf9f5]'
                }`}
              >
                {item.dot !== undefined && (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.dot }} />
                )}
                <span className="flex-1">{item.label}</span>
                {item.checked && <span className="text-[11px] text-[#3c7a5b]">✓</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
