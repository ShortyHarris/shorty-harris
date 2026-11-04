import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FlaskConical, Play, RotateCcw, MessageSquareReply, Ban } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast, ToastHost } from '../../components/Toast';
import {
  useSandbox, nextStepLabel, nextStepBlock, hasSent, sentCount, describeResult,
  type ReplyKind, type SandboxResult,
} from '../../hooks/useSandbox';

const FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const REPLY_OPTIONS: { kind: ReplyKind; label: string }[] = [
  { kind: 'interested', label: 'Interested' },
  { kind: 'not_interested', label: 'Not interested' },
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
  const { prospects, loading, error, reset, nextStep, simulateReply } = useSandbox(clientId, true, client);
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
            so emails can only reach you. <strong>Run next step</strong> moves one prospect forward
            without waiting for the schedule. <strong>Simulate reply</strong> fakes their answer.
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
            prospects and sets credits back to 10,000. Only this sandbox account is touched.
          </ConfirmDialog>
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
