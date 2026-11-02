import { useState } from 'react';
import { Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOverlayClose } from '../hooks/useOverlayClose';
import { ModalClose } from './ModalClose';

export interface HelpItem {
  type: 'p' | 'ul';
  text?: string;
  items?: string[];
}

export interface HelpContent {
  title: string;
  body: HelpItem[];
}

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

export function HelpButton({ content }: { content: HelpContent }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`About this page: ${content.title}`}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent text-(--ad-ink-ghost) transition-all hover:border-(--ad-line) hover:bg-(--ad-fill) hover:text-(--ad-ink-soft)"
      >
        <Info size={14} strokeWidth={2.2} />
      </button>

      <AnimatePresence>
        {open && <HelpDialog key="help" content={content} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

// Split out so useOverlayClose (and its Escape handling) is only live while the dialog is open.
function HelpDialog({ content, onClose }: { content: HelpContent; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-[rgba(14,8,34,0.45)] md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose, { escape: true })}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={content.title}
        style={FONT}
        className="modal-card flex w-full flex-col overflow-hidden bg-(--ad-surface) h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[420px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-(--ad-line) px-5 py-4">
          <div className="flex items-center gap-2">
            <Info size={15} className="shrink-0 text-(--ad-green)" aria-hidden />
            <h2 className="m-0 text-[16px] font-bold text-(--ad-ink)">{content.title}</h2>
          </div>
          <ModalClose onClick={onClose} />
        </div>

        <div className="modal-scroll flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3">
          {content.body.map((item, i) =>
            item.type === 'p' ? (
              <p key={i} className="m-0 text-[14px] leading-relaxed text-(--ad-ink-soft)">
                {item.text}
              </p>
            ) : (
              <ul key={i} className="m-0 flex flex-col gap-1.5 pl-5">
                {(item.items ?? []).map((line, j) => (
                  <li key={j} className="text-[14px] leading-relaxed text-(--ad-ink-soft)">
                    {line}
                  </li>
                ))}
              </ul>
            ),
          )}
        </div>

        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4">
          <button
            onClick={onClose}
            className="w-full cursor-pointer rounded-lg border-0 bg-(--ad-green) px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-(--ad-green-hover)"
          >
            Got it
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
