import { Link } from 'react-router-dom';
import { useState } from 'react';
import { GmailLogo } from './GmailLogo';
import { AlertCircle, ChevronDown, Info, Send } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useSendPacing } from '../hooks/useSendPacing';
import {
  sendingCopy, compactSendingLine, sendingDetails, FOLLOW_UP_EXPLAINER, type SendPacing,
} from '../lib/sendPacing';

// Every sentence comes from lib/sendPacing; these components only lay it out. Colours use the shared
// --ad-* tokens so the same panel works in the client app and in the admin shell (including dark mode).

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl border border-(--ad-green-line) bg-(--ad-green-tint) px-3.5 py-3 text-[14px] font-semibold leading-snug text-(--ad-ink)"
    >
      <AlertCircle size={16} strokeWidth={2} className="mt-px shrink-0 text-(--ad-green)" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      tabIndex={0}
      className="ml-1.5 inline-flex cursor-help align-middle text-(--ad-ink-soft)"
    >
      <Info size={14} strokeWidth={2} aria-hidden />
    </span>
  );
}

/** The full Sending card. Pure: give it a parsed response. */
export function SendingCardView({ pacing }: { pacing: SendPacing }) {
  const c = sendingCopy(pacing);
  return (
    <section
      aria-label="Sending"
      className="flex flex-col gap-3 rounded-2xl border border-(--ad-line) bg-(--ad-surface) p-5 text-(--ad-ink)"
    >
      <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
        <Send size={16} strokeWidth={2} className="text-(--ad-green)" aria-hidden />
        Sending
      </h2>

      {c.warnings.map((w) => <Warning key={w}>{w}</Warning>)}

      {c.today && <p className="m-0 text-[14px] leading-snug">{c.today}</p>}

      {c.warmup && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[14px] leading-snug text-(--ad-ink-soft)">{c.warmup.text}</p>
          {c.warmup.ladder.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px] text-(--ad-ink-soft)">
              {c.warmup.ladder.map((step) => <li key={step}>{step}</li>)}
            </ul>
          )}
        </div>
      )}

      {c.queue && (
        <p className="m-0 text-[14px] leading-snug">
          {c.queue.text}
          {c.queue.tooltip && <Hint text={c.queue.tooltip} />}
        </p>
      )}

      {c.followUps && <p className="m-0 text-[14px] leading-snug">{c.followUps}</p>}
      <p className="m-0 text-[13px] leading-snug text-(--ad-ink-soft)">{FOLLOW_UP_EXPLAINER}</p>

      {c.admin.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5 border-t border-(--ad-line) pt-3" data-testid="sending-admin">
          <span className="text-[12px] font-semibold text-(--ad-ink-soft)">Admin only</span>
          {c.admin.map((line) => <p key={line} className="m-0 text-[13px] leading-snug">{line}</p>)}
        </div>
      )}
    </section>
  );
}

/** The one-line version for the top of Approvals. Pure.
 *  compactSendingLine hands back one run-on string (several sentences joined
 *  with spaces, each already ending in a period) so the lib and its tests
 *  stay about the words, not the layout. Here we split it back into
 *  sentences and give the first one - the actual "X of Y sent today" fact -
 *  more visual weight than the warm-up/queue detail trailing it, so the one
 *  number someone actually needs doesn't read as equal to everything else. */
export function SendingLineView({ pacing, settingsHref }: { pacing: SendPacing; settingsHref?: string | null }) {
  // No Gmail: say so plainly, in warning colours, with the way to fix it. Approved emails
  // wait (they are not lost) and send by themselves once Gmail is reconnected.
  if (!pacing.mailbox_connected) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-(--ad-clay) bg-(--ad-clay-tint) px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--ad-line) bg-white">
            <GmailLogo size={18} />
          </span>
          <span className="flex flex-col gap-0.5 pt-0.5">
            <span className="text-[14.5px] font-bold leading-snug text-(--ad-ink)">Gmail isn't connected, so nothing can send.</span>
            <span className="text-[12.5px] leading-snug text-(--ad-ink-soft)">
              You can still approve. Approved emails wait here and send automatically once Gmail is connected again.
            </span>
          </span>
        </span>
        {settingsHref && (
          <Link
            to={settingsHref}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-(--ad-line) bg-white px-3.5 py-2 text-[13px] font-bold text-[#1f1f1f] no-underline hover:bg-[#f6f6f6]"
          >
            <GmailLogo size={16} /> Connect Gmail
          </Link>
        )}
      </div>
    );
  }
  return <SendingLineSummary pacing={pacing} />;
}

function SendingLineSummary({ pacing }: { pacing: SendPacing }) {
  const [open, setOpen] = useState(false);
  const { text, warning } = compactSendingLine(pacing);
  const sentences = text.split(/(?<=\.)\s+/).filter(Boolean);
  const [headline, ...rest] = sentences;
  const details = sendingDetails(pacing);
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-r-lg border-l-2 border-l-accent-foreground border border-(--ad-green-line) bg-(--ad-green-tint)/40 px-4 py-3.5"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--ad-green) text-white">
        {warning
          ? <AlertCircle size={15} strokeWidth={2.3} aria-hidden />
          : <Send size={14} strokeWidth={2.3} aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
        <span className="text-[14.5px] font-bold leading-snug text-(--ad-ink)">{headline}</span>
        {rest.length > 0 && <span className="text-[12.5px] leading-snug text-(--ad-ink-soft)">{rest.join(' ')}</span>}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-1 inline-flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-semibold text-(--ad-green) hover:underline"
        >
          {open ? 'Hide details' : 'How sending works'}
          <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <span className="mt-2 flex flex-col gap-2.5 border-t border-(--ad-green-line) pt-3 text-[12.5px] leading-relaxed text-(--ad-ink-soft)">
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-(--ad-ink-ghost)">Next email</span>
              <span className="text-[13px] font-semibold text-(--ad-ink)">{details.next}</span>
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-(--ad-ink-ghost)">The rules</span>
              <ul className="m-0 mt-0.5 flex list-disc flex-col gap-1 pl-4">
                {details.rules.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </span>
            {details.ladder.length > 0 && (
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-(--ad-ink-ghost)">Daily limit grows</span>
                <ul className="m-0 mt-0.5 flex list-disc flex-col gap-1 pl-4">
                  {details.ladder.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </span>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

interface ConnectedProps { clientId: string; client?: SupabaseClient }

// A failed or still-loading call renders nothing rather than an error box: the panel is an aid, and a
// pacing problem must never get in the way of approving emails.
export function SendingCard({ clientId, client = supabase }: ConnectedProps) {
  const { pacing } = useSendPacing(clientId, client);
  return pacing ? <SendingCardView pacing={pacing} /> : null;
}

export function SendingLine({ clientId, client = supabase, settingsHref }: ConnectedProps & { settingsHref?: string | null }) {
  const { pacing } = useSendPacing(clientId, client);
  return pacing ? <SendingLineView pacing={pacing} settingsHref={settingsHref} /> : null;
}
