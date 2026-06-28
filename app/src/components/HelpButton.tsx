import { useState } from 'react';
import { Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent text-[#c4bfb5] transition-all hover:border-[#ece8df] hover:bg-[#f5f2ec] hover:text-[#62655c]"
      >
        <Info size={14} strokeWidth={2.2} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              style={FONT}
              className="flex w-full flex-col overflow-hidden bg-white h-full md:h-auto md:max-h-[80vh] md:max-w-[460px] md:rounded-2xl md:shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#ece8df] px-5 py-4">
                <div className="flex items-center gap-2">
                  <Info size={15} className="shrink-0 text-[#3c7a5b]" />
                  <h2 className="m-0 text-[16px] font-bold text-[#20211c]">{content.title}</h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[22px] leading-none text-[#9a9d92] transition-colors hover:text-[#20211c]"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3">
                {content.body.map((item, i) =>
                  item.type === 'p' ? (
                    <p key={i} className="m-0 text-[14px] leading-relaxed text-[#62655c]">
                      {item.text}
                    </p>
                  ) : (
                    <ul key={i} className="m-0 flex flex-col gap-1.5 pl-5">
                      {(item.items ?? []).map((line, j) => (
                        <li key={j} className="text-[14px] leading-relaxed text-[#62655c]">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ),
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t border-[#ece8df] px-5 py-4">
                <button
                  onClick={() => setOpen(false)}
                  className="w-full cursor-pointer rounded-xl border-0 bg-[#3c7a5b] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#2d5e46]"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
