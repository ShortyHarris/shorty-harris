import { useEffect, useRef } from 'react';
import { Eye, Pencil, X } from 'lucide-react';

// Fixed colours rather than --ad-* tokens: the admin dark theme flips
// --ad-black to a light value, which would put white text on a light bar.
// Edit mode is dark amber so it's unmistakable that changes are live.
const VIEW_BG = '#0e0822';
const EDIT_BG = '#5b0fc2';

export function ImpersonationBanner({
  businessName, editMode, onToggleEdit, onExit,
}: {
  businessName: string;
  editMode: boolean;
  onToggleEdit: () => void;
  onExit: () => void;
}) {
  // Publish the banner's height (it wraps on phones) so fixed UI like toasts
  // can sit below it rather than underneath.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty('--impersonation-banner-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--impersonation-banner-h'); };
  }, []);

  const btnCls ='inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-white/30 bg-transparent px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-white/10';

  return (
    <div
      ref={ref}
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", background: editMode ? EDIT_BG : VIEW_BG }}
      className="sticky inset-x-0 top-0 z-200 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 px-4 py-2.5 text-[13px] text-white"
    >
      {editMode
        ? <Pencil size={15} className="shrink-0" aria-hidden />
        : <Eye size={15} className="shrink-0 text-(--ad-amber-line)" aria-hidden />}
      <span className="text-center">
        {editMode
          ? <>Editing <strong className="font-semibold">{businessName}</strong> as admin - changes are live</>
          : <>Viewing as <strong className="font-semibold">{businessName}</strong> - read-only</>}
      </span>
      <button onClick={onToggleEdit} className={btnCls}>
        {editMode ? <><Eye size={12} aria-hidden /> Back to view only</> : <><Pencil size={12} aria-hidden /> Edit as admin</>}
      </button>
      <button onClick={onExit} className={btnCls}>
        <X size={12} aria-hidden />
        Exit
      </button>
    </div>
  );
}
