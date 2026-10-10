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
import { Search, StickyNote, ClipboardCheck, Flame, ChevronDown, ChevronUp, Pencil, Pause, Play } from 'lucide-react';
import {
  PIPELINE_STATUS_LABEL, PIPELINE_STATUS_PILL, SEQUENCE_STATUS_LABEL, SEQUENCE_STATUS_PILL,
  SEQUENCE_STATUS_ORDER, SEQUENCE_STATUS_PANEL_LABEL, SEQUENCE_FILTER_PREFIX, isSequenceStatus,
} from '../../lib/pipelineStatus';
import { useAuth } from '../../auth/AuthProvider';
import { useGmailConnection } from '../../hooks/useGmailConnection';
import { useToast, ToastHost } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  approveSequences, approveOneEmail, saveStepEdit, setSequencePaused, cancelUnsentSequence, resolveUncertainReply,
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
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-[#20211c]">Prospects</h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">{result.total} prospect{result.total !== 1 ? 's' : ''}</p>
        </div>
        <HelpButton content={HELP} />
      </header>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9d92]" />
        <input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by business, email, or contact"
          style={FONT}
          className="w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] py-2 pl-9 pr-3 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white"
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
                  ? 'bg-[#edf4ef] border-transparent text-[#3c7a5b] font-bold'
                  : 'bg-white border-[#ddd8cb] text-[#62655c] font-semibold hover:border-[#3c7a5b]'
              }`}
            >
              {t.label}
              <span className={`inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10.5px] font-bold ${
                active ? 'bg-[#3c7a5b]/10 text-[#3c7a5b]' : 'bg-[#f5f2ec] text-[#9a9d92]'
              }`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : result.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">No prospects found.</strong>
          {search && <span className="text-[13px] text-[#62655c]">Try a different search.</span>}
        </div>
      ) : (
        <>
          <div className="atbl" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            <table className="table-fixed">
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[19%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr>
                  {['Business', 'Status', 'Sent', 'Opens', 'Replies', 'Last activity', 'Note'].map((h) => (
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
                  />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-[#ece8df] bg-white px-4 py-3 text-[12.5px] text-[#9a9d92]">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((o) => Math.max(0, o - PIPELINE_PAGE_SIZE))}
                  disabled={offset <= 0}
                  className="cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset((o) => o + PIPELINE_PAGE_SIZE)}
                  disabled={page >= totalPages}
                  className="cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40"
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
            clientId={clientId}
            readOnly={readOnly}
            client={client}
            basePath={basePath}
            onClose={() => setOpenProspectId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ProspectRow({
  row, readOnly, basePath, onOpen, onNoteSaved,
}: {
  row: PipelineRow; readOnly: boolean; basePath: string; onOpen: () => void; onNoteSaved: () => void;
}) {
  const seq = isSequenceStatus(row.sequence_status) ? row.sequence_status : null;
  const pill = seq
    ? SEQUENCE_STATUS_PILL[seq]
    : STATUS_PILL[row.pipeline_status] ?? { bg: '#f5f2ec', text: '#62655c' };
  const statusLabel = seq ? SEQUENCE_STATUS_LABEL[seq] : STATUS_LABEL[row.pipeline_status] ?? row.pipeline_status;
  const lastActivity = row.last_reply_at && (!row.last_sent_at || row.last_reply_at > row.last_sent_at)
    ? { label: 'Replied', date: row.last_reply_at }
    : row.last_sent_at
      ? { label: 'Sent', date: row.last_sent_at }
      : null;

  return (
    <tr>
      <td className="min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="truncate font-bold text-[#20211c]" title={row.business_name}>{row.business_name}</div>
        {(row.category || row.location) && (
          <div className="truncate text-[12px] text-[#9a9d92]">
            {[row.category, row.location].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {row.suppressed && !seq && (
            <span className="inline-flex items-center rounded-full border border-[#ddd8cb] px-2 py-0.5 text-[10.5px] font-semibold text-[#9a9d92]">
              Unsubscribed
            </span>
          )}
          {row.awaiting_approval > 0 && (
            <Link
              to={`${basePath}/approvals`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full bg-[#f0ecf8] px-2 py-0.5 text-[10.5px] font-bold text-[#6b4fa0] no-underline hover:bg-[#e9e2f5]"
            >
              <ClipboardCheck size={10} /> {row.awaiting_approval} awaiting approval
            </Link>
          )}
          {row.hot_lead_status && (
            <Link
              to={basePath}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full bg-[#edf4ef] px-2 py-0.5 text-[10.5px] font-bold text-[#3c7a5b] no-underline hover:bg-[#e0ede4]"
            >
              <Flame size={10} /> Hot lead
            </Link>
          )}
        </div>
      </td>
      <td onClick={onOpen} className="cursor-pointer">
        <span
          className="atbl-pill"
          style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none', whiteSpace: 'normal', textAlign: 'left' }}
        >
          {statusLabel}
        </span>
      </td>
      <td onClick={onOpen} className="cursor-pointer text-[#62655c]">{row.emails_sent}</td>
      <td onClick={onOpen} className="cursor-pointer text-[#62655c]">{row.opened}</td>
      <td onClick={onOpen} className="cursor-pointer text-[#62655c]">{row.replies}</td>
      <td onClick={onOpen} className="cursor-pointer text-[12px] text-[#9a9d92] whitespace-nowrap">
        {lastActivity ? `${lastActivity.label} ${formatShortDate(lastActivity.date)}` : '—'}
      </td>
      <td className="min-w-0">
        <NoteCell key={row.client_note ?? ''} prospectId={row.prospect_id} note={row.client_note} readOnly={readOnly} onSaved={onNoteSaved} />
      </td>
    </tr>
  );
}

function NoteCell({
  prospectId, note, readOnly, onSaved,
}: { prospectId: string; note: string | null; readOnly: boolean; onSaved: () => void }) {
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
    setEditing(false);
    if (!error) onSaved();
  }

  if (readOnly) {
    return note ? <StickyNote size={14} className="text-[#b9831f]" /> : null;
  }

  if (editing) {
    // Floats above the row instead of a plain inline box — an inline textarea
    // wide enough to be usable would force this column wider than its share
    // of a fixed table layout, which is exactly the "note pushes everything
    // else off-screen" problem being fixed here.
    return (
      <div onClick={(e) => e.stopPropagation()} className="relative">
        <div className="absolute right-0 top-0 z-20 w-60 rounded-lg border border-[#3c7a5b] bg-white p-1.5 shadow-lg">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            maxLength={4000}
            rows={3}
            style={FONT}
            className="w-full resize-none rounded-md border-0 px-1.5 py-1 text-[12px] text-[#20211c] outline-none"
          />
          {busy && <span className="px-1.5 text-[10.5px] text-[#9a9d92]">Saving…</span>}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="cursor-pointer inline-flex items-center gap-1 rounded-lg border-0 bg-transparent p-1 text-[#9a9d92] transition-colors hover:text-[#3c7a5b]"
      title={note ? 'Edit note' : 'Add a note'}
    >
      {note ? <StickyNote size={14} className="text-[#b9831f]" /> : <Pencil size={13} />}
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

const STEP_STATE_PILL: Record<SequenceStepState, { bg: string; text: string }> = {
  sent:                 { bg: '#edf4ef', text: '#3c7a5b' },
  ready:                { bg: '#f8efdb', text: '#b9831f' },
  awaiting_approval:    { bg: '#f0ecf8', text: '#6b4fa0' },
  rejected:             { bg: '#f6e8e2', text: '#a8533a' },
  scheduled:            { bg: '#f5f2ec', text: '#62655c' },
  not_written:          { bg: '#f5f2ec', text: '#9a9d92' },
  cancelled:            { bg: '#f5f2ec', text: '#9a9d92' },
  stopped_hot_lead:     { bg: '#edf4ef', text: '#3c7a5b' },
  stopped_unsubscribed: { bg: '#f6e8e2', text: '#a8533a' },
  failed:               { bg: '#f6e8e2', text: '#a8533a' },
};

const GMAIL_REQUIRED_TITLE = "Connect your Gmail in Settings before approving - that's what actually sends this.";
const APPROVAL_EXPLAINER =
  'Approving schedules every email. Follow-ups send 3, 5 and 7 business days after the previous email, and only if the prospect has not replied or unsubscribed.';

function PanelStatusBadge({
  sequenceStatus, pipelineStatus,
}: { sequenceStatus: string | null | undefined; pipelineStatus: string }) {
  const seq = isSequenceStatus(sequenceStatus) ? sequenceStatus : null;
  const pill = seq ? SEQUENCE_STATUS_PILL[seq] : STATUS_PILL[pipelineStatus] ?? { bg: '#f5f2ec', text: '#62655c' };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold"
      style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
    >
      {seq ? SEQUENCE_STATUS_PANEL_LABEL[seq] : STATUS_LABEL[pipelineStatus] ?? pipelineStatus}
    </span>
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
  prospectId, clientId, client, basePath, readOnly, onClose,
}: {
  prospectId: string; clientId: string; client: SupabaseClient; basePath: string; readOnly: boolean; onClose: () => void;
}) {
  const { sequence, paused, loading, error } = useProspectSequence(prospectId, client);
  const { profile } = useAuth();
  const { connection: gmail } = useGmailConnection(clientId);
  const { toasts, toast, dismiss } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
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

  const primaryBtn = 'cursor-pointer rounded-lg border-0 bg-[#3c7a5b] px-3 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:cursor-not-allowed disabled:opacity-50';
  const ghostBtn = 'cursor-pointer rounded-lg border border-[#ddd8cb] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:border-[#3c7a5b] disabled:cursor-not-allowed disabled:opacity-50';
  const dangerBtn = 'cursor-pointer rounded-lg border border-[#a8533a] bg-transparent px-3 py-1.5 text-[12.5px] font-bold text-[#a8533a] transition-colors hover:bg-[#a8533a] hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

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
        className="panel rounded-lg"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={FONT}
      >
        <div className="panel-handle" />
        <div className="panel-scroll">
          <div className="panel-top">
            <span className="text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">Prospect</span>
            <button className="panel-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3">
              <div className="h-6 w-1/2 rounded bg-[#ece8df] animate-pulse" />
              <div className="h-24 w-full rounded-xl bg-[#ece8df] animate-pulse" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
          ) : sequence ? (
            <>
              <h2 className="panel-biz">{sequence.prospect.business_name}</h2>
              {sequence.prospect.email && <p className="panel-category mono">{sequence.prospect.email}</p>}

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <PanelStatusBadge
                  sequenceStatus={sequence.sequence_status}
                  pipelineStatus={sequence.prospect.pipeline_status}
                />
                {paused && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#f8efdb] px-2.5 py-1 text-[11.5px] font-bold text-[#b9831f]">
                    <Pause size={11} /> Paused
                  </span>
                )}
              </div>

              {stoppedLabel && (
                <div className="mb-4 rounded-xl px-4 py-3 text-[13px] font-semibold" style={{ background: 'var(--leaf-tint)', color: 'var(--leaf)' }}>
                  {stoppedLabel}
                </div>
              )}

              {/* Uncertain reply: the sequence is held until someone decides what it was. */}
              {needsReview && (
                <div className="mb-4 rounded-xl border px-4 py-3.5" style={{ background: 'var(--amber-tint)', borderColor: '#e8d5a8' }}>
                  <div className="mb-1 text-[12px] font-bold uppercase tracking-[.06em]" style={{ color: 'var(--amber)' }}>
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

              {/* Approve / pause / cancel */}
              {!readOnly && (hasAwaiting || hasOpen) && (
                <div className="mb-4 rounded-xl border border-[#ece8df] bg-[#fbf9f5] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {hasAwaiting && (
                      <button
                        className={primaryBtn}
                        onClick={approveSequence}
                        disabled={busy !== null || blockedByGmail}
                        title={blockedByGmail ? GMAIL_REQUIRED_TITLE : undefined}
                      >
                        {busy === 'approve-seq' ? 'Approving…' : 'Approve whole sequence'}
                      </button>
                    )}
                    {hasOpen && (
                      <button className={ghostBtn} onClick={togglePause} disabled={busy !== null}>
                        {paused ? <><Play size={12} className="mr-1 inline" />Resume</> : <><Pause size={12} className="mr-1 inline" />Pause</>}
                      </button>
                    )}
                    {hasOpen && (
                      <button className={dangerBtn} onClick={() => setConfirmCancel(true)} disabled={busy !== null}>
                        Cancel unsent emails
                      </button>
                    )}
                  </div>
                  {hasAwaiting && (
                    <p className="m-0 mt-2.5 text-[12px] leading-relaxed text-[#62655c]">{APPROVAL_EXPLAINER}</p>
                  )}
                </div>
              )}

              {/* Nudge the client toward approving when the very first step is stuck there */}
              {sequence.steps[0]?.state === 'awaiting_approval' && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--amber-tint)' }}>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>
                    Nothing has gone out yet — the first email is waiting on you.
                  </span>
                  <Link
                    to={`${basePath}/approvals`}
                    className="shrink-0 rounded-lg border-0 bg-[#3c7a5b] px-3 py-1.5 text-[12.5px] font-bold text-white no-underline whitespace-nowrap"
                  >
                    Review and approve
                  </Link>
                </div>
              )}

              <div className="panel-section">
                <div className="panel-label">Sequence</div>
                <div className="flex flex-col">
                  {sequence.steps.map((step, i) => (
                    <SequenceStepRow
                      key={step.message_type}
                      step={step}
                      isLast={i === sequence.steps.length - 1}
                      readOnly={readOnly}
                      busy={busy !== null}
                      blockedByGmail={blockedByGmail}
                      onApprove={() => approveStep(step)}
                      onSave={(patch) => saveStep(step, patch)}
                    />
                  ))}
                </div>
              </div>

              <div className="panel-section">
                <div className="panel-label">Their replies</div>
                {sequence.replies.length === 0 ? (
                  <p className="m-0 text-[13px] text-[#9a9d92]">No replies on record for this prospect yet.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {sequence.replies.map((r, i) => (
                      <div key={r.id ?? i} className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--line)' }}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          {r.intent && (
                            <span className="text-[10.5px] font-bold uppercase tracking-[.06em]" style={{ color: 'var(--leaf)' }}>{r.intent.replace(/_/g, ' ')}</span>
                          )}
                          <span className="text-[11px] text-[#9a9d92]">{formatShortDate(r.received_at)}</span>
                        </div>
                        <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{r.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
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
    body { margin:0; padding:12px 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size:13.5px; line-height:1.6; color:#20211c; word-wrap:break-word; }
  </style></head><body>${html}</body></html>`;
}

function SequenceStepRow({
  step, isLast, readOnly, busy, blockedByGmail, onApprove, onSave,
}: {
  step: SequenceStep; isLast: boolean; readOnly: boolean; busy: boolean; blockedByGmail: boolean;
  onApprove: () => void;
  onSave: (patch: { subject?: string; body?: string }) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const pill = STEP_STATE_PILL[step.state] ?? { bg: '#f5f2ec', text: '#62655c' };
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

  const smallBtn = 'cursor-pointer rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: pill.text }} />
        {!isLast && <span className="w-px flex-1" style={{ background: 'var(--line)', minHeight: 20 }} />}
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-bold" style={{ color: 'var(--ink)' }}>{step.step}</span>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: pill.bg, color: pill.text }}>
            {STEP_STATE_LABEL[step.state] ?? step.state}
          </span>
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
                className="w-full rounded-lg border border-[#3c7a5b] bg-white px-3 py-2 text-[13px] font-bold text-[#20211c] outline-none"
              />
            )}
            <textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              aria-label={`${step.step} body`}
              rows={Math.max(6, bodyDraft.split('\n').length + 1)}
              style={FONT}
              className="w-full resize-y rounded-lg border border-[#3c7a5b] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#20211c] outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={requestSave}
                disabled={saving || (!subjectDirty && !bodyDirty)}
                className={`${smallBtn} border-0 bg-[#3c7a5b] text-white hover:bg-[#2d5e46]`}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className={`${smallBtn} border-[#ddd8cb] bg-white text-[#62655c] hover:border-[#3c7a5b]`}
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
                  className={`${smallBtn} border-0 bg-[#3c7a5b] text-white hover:bg-[#2d5e46]`}
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
