import { AlertCircle, Info, Send } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useSendPacing } from '../hooks/useSendPacing';
import {
  sendingCopy, compactSendingLine, FOLLOW_UP_EXPLAINER, type SendPacing,
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

/** The one-line version for the top of Approvals. Pure. */
export function SendingLineView({ pacing }: { pacing: SendPacing }) {
  const { text, warning } = compactSendingLine(pacing);
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] leading-snug text-(--ad-ink) ${
        warning ? 'border-(--ad-green-line) bg-(--ad-green-tint) font-semibold' : 'border-(--ad-line) bg-(--ad-surface)'
      }`}
    >
      {warning
        ? <AlertCircle size={15} strokeWidth={2} className="mt-px shrink-0 text-(--ad-green)" aria-hidden />
        : <Send size={15} strokeWidth={2} className="mt-px shrink-0 text-(--ad-green)" aria-hidden />}
      <span>{text}</span>
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

export function SendingLine({ clientId, client = supabase }: ConnectedProps) {
  const { pacing } = useSendPacing(clientId, client);
  return pacing ? <SendingLineView pacing={pacing} /> : null;
}
