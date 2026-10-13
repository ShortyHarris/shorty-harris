import { Plus } from 'lucide-react';

/* Phone-only floating "create" button. Shared so every screen gets the same
   size, safe-area offset and an icon (not a text "+", whose glyph sits off
   the optical centre). `offsetClass` lifts it above a bottom nav bar. */
export function MobileFab({
  onClick,
  label,
  colorClass = 'bg-(--ad-green) hover:bg-(--ad-green-hover)',
  offsetClass = 'bottom-[calc(20px+env(safe-area-inset-bottom,0px))]',
  disabled,
  title,
  ...rest
}: {
  onClick: () => void;
  label: string;
  colorClass?: string;
  offsetClass?: string;
  disabled?: boolean;
  title?: string;
  'data-tour'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={`fixed right-5 z-40 grid size-14 cursor-pointer place-items-center rounded-full border-0 p-0 text-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.15)] ring-1 ring-white/15 transition-[transform,background-color] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:hidden ${colorClass} ${offsetClass}`}
      {...rest}
    >
      <Plus size={26} strokeWidth={2.5} className="block" />
    </button>
  );
}
