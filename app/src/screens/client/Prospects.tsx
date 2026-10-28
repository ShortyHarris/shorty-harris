import { btn } from '../../lib/clientButtons';
import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  useClientPipeline, setProspectNote, useProspectSequence, PIPELINE_PAGE_SIZE,
  type PipelineRow, type SequenceStep, type SequenceStepState, type StoppedBecause,
} from '../../hooks/useClientPipeline';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { SkeletonTable } from '../../components/Skeleton';
import { Search, StickyNote, ClipboardCheck, Flame, ChevronDown, ChevronUp, Pencil, Pause, Play, X, Mail, Phone, Globe } from 'lucide-react';
import {
  PIPELINE_STATUS_LABEL, PIPELINE_STATUS_PILL, SEQUENCE_STATUS_LABEL, SEQUENCE_STATUS_PILL,
  SEQUENCE_STATUS_ORDER, SEQUENCE_STATUS_PANEL_LABEL, SEQUENCE_FILTER_PREFIX, isSequenceStatus,
} from '../../lib/pipelineStatus';
import { StatusPill, PILL, type StatusPillStyle } from '../../components/StatusPill';
import { useAuth } from '../../auth/AuthProvider';
import { useGmailConnection } from '../../hooks/useGmailConnection';
import { useToast, ToastHost } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { intentStyle } from '../../lib/replyIntents';
import {
  approveSequences, approveOneEmail, saveStepEdit, setSequencePaused, cancelUnsentSequence, resolveUncertainReply, stopFollowups,
} from '../../hooks/useSequenceActions';
import './Dashboard.css';

const HELP: HelpContent = {
  title: 'Prospects',
  body: [
    { type: 'p', text: "Every business we've found for you, and exactly where each one stands — written, sent, replied, or waiting on something." },
    { type: 'p', text: "Open a prospect to see the full sequence of emails planned for them, including anything already sent." },
  ],
};

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

// Plain-language status copy lives in ../../lib/pipelineStatus so every
// screen shows the same wording for the same raw pipeline_status value.
const STATUS_LABEL = PIPELINE_STATUS_LABEL;
const STATUS_PILL = PIPELINE_STATUS_PILL;

// Order to show filter tabs in, when present in counts_by_status.
const STATUS_TAB_ORDER = ['new', 'message_pending', 'contacted', 'replied', 'hot_lead', 'bounced', 'won', 'lost', 'generation_failed'];

function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

function debounce<F extends (...args: never[]) => void>(fn: F, ms: number): F {
  let t: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<F>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as F;
}

export function Prospects({
  clientId, client = supabase, readOnly = false, basePath = '/app',
}: { clientId: string; client?: SupabaseClient; readOnly?: boolean; basePath?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [openProspectId, setOpenProspectId] = useState<string | null>(null);
  const { toasts, toast, dismiss } = useToast();

  const { result, loading, isFetching, error, reload } = useClientPipeline(
    clientId, { status, search, offset }, client,
  );

  const debouncedSetSearch = useRef(debounce((v: string) => { setSearch(v); setOffset(0); }, 350)).current;

  function onSearchChange(v: string) {
    setSearchInput(v);
    debouncedSetSearch(v);
  }

  function selectStatus(s: string | null) {
    setStatus(s);
    setOffset(0);
  }

  const totalAll = Object.values(result.counts_by_status).reduce((a, b) => a + b, 0);
  const tabs = [
    { key: null as string | null, label: 'All', count: totalAll },
    ...STATUS_TAB_ORDER
      .filter((k) => result.counts_by_status[k] > 0)
      .map((k) => ({ key: k as string | null, label: STATUS_LABEL[k] ?? k, count: result.counts_by_status[k] })),
    ...SEQUENCE_STATUS_ORDER
      .filter((k) => (result.counts_by_sequence_status[k] ?? 0) > 0)
      .map((k) => ({
        key: `${SEQUENCE_FILTER_PREFIX}${k}` as string | null,
        label: SEQUENCE_STATUS_LABEL[k],
        count: result.counts_by_sequence_status[k] ?? 0,
      })),
  ];

  const page = Math.floor(offset / PIPELINE_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(result.total / PIPELINE_PAGE_SIZE));

  return (
    <div style={FONT} className="flex flex-col gap-6 content">
      <header className="page-header flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-[#0e0822]">Prospects</h1>
          <p className="m-0 mt-1 text-[13px] text-[#605978]">{result.total} prospect{result.total !== 1 ? 's' : ''}</p>
        </div>
        <HelpButton content={HELP} />
      </header>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#605978]" />
        <input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by business, email, or contact"
          style={FONT}
          className="w-full rounded-lg border border-[#e8e3f7] bg-[#f9f6ff] py-2 pl-9 pr-3 text-[13px] text-[#0e0822] outline-none placeholder:text-[#8f8aa8] transition-colors focus:border-[#7412ef] focus:bg-white"
        />
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {tabs.map((t) => {
          const active = status === t.key;
          return (
            <button
              key={t.key ?? 'all'}
              onClick={() => selectStatus(t.key)}
              className={`shrink-0 cursor-pointer inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-all ${
                active
                  ? 'bg-[#f1e9ff] border-transparent text-[#7412ef] font-semibold'
                  : 'bg-white border-[#cfc9e8] text-[#605978] font-semibold hover:border-[#7412ef]'
              }`}
            >
              {t.label}
              <span className={`inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10.5px] font-semibold ${
                active ? 'bg-[#7412ef]/10 text-[#7412ef]' : 'bg-[#f9f6ff] text-[#605978]'
              }`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-[#0e0822]/20 bg-[#f9f6ff] px-4 py-3 text-[13px] text-[#0e0822]">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={8} cols={4} />
      ) : result.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#e8e3f7] bg-white p-10 text-center">
          <strong className="text-[15px] font-semibold text-[#0e0822]">No prospects found.</strong>
          {search && <span className="text-[13px] text-[#605978]">Try a different search.</span>}
        </div>
      ) : (
        <>
          <div className="atbl" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            <table className="table-fixed">
              <colgroup>
                <col className="w-[36%]" />
                <col className="w-[24%]" />
                <col className="w-[30%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr>
                  {['Business', 'Status', 'Activity', 'Note'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <ProspectRow
                    key={row.prospect_id}
                    row={row}
                    readOnly={readOnly}
                    basePath={basePath}
                    onOpen={() => setOpenProspectId(row.prospect_id)}
                    onNoteSaved={reload}
                    onNoteError={(msg) => toast(msg, 'error')}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-[#e8e3f7] bg-white px-4 py-3 text-[12.5px] text-[#605978]">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((o) => Math.max(0, o - PIPELINE_PAGE_SIZE))}
                  disabled={offset <= 0}
                  className={btn('secondary', 'md')}
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset((o) => o + PIPELINE_PAGE_SIZE)}
                  disabled={page >= totalPages}
                  className={btn('secondary', 'md')}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {openProspectId && (
          <SequencePanel
            key={openProspectId}
            prospectId={openProspectId}
            row={result.rows.find((r) => r.prospect_id === openProspectId) ?? null}
            clientId={clientId}
            readOnly={readOnly}
            client={client}
            basePath={basePath}
            onClose={() => setOpenProspectId(null)}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function ProspectRow({
  row, readOnly, basePath, onOpen, onNoteSaved, onNoteError,
}: {
  row: PipelineRow; readOnly: boolean; basePath: string; onOpen: () => void; onNoteSaved: () => void; onNoteError: (msg: string) => void;
}) {
  const seq = isSequenceStatus(row.sequence_status) ? row.sequence_status : null;
  const pill = seq
    ? SEQUENCE_STATUS_PILL[seq]
    : STATUS_PILL[row.pipeline_status] ?? { bg: '#f9f6ff', text: '#605978' };
  const statusLabel = seq ? SEQUENCE_STATUS_LABEL[seq] : STATUS_LABEL[row.pipeline_status] ?? row.pipeline_status;
  const awaitingInStatus = row.awaiting_approval > 0 && !seq;
  const lastActivity = row.last_reply_at && (!row.last_sent_at || row.last_reply_at > row.last_sent_at)
    ? { label: 'Replied', date: row.last_reply_at }
    : row.last_sent_at
      ? { label: 'Sent', date: row.last_sent_at }
      : null;

  return (
    <tr>
      <td className="min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="truncate font-semibold text-[#0e0822]" title={row.business_name}>{row.business_name}</div>
        {(row.category || row.location) && (
          <div className="truncate text-[12px] text-[#605978]">
            {[row.category, row.location].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {row.suppressed && !seq && (
            <span className="inline-flex items-center rounded-full border border-[#cfc9e8] px-2 py-0.5 text-[10.5px] font-semibold text-[#605978]">
              Unsubscribed
            </span>
          )}
          {row.followups_stopped && (
            <span className="inline-flex items-center rounded-full bg-[#f9f6ff] px-2 py-0.5 text-[10.5px] font-semibold text-[#0e0822]">
              Follow-ups stopped
            </span>
          )}
          {row.sequence_paused && !row.followups_stopped && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#f1e9ff] px-2 py-0.5 text-[10.5px] font-semibold text-[#7412ef]">
              <Pause size={10} /> Paused
            </span>
          )}
          {row.awaiting_approval > 0 && seq && (
            <Link
              to={`${basePath}/approvals`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full bg-[#f1e9ff] px-2 py-0.5 text-[10.5px] font-semibold text-[#7412ef] no-underline hover:bg-[#f1e9ff]"
            >
              <ClipboardCheck size={10} /> {row.awaiting_approval} awaiting approval
            </Link>
          )}
          {row.hot_lead_status && (
            <Link
              to={basePath}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full bg-[#f1e9ff] px-2 py-0.5 text-[10.5px] font-semibold text-[#7412ef] no-underline hover:bg-[#e8dafd]"
            >
              <Flame size={10} /> Hot lead
            </Link>
          )}
        </div>
      </td>
      <td onClick={onOpen} className="cursor-pointer">
        {awaitingInStatus ? (
          // A waiting draft is the one thing the client can act on, so it replaces
          // the (contradictory) "email not written yet" label.
          <Link
            to={`${basePath}/approvals`}
            onClick={(e) => e.stopPropagation()}
            className="atbl-pill inline-flex items-center gap-1 whitespace-nowrap bg-[#f1e9ff] text-[#7412ef] no-underline hover:bg-[#f1e9ff]"
          >
            <ClipboardCheck size={11} /> Awaiting approval{row.awaiting_approval > 1 ? ` (${row.awaiting_approval})` : ''}
          </Link>
        ) : (
          <StatusPill pill={pill}>{statusLabel}</StatusPill>
        )}
      </td>
      <td onClick={onOpen} className="cursor-pointer">
        {row.emails_sent > 0 ? (
          <>
            <div className="text-[13px] text-[#0e0822]">
              {row.emails_sent} sent
              <span className="text-[#8f8aa8]"> · </span>{row.opened} opened
              <span className="text-[#8f8aa8]"> · </span>
              <span className={row.replies > 0 ? 'font-semibold text-[#7412ef]' : undefined}>{row.replies} {row.replies === 1 ? 'reply' : 'replies'}</span>
            </div>
            {lastActivity && (
              <div className="mt-0.5 text-[11.5px] text-[#605978]">{lastActivity.label} {formatShortDate(lastActivity.date)}</div>
            )}
          </>
        ) : (
          <span className="text-[#8f8aa8]">—</span>
        )}
      </td>
      <td className="min-w-0">
        <NoteCell key={row.client_note ?? ''} prospectId={row.prospect_id} note={row.client_note} readOnly={readOnly} onSaved={onNoteSaved} onError={onNoteError} />
      </td>
    </tr>
  );
}

function NoteCell({
  prospectId, note, readOnly, onSaved, onError,
}: { prospectId: string; note: string | null; readOnly: boolean; onSaved: () => void; onError: (msg: string) => void }) {
  const [editing, setEditing] = useState(false);
  // Re-synced from `note` by remounting (see the `key` passed where NoteCell
  // is used) rather than an effect — this is the only place the draft needs
  // to catch up with a prop change.
  const [draft, setDraft] = useState(note ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (draft.trim() === (note ?? '').trim()) { setEditing(false); return; }
    setBusy(true);
    const { error } = await setProspectNote(prospectId, draft.trim());
    setBusy(false);
    // On failure keep the editor (and the typed note) open rather than
    // closing as if it had saved.
    if (error) { onError(`Couldn't save the note: ${error}`); return; }
    setEditing(false);
    onSaved();
  }

  if (readOnly) {
    return note ? <StickyNote size={14} className="text-[#7412ef]" /> : null;
  }

  if (editing) {
    // Floats above the row instead of a plain inline box — an inline textarea
    // wide enough to be usable would force this column wider than its share
    // of a fixed table layout, which is exactly the "note pushes everything
    // else off-screen" problem being fixed here.
    return (
      <div onClick={(e) => e.stopPropagation()} className="relative">
        <div className="absolute right-0 top-0 z-20 w-60 rounded-lg border border-[#7412ef] bg-white p-1.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            maxLength={4000}
            rows={3}
            style={FONT}
            className="w-full resize-none rounded-md border-0 px-1.5 py-1 text-[12px] text-[#0e0822] outline-none"
          />
          {busy && <span className="px-1.5 text-[10.5px] text-[#605978]">Saving…</span>}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="cursor-pointer inline-flex items-center gap-1 rounded-lg border-0 bg-transparent p-1 text-[#605978] transition-colors hover:text-[#7412ef]"
      title={note ? 'Edit note' : 'Add a note'}
    >
      {note ? <StickyNote size={14} className="text-[#7412ef]" /> : <Pencil size={13} />}
    </button>
  );
}

/* ── Sequence review & approval panel ─────────────────────────────────── */

const STEP_STATE_LABEL: Record<SequenceStepState, string> = {
  sent: 'Sent',
  awaiting_approval: 'Awaiting approval',
  ready: 'Approved, will send on schedule',
  scheduled: 'Will be written later',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  failed: 'Failed to send',
  stopped_hot_lead: 'Stopped: they replied with interest',
  stopped_unsubscribed: 'Stopped: unsubscribed',
  not_written: 'Not written yet',
};

const STEP_STATE_PILL: Record<SequenceStepState, StatusPillStyle> = {
  sent:                 { ...PILL.sent,    icon: 'send' },
  ready:                { ...PILL.ahead,   icon: 'clock' },
  awaiting_approval:    { ...PILL.waiting, icon: 'clock' },
  rejected:             { ...PILL.closed,  icon: 'minus' },
  scheduled:            { ...PILL.ahead,   icon: 'refresh' },
  not_written:          { ...PILL.ahead,   icon: 'circle' },
  cancelled:            { ...PILL.closed,  icon: 'minus' },
  stopped_hot_lead:     { ...PILL.hot,     icon: 'zap' },
  stopped_unsubscribed: { ...PILL.closed,  icon: 'minus' },
  failed:               { ...PILL.problem, icon: 'alert' },
};

const GMAIL_REQUIRED_TITLE = "Connect your Gmail in Settings before approving - that's what actually sends this.";
const APPROVAL_EXPLAINER =
  'Approving schedules every email. Follow-ups send 3, 5 and 7 business days after the previous email, and only if the prospect has not replied or unsubscribed.';

function PanelStatusBadge({
  sequenceStatus, pipelineStatus,
}: { sequenceStatus: string | null | undefined; pipelineStatus: string }) {
  const seq = isSequenceStatus(sequenceStatus) ? sequenceStatus : null;
  const pill = seq ? SEQUENCE_STATUS_PILL[seq] : STATUS_PILL[pipelineStatus] ?? { bg: '#f9f6ff', text: '#605978' };
  return (
    <StatusPill pill={pill}>{seq ? SEQUENCE_STATUS_PANEL_LABEL[seq] : STATUS_LABEL[pipelineStatus] ?? pipelineStatus}</StatusPill>
  );
}

const STOPPED_BECAUSE_LABEL: Record<NonNullable<StoppedBecause>, string> = {
  they_replied_with_interest: 'Follow-ups stopped — they replied with interest',
  unsubscribed_or_bounced: 'Follow-ups stopped — unsubscribed or bounced',
};

function stepDateLabel(step: SequenceStep): string | null {
  if (step.sent_at) return `Sent ${formatShortDate(step.sent_at)}`;
  if (step.state === 'ready' && step.scheduled_for) return `Sends ${formatShortDate(step.scheduled_for)}`;
  if (step.state === 'scheduled' && step.due_at) return `Due ${formatShortDate(step.due_at)}`;
  return null;
}

// Steps that still have something queued to go out (so "Cancel unsent" applies).
const OPEN_STEP_STATES: SequenceStepState[] = ['awaiting_approval', 'ready', 'scheduled'];

function SequencePanel({
  prospectId, row, clientId, client, basePath, readOnly, onClose,
}: {
  prospectId: string; row: PipelineRow | null; clientId: string; client: SupabaseClient; basePath: string; readOnly: boolean; onClose: () => void;
}) {
  const { sequence, paused, loading, error } = useProspectSequence(prospectId, client);
  const { profile } = useAuth();
  const { connection: gmail } = useGmailConnection(clientId);
  const { toasts, toast, dismiss } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const blockedByGmail = !gmail.connected;

  async function approveSequence() {
    setBusy('approve-seq');
    const res = await approveSequences(clientId, [prospectId]);
    setBusy(null);
    if (res.data === null) { toast(res.error, 'error'); return; }
    const n = res.data.emails_approved;
    if (n === 0) toast('Nothing to approve - this prospect is no longer in an active sequence.', 'warning');
    else toast(`${n} email${n === 1 ? '' : 's'} approved and scheduled`);
  }

  async function approveStep(step: SequenceStep) {
    if (!step.message_id) return;
    setBusy(`approve-${step.message_id}`);
    const { error: err } = await approveOneEmail(clientId, step.message_id, profile?.id ?? null);
    setBusy(null);
    if (err) toast(err, 'error'); else toast(`${step.step} approved`);
  }

  async function saveStep(step: SequenceStep, patch: { subject?: string; body?: string }): Promise<boolean> {
    if (!step.message_id) return false;
    const { error: err } = await saveStepEdit(clientId, step.message_id, patch);
    if (err) { toast(err, 'error'); return false; }
    toast(`${step.step} saved`);
    return true;
  }

  async function togglePause() {
    setBusy('pause');
    const res = await setSequencePaused(clientId, prospectId, !paused);
    setBusy(null);
    if (res.error) toast(res.error, 'error');
    else toast(paused ? 'Sequence resumed' : 'Sequence paused');
  }

  async function stopAllFollowups() {
    setBusy('stop');
    const res = await stopFollowups(clientId, prospectId);
    setBusy(null);
    setConfirmStop(false);
    if (res.error) { toast(res.error, 'error'); return; }
    toast('Follow-ups stopped for this prospect');
  }

  async function cancelUnsent() {
    setBusy('cancel');
    const res = await cancelUnsentSequence(clientId, prospectId);
    setBusy(null);
    setConfirmCancel(false);
    if (res.data === null) { toast(res.error, 'error'); return; }
    const n = res.data.emails_cancelled;
    toast(`${n} email${n === 1 ? '' : 's'} cancelled`);
  }

  async function resolveReply(replyId: string, resolution: 'automated' | 'human') {
    setBusy(`resolve-${resolution}`);
    const res = await resolveUncertainReply(clientId, replyId, resolution);
    setBusy(null);
    if (res.error) toast(res.error, 'error');
    else toast(resolution === 'automated' ? 'Marked as automated - sequence resumed' : 'Marked as a real person - sequence stays paused');
  }

  const steps = sequence?.steps ?? [];
  const hasAwaiting = steps.some((s) => s.state === 'awaiting_approval' && s.message_id);
  const hasOpen = steps.some((s) => OPEN_STEP_STATES.includes(s.state));
  const needsReview = sequence?.sequence_status === 'needs_review';
  const reviewReply = needsReview && sequence ? sequence.replies[sequence.replies.length - 1] ?? null : null;
  const stoppedLabel = sequence?.stopped_because
    ? STOPPED_BECAUSE_LABEL[sequence.stopped_because] ?? sequence.stopped_because.replace(/_/g, ' ')
    : null;

  const primaryBtn = btn('primary', 'md');
  const ghostBtn = btn('secondary', 'md');

  // The first email waiting on approval is the thing to decide on, so it opens expanded;
  // follow-ups that don't exist yet collapse into one line instead of one row each.
  const writtenSteps = steps.filter((s, i) => i === 0 || s.state !== 'not_written');
  const unwrittenSteps = steps.filter((s, i) => i > 0 && s.state === 'not_written');
  const firstAwaitingIdx = writtenSteps.findIndex((s) => s.state === 'awaiting_approval' && !!s.message_id);
  // The panel's own status badge would say "Email not written yet" while a draft is waiting.
  const awaitingFirst = hasAwaiting && !isSequenceStatus(sequence?.sequence_status);
  const subtitle = [row?.contact_name, row?.category, row?.location].filter(Boolean).join(' · ');
  const email = sequence?.prospect.email ?? row?.email ?? null;
  const phone = row?.phone ?? null;
  const website = row?.website ?? null;

  return (
    <motion.div
      className="panel-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      {...useOverlayClose(onClose)}
    >
      <motion.aside
        className="modal-card panel lead-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={FONT}
      >
        <div className="panel-handle" />
        <div className="panel-scroll lp-scroll">
          {/* ─── Header: status, name, where they are ─── */}
          <header className="lp-header">
            <div className="lp-header-top">
              <div className="lp-chips">
                {awaitingFirst ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#f1e9ff] px-2.5 py-1 text-[11.5px] font-semibold text-[#7412ef]">
                    <ClipboardCheck size={11} /> Awaiting your approval
                  </span>
                ) : sequence ? (
                  <PanelStatusBadge sequenceStatus={sequence.sequence_status} pipelineStatus={sequence.prospect.pipeline_status} />
                ) : null}
                {paused && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#f1e9ff] px-2.5 py-1 text-[11.5px] font-semibold text-[#7412ef]">
                    <Pause size={11} /> Paused
                  </span>
                )}
                {sequence?.followups_stopped && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#f9f6ff] px-2.5 py-1 text-[11.5px] font-semibold text-[#0e0822]">
                    Follow-ups stopped
                  </span>
                )}
              </div>
              <button className="lp-close" onClick={onClose} aria-label="Close">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <h2 id="lp-title" className="lp-title">{sequence?.prospect.business_name ?? row?.business_name ?? 'Prospect'}</h2>
            {subtitle && <p className="lp-subtitle">{subtitle}</p>}
          </header>

          {loading ? (
            <div className="flex flex-col gap-3 p-6">
              <div className="h-6 w-1/2 animate-pulse rounded bg-[#e8e3f7]" />
              <div className="h-24 w-full animate-pulse rounded-xl bg-[#e8e3f7]" />
            </div>
          ) : error ? (
            <div className="m-6 rounded-xl border border-[#0e0822]/20 bg-[#f9f6ff] px-4 py-3 text-[13px] text-[#0e0822]">{error}</div>
          ) : sequence ? (
            <div className="lp-body">
              {/* ─── Left: what is planned and what happened ─── */}
              <div className="lp-main">
                {stoppedLabel && (
                  <div className="mb-5 rounded-xl px-4 py-3 text-[13px] font-semibold" style={{ background: 'var(--leaf-tint)', color: 'var(--leaf)' }}>
                    {stoppedLabel}
                  </div>
                )}

                {/* Uncertain reply: the sequence is held until someone decides what it was. */}
                {needsReview && (
                  <div className="mb-5 rounded-xl border px-4 py-3.5" style={{ background: 'var(--amber-tint)', borderColor: '#e8dafd' }}>
                    <div className="mb-1 text-[12px] font-semibold uppercase tracking-[.06em]" style={{ color: 'var(--amber)' }}>
                      We couldn't tell if this reply is from a person
                    </div>
                    {reviewReply ? (
                      <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: 'var(--ink)' }}>{reviewReply.body}</p>
                    ) : (
                      <p className="m-0 text-[13px]" style={{ color: 'var(--ink-soft)' }}>No reply text on record.</p>
                    )}
                    {!readOnly && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className={primaryBtn}
                          disabled={!reviewReply?.id || busy !== null}
                          onClick={() => reviewReply?.id && resolveReply(reviewReply.id, 'automated')}
                        >
                          Automated reply, resume sequence
                        </button>
                        <button
                          className={ghostBtn}
                          disabled={!reviewReply?.id || busy !== null}
                          onClick={() => reviewReply?.id && resolveReply(reviewReply.id, 'human')}
                        >
                          Real person, keep paused
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <section className="lp-section">
                  <div className="lp-eyebrow">Sequence</div>
                  <div className="flex flex-col">
                    {writtenSteps.map((step, i) => (
                      <SequenceStepRow
                        key={step.message_type}
                        step={step}
                        isLast={i === writtenSteps.length - 1 && unwrittenSteps.length === 0}
                        defaultExpanded={i === firstAwaitingIdx}
                        readOnly={readOnly}
                        busy={busy !== null}
                        blockedByGmail={blockedByGmail}
                        onApprove={() => approveStep(step)}
                        onSave={(patch) => saveStep(step, patch)}
                      />
                    ))}
                    {unwrittenSteps.length > 0 && (
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#605978]" />
                        </div>
                        <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                          {unwrittenSteps.length} follow-up{unwrittenSteps.length === 1 ? '' : 's'} will be written after the first email sends.
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <section className="lp-section">
                  <div className="lp-eyebrow">Their replies</div>
                  {sequence.replies.length === 0 ? (
                    <p className="m-0 text-[13px] text-[#605978]">No replies on record for this prospect yet.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {sequence.replies.map((r, i) => (
                        <div key={r.id ?? i} className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--line)' }}>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            {r.intent && (
                              <span className="text-[10.5px] font-semibold uppercase tracking-[.06em]" style={{ color: intentStyle(r.intent).color }}>{intentStyle(r.intent).label}</span>
                            )}
                            <span className="text-[11px] text-[#605978]">{formatShortDate(r.received_at)}</span>
                          </div>
                          <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{r.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* ─── Right: who they are + what to do ─── */}
              <aside className="lp-rail">
                {(email || phone || website) && (
                  <div className="lp-contact">
                    <div className="lp-eyebrow">Contact</div>
                    {email && (
                      <a className="lp-contact-row" href={`mailto:${email}`} title={email}>
                        <Mail size={16} strokeWidth={2} /><span className="lp-contact-value">{email}</span>
                      </a>
                    )}
                    {phone && (
                      <a className="lp-contact-row" href={`tel:${phone}`}>
                        <Phone size={16} strokeWidth={2} /><span className="lp-contact-value">{formatPhone(phone)}</span>
                      </a>
                    )}
                    {website && (
                      <a className="lp-contact-row" href={/^https?:\/\//.test(website) ? website : `https://${website}`} target="_blank" rel="noreferrer" title={website}>
                        <Globe size={16} strokeWidth={2} /><span className="lp-contact-value">{website.replace(/^https?:\/\//, '')}</span>
                      </a>
                    )}
                  </div>
                )}

                {hasAwaiting && (
                  <div className="lp-actions">
                    {readOnly ? (
                      <Link to={`${basePath}/approvals`} className="lp-btn lp-btn-secondary">Open in Approvals</Link>
                    ) : (
                      <>
                        <button
                          className="lp-btn lp-btn-primary"
                          onClick={approveSequence}
                          disabled={busy !== null || blockedByGmail}
                          title={blockedByGmail ? GMAIL_REQUIRED_TITLE : undefined}
                        >
                          {busy === 'approve-seq' ? 'Approving…' : 'Approve whole sequence'}
                        </button>
                        <p className="lp-muted">{APPROVAL_EXPLAINER}</p>
                      </>
                    )}
                  </div>
                )}

                {!readOnly && hasOpen && (
                  <>
                    <div className="lp-divider" />
                    <button className="lp-btn lp-btn-ghost" onClick={togglePause} disabled={busy !== null}>
                      {paused ? <><Play size={14} /> Resume sequence</> : <><Pause size={14} /> Pause sequence</>}
                    </button>
                    <button className="lp-not-fit" onClick={() => setConfirmCancel(true)} disabled={busy !== null}>
                      Cancel unsent emails
                    </button>
                    {!sequence.followups_stopped && (
                      <button className="lp-not-fit" onClick={() => setConfirmStop(true)} disabled={busy !== null}>
                        Stop follow-ups
                      </button>
                    )}
                  </>
                )}

                {row?.client_note && (
                  <>
                    <div className="lp-divider" />
                    <div>
                      <div className="lp-eyebrow">Your note</div>
                      <p className="m-0 whitespace-pre-wrap text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{row.client_note}</p>
                    </div>
                  </>
                )}
              </aside>
            </div>
          ) : null}
        </div>
      </motion.aside>

      <AnimatePresence>
        {confirmCancel && (
          <ConfirmDialog
            key="cancel-confirm"
            title="Cancel unsent emails?"
            confirmLabel="Cancel unsent emails"
            cancelLabel="Keep them"
            danger
            busy={busy === 'cancel'}
            onConfirm={cancelUnsent}
            onCancel={() => setConfirmCancel(false)}
          >
            Every email that hasn't been sent yet for this prospect will be cancelled. Emails already sent are not affected.
          </ConfirmDialog>
        )}
        {confirmStop && (
          <ConfirmDialog
            key="stop-confirm"
            title="Stop follow-ups?"
            confirmLabel="Stop follow-ups"
            cancelLabel="Keep them"
            danger
            busy={busy === 'stop'}
            onConfirm={stopAllFollowups}
            onCancel={() => setConfirmStop(false)}
          >
            No further follow-up emails will be sent to this prospect. Emails already sent are not affected.
          </ConfirmDialog>
        )}
      </AnimatePresence>
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </motion.div>
  );
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Stored bodies are plain text today (not markup), but this renders inside a
// script-less sandboxed iframe regardless — safe whether or not that ever
// changes, and the compliance footer is shown exactly as written, never
// stripped from the preview.
export function bodyToSrcDoc(body: string): string {
  const html = escapeHtml(body).replace(/\n/g, '<br>');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; padding:12px 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size:13.5px; line-height:1.6; color:#0e0822; word-wrap:break-word; }
  </style></head><body>${html}</body></html>`;
}

function SequenceStepRow({
  step, isLast, defaultExpanded, readOnly, busy, blockedByGmail, onApprove, onSave,
}: {
  step: SequenceStep; isLast: boolean; defaultExpanded: boolean; readOnly: boolean; busy: boolean; blockedByGmail: boolean;
  onApprove: () => void;
  onSave: (patch: { subject?: string; body?: string }) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const pill = STEP_STATE_PILL[step.state] ?? { bg: '#f9f6ff', text: '#605978' };
  const dateLabel = stepDateLabel(step);
  const hasBody = !!step.body;

  const editable = !readOnly && step.state !== 'sent' && step.send_status !== 'sent' && !!step.message_id;
  // Approved but not yet sent: saving keeps it approved, so it goes out with the edit.
  const approvedUnsent = step.approval_status === 'approved' && step.send_status === 'not_sent';
  const canApprove = !readOnly && step.state === 'awaiting_approval' && !!step.message_id;

  const subjectDirty = step.subject !== null && subjectDraft.trim() !== (step.subject ?? '').trim();
  const bodyDirty = bodyDraft.trim() !== (step.body ?? '').trim();

  function startEdit() {
    setSubjectDraft(step.subject ?? '');
    setBodyDraft(step.body ?? '');
    setExpanded(false);
    setEditing(true);
  }

  async function doSave() {
    setSaving(true);
    const patch: { subject?: string; body?: string } = {};
    if (subjectDirty) patch.subject = subjectDraft;
    if (bodyDirty) patch.body = bodyDraft;
    const ok = await onSave(patch);
    setSaving(false);
    setConfirmSave(false);
    if (ok) setEditing(false);
  }

  function requestSave() {
    if (!subjectDirty && !bodyDirty) { setEditing(false); return; }
    if (approvedUnsent) setConfirmSave(true); else void doSave();
  }


  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: pill.text }} />
        {!isLast && <span className="w-px flex-1" style={{ background: 'var(--line)', minHeight: 20 }} />}
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>{step.step}</span>
          <StatusPill pill={pill}>{STEP_STATE_LABEL[step.state] ?? step.state}</StatusPill>
          {dateLabel && <span className="text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>{dateLabel}</span>}
          {step.opened > 0 && (
            <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>· opened {step.opened}x</span>
          )}
        </div>

        {editing ? (
          <div className="mt-2 flex flex-col gap-2">
            {step.subject !== null && (
              <input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                aria-label={`${step.step} subject`}
                style={FONT}
                className="w-full rounded-lg border border-[#7412ef] bg-white px-3 py-2 text-[13px] font-semibold text-[#0e0822] outline-none"
              />
            )}
            <textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              aria-label={`${step.step} body`}
              rows={Math.max(6, bodyDraft.split('\n').length + 1)}
              style={FONT}
              className="w-full resize-y rounded-lg border border-[#7412ef] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#0e0822] outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={requestSave}
                disabled={saving || (!subjectDirty && !bodyDirty)}
                className={btn('primary', 'sm')}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className={btn('secondary', 'sm')}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {step.subject && (
              <p className="m-0 mt-0.5 text-[13px]" style={{ color: 'var(--ink-soft)' }}>{step.subject}</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {hasBody && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px] font-semibold"
                  style={{ color: 'var(--leaf)' }}
                >
                  {expanded ? <><ChevronUp size={13} /> Hide email</> : <><ChevronDown size={13} /> Show email</>}
                </button>
              )}
              {editable && (
                <button
                  onClick={startEdit}
                  disabled={busy}
                  className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px] font-semibold disabled:opacity-50"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
              {canApprove && (
                <button
                  onClick={onApprove}
                  disabled={busy || blockedByGmail}
                  title={blockedByGmail ? GMAIL_REQUIRED_TITLE : undefined}
                  className={btn('primary', 'sm')}
                >
                  Approve this email
                </button>
              )}
            </div>
            {expanded && hasBody && (
              <iframe
                title={`${step.step} body`}
                sandbox=""
                srcDoc={bodyToSrcDoc(step.body as string)}
                className="mt-2 w-full rounded-lg border"
                style={{ borderColor: 'var(--line)', minHeight: 180, background: '#fff' }}
              />
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {confirmSave && (
          <ConfirmDialog
            key="confirm-edit"
            title="Edit an approved email?"
            confirmLabel="Save changes"
            busy={saving}
            onConfirm={() => void doSave()}
            onCancel={() => setConfirmSave(false)}
          >
            This email is already approved. Saving will keep it approved and it will send with your changes.
          </ConfirmDialog>
        )}
      </AnimatePresence>
    </div>
  );
}
