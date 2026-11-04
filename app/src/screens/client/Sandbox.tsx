import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FlaskConical, Play, RotateCcw, MessageSquareReply, Ban, Clock, Gauge } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast, ToastHost } from '../../components/Toast';
import { useSendPacing } from '../../hooks/useSendPacing';
import {
  useSandbox, nextStepLabel, nextStepBlock, hasSent, sentCount, describeResult,
  type ReplyKind, type SandboxResult,
} from '../../hooks/useSandbox';

const FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const REPLY_OPTIONS: { kind: ReplyKind; label: string }[] = [
  { kind: 'interested', label: 'Interested' },
  { kind: 'question', label: 'Question' },
  { kind: 'not_interested', label: 'Not interested' },
  { kind: 'unsubscribe', label: 'Unsubscribe' },
  { kind: 'auto_reply', label: 'Out of office' },
  { kind: 'bounce', label: 'Bounce' },
];

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  generating: 'Writing…',
  message_pending: 'Draft waiting',
  contacted: 'Contacted',
  replied: 'Replied',
  hot_lead: 'Hot lead',
  bounced: 'Bounced',
  won: 'Won',
  lost: 'Lost',
  generation_failed: 'Writing failed',
};

const btn =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45';

export function Sandbox({
  clientId, client = supabase, readOnly = false, basePath = '/app',
}: {
  clientId: string;
  client?: SupabaseClient;
  readOnly?: boolean;
  basePath?: string;
}) {
  const { prospects, daysAdvanced, warmupOn, loading, error, reset, advanceTime, setWarmup, nextStep, simulateReply } = useSandbox(clientId, true, client);
  // Today's warm-up limit and day, from the same send_pacing the Approvals Sending panel uses.
  const { pacing } = useSendPacing(clientId, client);
  const { toasts, toast, dismiss } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [replyKind, setReplyKind] = useState<Record<string, ReplyKind>>({});

  async function run(key: string, action: () => Promise<SandboxResult>) {
    setBusy(key);
    try {
      const r = await action();
      toast(describeResult(r), r.ok ? 'success' : 'warning');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={FONT} className="flex flex-col gap-6 content">
      <header className="page-header flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[26px] font-extrabold tracking-tight text-(--ad-ink)">
            <FlaskConical size={22} aria-hidden /> Sandbox controls
          </h1>
          <p className="m-0 mt-1 max-w-[640px] text-[13px] leading-relaxed text-(--ad-ink-soft)">
            Every test prospect is addressed to the mailbox connected in{' '}
            <Link to={`${basePath}/settings`} className="font-semibold text-(--ad-green)">Settings</Link>,
            so emails can only reach you. <strong>Run next step</strong> moves one prospect forward,
            <strong> Simulate reply</strong> fakes their answer, and <strong>Advance time</strong> moves the whole
            account forward so follow-ups, reminders and overdue approvals happen without waiting.
          </p>
        </div>
        <button
          onClick={() => setConfirmReset(true)}
          disabled={readOnly || busy !== null}
          className={`${btn} shrink-0 border border-(--ad-clay) bg-transparent text-(--ad-clay) hover:bg-(--ad-clay-tint)`}
        >
          <RotateCcw size={14} aria-hidden /> Reset sandbox
        </button>
      </header>

      {/* Time travel: shifts the account's whole timeline, so production's own rules
          (3/5/7 business days, approval reminders, recalculation) run unmodified. */}
      <section className="flex flex-col gap-3 rounded-lg border border-(--ad-line) bg-(--ad-surface) px-4 py-3.5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Clock size={18} className="mt-0.5 shrink-0 text-(--ad-green)" aria-hidden />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-(--ad-ink)">
              Sandbox clock: {daysAdvanced === 0 ? 'today' : `${daysAdvanced} day${daysAdvanced === 1 ? '' : 's'} ahead`}
            </div>
            <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-(--ad-ink-soft)">
              Moves every send, draft and schedule on this account back in time. The real follow-up rules then apply:
              leave a draft unapproved and advance 10 days to test an overdue approval. Reset puts the clock back.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {[1, 3, 7].map((d) => (
            <button
              key={d}
              onClick={() => run(`advance-${d}`, () => advanceTime(d))}
              disabled={readOnly || busy !== null}
              className={`${btn} border border-(--ad-line) bg-transparent whitespace-nowrap text-(--ad-ink) hover:bg-(--ad-surface-2)`}
            >
              {busy === `advance-${d}` ? 'Working…' : `+${d} day${d === 1 ? '' : 's'}`}
            </button>
          ))}
        </div>
      </section>

      {/* Warm-up: real daily limits that step up with the sandbox clock, or fast mode. */}
      <section className="flex flex-col gap-3 rounded-lg border border-(--ad-line) bg-(--ad-surface) px-4 py-3.5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Gauge size={18} className="mt-0.5 shrink-0 text-(--ad-green)" aria-hidden />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-(--ad-ink)">
              Mailbox warm-up: {warmupOn ? 'on' : 'off (fast testing)'}
              {pacing && (
                <span className="font-normal text-(--ad-ink-soft)">
                  {' '}· {pacing.today.sent} of {pacing.today.cap} sent today
                  {warmupOn && pacing.warmup.active ? ` · warm-up day ${pacing.warmup.day}` : ''}
                </span>
              )}
            </div>
            <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-(--ad-ink-soft)">
              {warmupOn
                ? 'Real limits, as for a new customer mailbox: 5 a day in week 1, then 10, 20, 30 and 40, spaced out through the day. Advance the clock to watch it step up.'
                : 'Up to 100 emails a day with no spacing, for quick testing. Switch warm-up on to test the real limits.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => run('warmup', () => setWarmup(!warmupOn))}
          disabled={readOnly || busy !== null}
          className={`${btn} shrink-0 border border-(--ad-line) bg-transparent whitespace-nowrap text-(--ad-ink) hover:bg-(--ad-surface-2)`}
        >
          {busy === 'warmup' ? 'Working…' : warmupOn ? 'Switch to fast mode' : 'Switch warm-up on'}
        </button>
      </section>

      {readOnly && (
        <p className="m-0 rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-4 py-3 text-[13px] text-(--ad-ink-soft)">
          View only. Switch to edit mode to use the sandbox buttons.
        </p>
      )}

      {error && <p className="m-0 text-[13px] text-(--ad-clay)">{error}</p>}

      {!loading && prospects.length === 0 && (
        <div className="rounded-lg border border-dashed border-(--ad-line) px-5 py-8 text-center text-[13px] text-(--ad-ink-soft)">
          No test prospects yet. Connect a Gmail account in Settings, then press <strong>Reset sandbox</strong> to
          create 20 of them.
        </div>
      )}

      {prospects.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-(--ad-line)">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-(--ad-surface-2) text-left text-[11.5px] uppercase tracking-wide text-(--ad-ink-soft)">
                <th className="px-4 py-2.5 font-semibold">Prospect</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Sent</th>
                <th className="px-4 py-2.5 font-semibold">Next step</th>
                <th className="px-4 py-2.5 font-semibold">Simulate reply</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => {
                const label = nextStepLabel(p);
                const block = nextStepBlock(p);
                const kind = replyKind[p.id] ?? 'interested';
                const canReply = hasSent(p);
                return (
                  <tr key={p.id} className="border-t border-(--ad-line) align-middle">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-(--ad-ink)">{p.business_name}</div>
                      <div className="text-[12px] text-(--ad-ink-soft)">{p.email}</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-(--ad-ink)">
                      {STATUS_LABEL[p.pipeline_status] ?? p.pipeline_status}
                    </td>
                    <td className="px-4 py-2.5 text-(--ad-ink)">{sentCount(p)}</td>
                    <td className="px-4 py-2.5">
                      {block ? (
                        // Not a disabled button: a greyed button reads as "try again later",
                        // while this is a rule. Say what it is, with the reason on hover.
                        <span title={block.reason} className="inline-flex max-w-[220px] cursor-help flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-(--ad-ink)">
                            <Ban size={12} aria-hidden /> {block.label}
                          </span>
                          <span className="text-[11.5px] leading-snug text-(--ad-ink-soft)">{block.reason}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => run(`next-${p.id}`, () => nextStep(p.id))}
                          disabled={readOnly || busy !== null || label === null}
                          className={`${btn} border-0 bg-(--ad-green) whitespace-nowrap text-white hover:bg-(--ad-green-hover)`}
                        >
                          <Play size={12} aria-hidden />
                          {busy === `next-${p.id}` ? 'Working…' : (label ?? 'Run next step')}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Reply type for ${p.business_name}`}
                          value={kind}
                          onChange={(e) => setReplyKind((s) => ({ ...s, [p.id]: e.target.value as ReplyKind }))}
                          disabled={readOnly || !canReply}
                          style={FONT}
                          className="rounded-lg border border-(--ad-line) bg-(--ad-surface) px-2 py-1.5 text-[12.5px] text-(--ad-ink) disabled:opacity-45"
                        >
                          {REPLY_OPTIONS.map((o) => <option key={o.kind} value={o.kind}>{o.label}</option>)}
                        </select>
                        <button
                          onClick={() => run(`reply-${p.id}`, () => simulateReply(p.id, kind))}
                          disabled={readOnly || busy !== null || !canReply}
                          title={canReply ? undefined : 'Send an email first'}
                          className={`${btn} border border-(--ad-line) bg-transparent whitespace-nowrap text-(--ad-ink) hover:bg-(--ad-surface-2)`}
                        >
                          <MessageSquareReply size={12} aria-hidden />
                          {busy === `reply-${p.id}` ? 'Working…' : 'Reply'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {confirmReset && (
          <ConfirmDialog
            key="confirm-sandbox-reset"
            title="Reset the sandbox?"
            confirmLabel="Reset"
            danger
            busy={busy === 'reset'}
            onConfirm={async () => {
              await run('reset', reset);
              setConfirmReset(false);
            }}
            onCancel={() => setConfirmReset(false)}
          >
            Deletes every test prospect, email, reply and hot lead on this sandbox account, then creates 20 fresh
            prospects, sets credits back to 10,000 and the clock back to today. Only this sandbox account is touched.
          </ConfirmDialog>
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
