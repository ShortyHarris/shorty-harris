import { forwardRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, ChevronRight, ClipboardCheck, FlaskConical, PauseCircle, Send, Thermometer, Flame } from 'lucide-react';
import { GmailLogo } from '../../components/GmailLogo';
import { SendingDetailsDialog } from '../../components/SendingPanel';
import type { SendPacing } from '../../lib/sendPacing';
import type { StripIcon, StripState } from '../../lib/statusStrip';

/* The one full-width status strip above the client app. lib/statusStrip decides what it says; this
   only lays it out. Colour follows the message (warning / action / good), and a sandbox account gets
   a red SANDBOX tag plus a "Sandbox controls" button whatever the message is. */

function Icon({ icon }: { icon: StripIcon }) {
  const p = { size: 16, strokeWidth: 2, className: 'shrink-0', 'aria-hidden': true } as const;
  switch (icon) {
    case 'gmail': return <span className="cstrip-gmail"><GmailLogo size={13} /></span>;
    case 'pause': return <PauseCircle {...p} />;
    case 'alert': return <AlertCircle {...p} />;
    case 'approve': return <ClipboardCheck {...p} />;
    case 'check': return <CheckCircle2 {...p} />;
    case 'sandbox': return <FlaskConical {...p} />;
    default: return <Send {...p} />;
  }
}

/** 5 segments filling cool blue to warm orange; colours live in Shell.css (.cstrip-gauge i.s1-s5). */
export function WarmupGauge({ stage, stages, className = '' }: { stage: number; stages: number; className?: string }) {
  return (
    <span className={`cstrip-gauge ${className}`} role="img" aria-label={`Warm-up step ${stage} of ${stages}`}>
      {Array.from({ length: stages }, (_, i) => <i key={i} className={i < stage ? `s${i + 1}` : undefined} />)}
    </span>
  );
}

export const StatusStrip = forwardRef<HTMLDivElement, { state: StripState; pacing: SendPacing | null }>(
  function StatusStrip({ state, pacing }, ref) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const { message: m, sandbox } = state;
    const cta = m.cta;
    const chevron = <ChevronRight size={14} strokeWidth={2.5} aria-hidden />;

    return (
      <div
        ref={ref}
        role={m.tone === 'warning' ? 'alert' : 'status'}
        className={`cstrip cstrip-${m.tone}${sandbox ? ' is-sandbox' : ''}`}
        data-testid="status-strip"
      >
        {sandbox && <span className="cstrip-tag">Sandbox</span>}
        <span className="cstrip-msg">
          <Icon icon={m.icon} />
          <span className="cstrip-text">
            <span className="cstrip-long">
              <strong>{m.title}</strong>
              {m.detail && <span className="cstrip-detail"> {m.detail}</span>}
            </span>
            <span className="cstrip-short">{m.short}</span>
          </span>
        </span>
        {m.warmup && (
          <span className="cstrip-therm cstrip-long" data-testid="warmup-pill">
            {m.warmup.finished
              ? <Flame size={14} strokeWidth={2.2} aria-hidden />
              : <Thermometer size={14} strokeWidth={2.2} aria-hidden />}
            <strong>{m.warmup.title}</strong>
            <WarmupGauge stage={m.warmup.stage} stages={m.warmup.stages} />
            <span>{m.warmup.detail}</span>
          </span>
        )}
        <span className="cstrip-actions">
          {cta && cta.to === 'details' && pacing && (
            <button type="button" className="cstrip-cta" onClick={() => setDetailsOpen(true)} aria-haspopup="dialog">
              {cta.label}{chevron}
            </button>
          )}
          {cta && cta.to !== 'details' && (
            <Link to={cta.to} className="cstrip-cta">{cta.label}{chevron}</Link>
          )}
          {sandbox && (
            <Link to={sandbox.controlsHref} className="cstrip-cta cstrip-cta-sandbox" aria-label="Sandbox controls">
              <FlaskConical size={13} strokeWidth={2.2} aria-hidden />
              <span className="cstrip-long">Sandbox controls</span>
            </Link>
          )}
        </span>
        {pacing && createPortal(
          <AnimatePresence>
            {detailsOpen && <SendingDetailsDialog key="strip-details" pacing={pacing} onClose={() => setDetailsOpen(false)} />}
          </AnimatePresence>,
          document.body,
        )}
      </div>
    );
  },
);
