import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, TriangleAlert, X } from 'lucide-react';

export type ToastKind = 'success' | 'warning' | 'error';
export interface ToastItem { id: number; kind: ToastKind; message: string; }

const KIND_STYLE: Record<ToastKind, { icon: React.ElementType; iconColor: string; iconBg: string }> = {
  success: { icon: CheckCircle2, iconColor: '#3c7a5b', iconBg: '#edf4ef' },
  warning: { icon: TriangleAlert, iconColor: '#b9831f', iconBg: '#f8efdb' },
  error:   { icon: TriangleAlert, iconColor: '#a8533a', iconBg: '#f6e8e2' },
};

/* Self-contained toast state — no provider needed. A screen calls useToast(),
   renders <ToastHost toasts={toasts} onDismiss={dismiss} /> once, then fires
   toast('message') wherever it previously showed a one-off success banner. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  return { toasts, toast, dismiss };
}

export function ToastHost({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      className="pointer-events-none fixed top-4 inset-x-4 z-110 flex flex-col items-center gap-2 md:inset-x-auto md:right-4 md:items-end"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const { icon: Icon, iconColor, iconBg } = KIND_STYLE[t.kind];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto flex w-full max-w-[380px] items-start gap-2.5 rounded-xl border border-[#ece8df] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(20,20,15,0.14)]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: iconBg }}>
                <Icon size={15} strokeWidth={2.2} style={{ color: iconColor }} />
              </span>
              <span className="flex-1 pt-0.5 text-[13px] leading-snug text-[#20211c]">{t.message}</span>
              <button
                onClick={() => onDismiss(t.id)}
                className="cursor-pointer shrink-0 border-0 bg-transparent p-0.5 text-[#c4bfb5] transition-colors hover:text-[#62655c]"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
