import { X } from 'lucide-react';

/* The one close button for every client pop-up: a 36px round target, easy to hit on a phone. */
export function ModalClose({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-(--ad-surface-2) text-(--ad-ink-soft) transition-colors hover:bg-(--ad-line) hover:text-(--ad-ink)"
    >
      <X size={18} strokeWidth={2} aria-hidden />
    </button>
  );
}
