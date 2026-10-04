import { Eye, X } from 'lucide-react';

export function ImpersonationBanner({
  businessName, onExit,
}: { businessName: string; onExit: () => void }) {
  return (
    <div
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      className="sticky inset-x-0 top-0 z-200 flex items-center justify-center gap-2.5 bg-[#1a1b17] px-4 py-2.5 text-[13px] text-white"
    >
      <Eye size={15} className="shrink-0 text-[#e8d5a8]" />
      <span>
        Viewing as <strong className="font-bold">{businessName}</strong> - read-only
      </span>
      <button
        onClick={onExit}
        className="ml-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/25 bg-transparent px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-white/10"
      >
        <X size={12} />
        Exit
      </button>
    </div>
  );
}
