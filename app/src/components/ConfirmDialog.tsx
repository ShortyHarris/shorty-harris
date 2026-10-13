import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useOverlayClose } from '../hooks/useOverlayClose';

/* Small centred confirm modal. Render inside <AnimatePresence> so it animates out. */
export function ConfirmDialog({
  title, children, confirmLabel, cancelLabel = 'Cancel', danger = false, busy = false, onConfirm, onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      style={{ background: 'rgba(28, 30, 25, 0.45)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(busy ? () => {} : onCancel)}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[420px] rounded-md bg-(--ad-surface) p-5 shadow-2xl"
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 text-[16px] font-bold text-(--ad-ink)">{title}</h2>
        {children && <div className="mt-2 text-[13px] leading-relaxed text-(--ad-ink-soft)">{children}</div>}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="cursor-pointer rounded-xl border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:bg-(--ad-surface-2) disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`cursor-pointer rounded-xl px-4 py-2 text-[13px] font-bold transition-colors disabled:opacity-50 ${
              danger
                ? 'border border-(--ad-clay) bg-(--ad-clay) text-white hover:bg-(--ad-clay-hover)'
                : 'border-0 bg-(--ad-green) text-white hover:bg-(--ad-green-hover)'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
