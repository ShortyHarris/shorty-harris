import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTour } from './TourProvider';

const RING_PAD = 8;
const RING_RADIUS = 16;
const CARD_WIDTH = 300;
const CARD_HEIGHT_ESTIMATE = 170;
const GAP = 14;
const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 3000;
const DIM = 'rgba(20, 20, 18, 0.65)';

// Multiple elements can share the same data-tour value across breakpoints
// (e.g. a desktop button and a mobile FAB that does the same thing) — only
// one is ever actually on screen, so pick the first with a real size rather
// than always grabbing whichever comes first in the DOM.
function findVisibleTourElement(selector: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${selector}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

interface Highlight {
  stepId: string;
  rect: DOMRect;
}

export function TourOverlay() {
  const { active, currentStep, stepIndex, totalSteps, next, prev, skip } = useTour();
  const location = useLocation();
  // Tagged with the step it was found for, rather than cleared-then-refilled —
  // that way a stale rect from the previous step is simply ignored at render
  // time instead of needing a synchronous setState(null) at the top of the
  // effect below (which the exact-same-purpose Billing.tsx/Settings.tsx
  // effects elsewhere in this codebase already show is a real anti-pattern
  // here: react-hooks/set-state-in-effect flags it).
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  // Which step's poll has genuinely given up (as opposed to just still
  // searching) — tagged by step id for the same reason `highlight` is: no
  // synchronous setState-in-effect needed to "clear" it between steps.
  const [notFoundFor, setNotFoundFor] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !currentStep) return;
    if (location.pathname !== currentStep.path) return; // still navigating to this step's page

    let cancelled = false;
    let attempts = 0;

    function poll() {
      if (cancelled) return;
      const el = findVisibleTourElement(currentStep!.selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlight({ stepId: currentStep!.id, rect: el.getBoundingClientRect() });
        return;
      }
      attempts += 1;
      if (attempts * POLL_INTERVAL_MS >= POLL_TIMEOUT_MS) {
        // Element never showed up (e.g. an empty warm-prospects panel on a
        // brand-new account) — stop looking, leave the dim backdrop + card
        // up, and switch to the step's fallbackBody so it's clear why
        // nothing's highlighted instead of describing something invisible.
        // Advancing on its own here would read as the tour moving by itself
        // with no user input; Next/Back/Skip on the card handle that instead.
        setNotFoundFor(currentStep!.id);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    }
    poll();

    return () => { cancelled = true; };
  }, [active, currentStep, location.pathname]);

  // Keep the ring glued to its target through scrolling/resizing.
  useEffect(() => {
    if (!highlight || !currentStep) return;
    function reposition() {
      const el = findVisibleTourElement(currentStep!.selector);
      if (el) setHighlight({ stepId: currentStep!.id, rect: el.getBoundingClientRect() });
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [highlight, currentStep]);

  const rect = currentStep && highlight?.stepId === currentStep.id ? highlight.rect : null;
  const gaveUp = currentStep && notFoundFor === currentStep.id;
  const bodyText = gaveUp ? (currentStep!.fallbackBody ?? currentStep!.body) : currentStep?.body;

  // Block every click outside the highlighted element and the card itself.
  // Checked via DOM ancestry (closest()) rather than comparing click
  // coordinates against a measured/estimated rect — coordinate math has to
  // stay in sync with the card's real (variable-height, text-dependent) size
  // and position, and any drift there silently blocks clicks on the card's
  // own buttons. Asking "is this click inside the card/target element" is
  // correct regardless of size, position, or animation timing.
  useEffect(() => {
    if (!active || !currentStep) return;
    function blockOutsideClicks(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const insideCard = target.closest('[data-tour-card]') != null;
      const insideHighlighted = target.closest(`[data-tour="${currentStep!.selector}"]`) != null;
      if (!insideCard && !insideHighlighted) {
        e.stopPropagation();
        e.preventDefault();
      }
    }
    window.addEventListener('click', blockOutsideClicks, true);
    return () => window.removeEventListener('click', blockOutsideClicks, true);
  }, [active, currentStep]);

  // active+currentStep but no rect yet (mid-navigation, or still polling for
  // the target on the same page) — keep the dim backdrop and card up rather
  // than rendering nothing, so a same-page step change never reads as "the
  // tour just vanished" while its element is still being found.
  if (!active || !currentStep) return null;

  const placeAbove = rect ? rect.bottom + GAP + CARD_HEIGHT_ESTIMATE > window.innerHeight : false;
  const cardTop = rect
    ? (placeAbove ? rect.top - CARD_HEIGHT_ESTIMATE - GAP : rect.bottom + GAP)
    : window.innerHeight / 2 - CARD_HEIGHT_ESTIMATE / 2;
  const cardLeft = rect
    ? Math.min(Math.max(rect.left, 12), window.innerWidth - CARD_WIDTH - 12)
    : window.innerWidth / 2 - CARD_WIDTH / 2;

  return (
    <AnimatePresence>
      {rect ? (
        <motion.div
          key={`${currentStep.id}-ring`}
          className="fixed pointer-events-none z-70"
          style={{
            top: rect.top - RING_PAD,
            left: rect.left - RING_PAD,
            width: rect.width + RING_PAD * 2,
            height: rect.height + RING_PAD * 2,
            borderRadius: RING_RADIUS,
            border: '2px solid var(--leaf)',
            // The 9999px spread is the standard spotlight trick: it fills the
            // rest of the viewport with the dim color, leaving only this
            // box's own (rounded) area see-through — correctly rounded by
            // construction, since it's this element's own border-radius.
            boxShadow: `0 0 0 4px rgba(60, 122, 91, 0.18), 0 0 0 9999px ${DIM}`,
          }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        />
      ) : (
        <motion.div
          key="tour-dim-fallback"
          className="fixed inset-0 pointer-events-none z-70"
          style={{ background: DIM }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      )}
      <motion.div
        key={`${currentStep.id}-card`}
        data-tour-card
        className="fixed z-70 flex flex-col gap-2.5 rounded-2xl border p-4 shadow-2xl"
        style={{
          top: cardTop,
          left: cardLeft,
          width: CARD_WIDTH,
          borderColor: 'var(--line)',
          background: 'var(--surface)',
        }}
        initial={{ opacity: 0, y: placeAbove ? 8 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[.06em]" style={{ color: 'var(--ink-faint)' }}>
            Step {stepIndex + 1} of {totalSteps}
          </span>
          <button
            onClick={skip}
            className="cursor-pointer border-0 bg-transparent text-[12px] font-semibold"
            style={{ color: 'var(--ink-faint)' }}
          >
            Skip tour
          </button>
        </div>
        <h3 className="m-0 text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{currentStep.title}</h3>
        <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{bodyText}</p>
        <div className="mt-1 flex items-center justify-end gap-2">
          {stepIndex > 0 && (
            <button
              onClick={prev}
              className="cursor-pointer rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold"
              style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-soft)', background: 'transparent' }}
            >
              Back
            </button>
          )}
          <button
            onClick={next}
            className="cursor-pointer rounded-lg border-0 px-3.5 py-1.5 text-[12.5px] font-bold text-white"
            style={{ background: 'var(--leaf)' }}
          >
            {stepIndex >= totalSteps - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
