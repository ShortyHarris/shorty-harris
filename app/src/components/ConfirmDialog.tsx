import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useOverlayClose } from '../hooks/useOverlayClose';
import { actionBtn } from '../lib/actionButtons';

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
      style={{ background: 'rgba(14, 8, 34, 0.45)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(busy ? () => {} : onCancel, { escape: true })}
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
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className={actionBtn('secondary', 'lg')}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={danger ? actionBtn('danger', 'lg') : actionBtn('primary', 'lg')}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
