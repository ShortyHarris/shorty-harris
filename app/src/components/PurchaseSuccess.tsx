import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Flame } from 'lucide-react';
import { useOverlayClose } from '../hooks/useOverlayClose';

/* Shown after credits are bought: on return from a paid Stripe checkout, and after a
   sandbox purchase. A short confetti burst (skipped for reduced-motion users), what was
   added and the new balance. Render inside <AnimatePresence> so it animates out. */

// Fixed colours so the burst looks the same in light and dark themes.
const CONFETTI_COLOURS = ['#7412ef', '#a66bff', '#f5b800', '#ff5c8a', '#2fbf71', '#ffffff'];
const PIECES = 46;

// Deterministic pseudo-random (mulberry32), so render stays pure while every piece
// still gets its own spread, spin and fall.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Confetti() {
  const pieces = useMemo(() => {
    const rnd = seeded(20261104);
    return Array.from({ length: PIECES }, (_, i) => ({
      id: i,
      left: rnd() * 100,
      drift: (rnd() - 0.5) * 220,
      rotate: (rnd() - 0.5) * 720,
      delay: rnd() * 0.25,
      duration: 1.6 + rnd() * 1.1,
      size: 6 + rnd() * 6,
      round: rnd() < 0.3,
      colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
    }));
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[101] overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            background: p.colour,
            borderRadius: p.round ? '50%' : 2,
          }}
          initial={{ y: -30, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: p.drift, rotate: p.rotate, opacity: [1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

export function PurchaseSuccess({
  creditsAdded, balance, sandbox = false, leadsHref, onClose,
}: {
  /** Credits just bought, when known. */
  creditsAdded: number | null;
  /** Current balance, or null while it is still loading. */
  balance: number | null;
  sandbox?: boolean;
  /** Where "Go to Hot Leads" points. */
  leadsHref: string;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <>
      {!reduceMotion && <Confetti />}
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center p-5"
        style={{ background: 'rgba(14, 8, 34, 0.45)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        {...useOverlayClose(onClose, { escape: true })}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="purchase-success-title"
          className="w-full max-w-[400px] rounded-xl bg-(--ad-surface) px-6 pb-6 pt-7 text-center shadow-2xl"
          initial={{ y: 16, scale: 0.96, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 8, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-(--ad-green-tint)"
            initial={reduceMotion ? false : { scale: 0.4 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 10, stiffness: 260, delay: 0.08 }}
          >
            <CheckCircle2 size={30} className="text-(--ad-green)" aria-hidden />
          </motion.div>

          <h2 id="purchase-success-title" className="m-0 text-[20px] font-extrabold tracking-tight text-(--ad-ink)">
            You're topped up!
          </h2>
          <p className="m-0 mt-1 text-[13.5px] text-(--ad-ink-soft)">
            {creditsAdded ? <>Payment received. <strong className="text-(--ad-ink)">+{creditsAdded} credits</strong> added.</> : 'Payment received. Your credits have been added.'}
          </p>

          <div className="mx-auto mt-4 rounded-lg bg-(--ad-surface-2) px-4 py-3">
            <div className="text-[28px] font-extrabold leading-none text-(--ad-green)">{balance ?? '…'}</div>
            <div className="mt-1 text-[12px] text-(--ad-ink-soft)">credits now available · 1 credit per hot lead</div>
          </div>

          {sandbox && (
            <p className="m-0 mt-3 text-[11.5px] text-(--ad-ink-faint)">Sandbox purchase: no card was charged.</p>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <Link
              to={leadsHref}
              onClick={onClose}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border-0 bg-(--ad-green) px-4 py-2.5 text-[13px] font-bold text-white no-underline transition-colors hover:bg-(--ad-green-hover)"
            >
              <Flame size={14} aria-hidden /> Go to Hot Leads
            </Link>
            <button
              onClick={onClose}
              className="flex-1 cursor-pointer rounded-lg border border-(--ad-line) bg-transparent px-4 py-2.5 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:bg-(--ad-surface-2)"
            >
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
