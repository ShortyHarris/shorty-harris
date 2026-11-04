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
import { Search, Plus, ClipboardCheck, Flame, ChevronDown, ChevronUp, Pencil, Pause, Play, X, Mail, Phone, Globe } from 'lucide-react';
import {
  PIPELINE_STATUS_LABEL, PIPELINE_STATUS_PILL, PIPELINE_STATUS_SHORT_LABEL, SEQUENCE_STATUS_LABEL, SEQUENCE_STATUS_PILL,
  SEQUENCE_STATUS_SHORT_LABEL, SEQUENCE_STATUS_PANEL_LABEL, SEQUENCE_FILTER_PREFIX, isSequenceStatus,
} from '../../lib/pipelineStatus';
import { APPROVAL_EXPLAINER } from '../../lib/approvalLabels';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { StatusPill, PILL, type StatusPillStyle } from '../../components/StatusPill';
import { useAuth } from '../../auth/AuthProvider';
import { useGmailConnection } from '../../hooks/useGmailConnection';
import { useToast, ToastHost } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { intentStyle } from '../../lib/replyIntents';
import { panelBadgeSource, unwrittenFollowUpsText } from '../../lib/sequenceCopy';
import {
  approveSequences, approveOneEmail, saveStepEdit, setSequencePaused, cancelUnsentSequence, resolveUncertainReply, stopFollowups,
} from '../../hooks/useSequenceActions';
import './Dashboard.css';

const HELP: HelpContent = {
  title: 'Prospects',
  body: [
    { type: 'p', text: "Every business we've found for you, and exactly where each one stands: written, sent, replied, or waiting on something." },
    { type: 'p', text: "Open a prospect to see the full sequence of emails planned for them, including anything already sent." },
  ],
};

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

// Plain-language status copy lives in ../../lib/pipelineStatus so every
// screen shows the same wording for the same raw pipeline_status value.
const STATUS_LABEL = PIPELINE_STATUS_LABEL;
const STATUS_PILL = PIPELINE_STATUS_PILL;

// Read by client_pipeline; 'flag:' keeps it apart from pipeline_status values.
const AWAITING_APPROVAL_FILTER = 'flag:awaiting_approval';
const DRAFTS_REJECTED_FILTER = 'flag:drafts_rejected';

const FILTER_LABEL: Record<string, string> = {
  replied: 'Replied',
  contacted: 'Emailed',
  message_pending: 'Not emailed yet',
  new: 'Not contacted yet',
  hot_lead: 'Hot lead',
  won: 'Won',
  lost: 'Lost',
  bounced: 'Email bounced',
  generation_failed: "Couldn't write email",
  [AWAITING_APPROVAL_FILTER]: 'Awaiting approval',
  [DRAFTS_REJECTED_FILTER]: 'Drafts rejected',
  [`${SEQUENCE_FILTER_PREFIX}needs_review`]: 'Needs review',
  [`${SEQUENCE_FILTER_PREFIX}human_reply`]: 'Replied: real person',
  [`${SEQUENCE_FILTER_PREFIX}not_interested`]: 'Replied: not interested',
  [`${SEQUENCE_FILTER_PREFIX}automated_reply`]: 'Replied: auto-reply',
  [`${SEQUENCE_FILTER_PREFIX}unsubscribed`]: 'Unsubscribed',
  [`${SEQUENCE_FILTER_PREFIX}hard_bounce`]: 'Bounced: sending stopped',
};

const PRIMARY_FILTERS = [AWAITING_APPROVAL_FILTER, `${SEQUENCE_FILTER_PREFIX}needs_review`, 'replied', 'contacted', 'message_pending'];
const MORE_FILTERS = [
  'hot_lead', DRAFTS_REJECTED_FILTER, 'new', 'won', 'lost', 'bounced', 'generation_failed',
  `${SEQUENCE_FILTER_PREFIX}human_reply`, `${SEQUENCE_FILTER_PREFIX}not_interested`, `${SEQUENCE_FILTER_PREFIX}automated_reply`,
  `${SEQUENCE_FILTER_PREFIX}unsubscribed`, `${SEQUENCE_FILTER_PREFIX}hard_bounce`,
];

const CHIP_ACTIVE = 'bg-(--ad-green-tint) border-transparent text-(--ad-green)';
const CHIP_IDLE = 'bg-(--ad-surface) border-(--ad-line-mid) text-(--ad-ink-soft) hover:border-(--ad-green)';

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
  const filterCount = (key: string) => {
    if (key === AWAITING_APPROVAL_FILTER) return result.awaiting_approval_prospects ?? 0;
    if (key === DRAFTS_REJECTED_FILTER) return result.drafts_rejected_prospects ?? 0;
    return key.startsWith(SEQUENCE_FILTER_PREFIX)
      ? result.counts_by_sequence_status[key.slice(SEQUENCE_FILTER_PREFIX.length) as keyof typeof result.counts_by_sequence_status] ?? 0
      : result.counts_by_status[key] ?? 0;
  };
  const tabs = [
    { key: null as string | null, label: 'All', count: totalAll },
    ...PRIMARY_FILTERS
      .filter((k) => filterCount(k) > 0)
      .map((k) => ({ key: k as string | null, label: FILTER_LABEL[k], count: filterCount(k) })),
  ];
  const moreFilters = MORE_FILTERS.filter((k) => filterCount(k) > 0);
  const moreActive = status !== null && moreFilters.includes(status);

  const page = Math.floor(offset / PIPELINE_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(result.total / PIPELINE_PAGE_SIZE));

  return (
    <div style={FONT} className="flex flex-col gap-6 content">
      <header className="page-header flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-(--ad-ink)">Prospects</h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">{result.total} prospect{result.total !== 1 ? 's' : ''}</p>
        </div>
        <HelpButton content={HELP} />
      </header>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 min-[1400px]:flex-row min-[1400px]:items-center">
        <div className="relative w-full max-w-sm shrink-0 min-[1400px]:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--ad-ink-soft)" />
          <input
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, email, contact"
            style={FONT}
            className="w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) py-2 pl-9 pr-3 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)"
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {tabs.map((t) => {
            const active = status === t.key;
            return (
              <button
                key={t.key ?? 'all'}
                onClick={() => selectStatus(t.key)}
                aria-pressed={active}
                className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {t.label}
                <span className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold ${
                  active ? 'bg-(--ad-green)/10 text-(--ad-green)' : 'bg-(--ad-surface-2) text-(--ad-ink-soft)'
                }`}>{t.count}</span>
              </button>
            );
          })}
          {moreFilters.length > 0 && (
            <Select value={moreActive ? status : ''} onValueChange={selectStatus}>
              <SelectTrigger
                aria-label="More filters"
                style={FONT}
                className={`h-auto w-auto gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold shadow-none focus:ring-0 focus:ring-offset-0 ${moreActive ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                <SelectValue placeholder="More" />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                {moreFilters.map((k) => (
                  <SelectItem key={k} value={k}>{FILTER_LABEL[k]} ({filterCount(k)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-(--ad-ink)/20 bg-(--ad-surface-2) px-4 py-3 text-[13px] text-(--ad-ink)">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={8} cols={4} />
      ) : result.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-semibold text-(--ad-ink)">No prospects found.</strong>
          {search && <span className="text-[13px] text-(--ad-ink-soft)">Try a different search.</span>}
        </div>
      ) : (
        <>
          {/* Cards below 1024px: the sidebar leaves too little room for the table there. */}
          <div className="flex flex-col gap-3 lg:hidden" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            {result.rows.map((row) => (
              <div
                key={row.prospect_id}
                onClick={() => setOpenProspectId(row.prospect_id)}
                className="cursor-pointer rounded-xl border border-(--ad-line) bg-(--ad-surface) p-4"
              >
                <BusinessCell row={row} />
                <div className="mt-2.5"><StatusCell row={row} basePath={basePath} /></div>
                {row.emails_sent > 0 && <div className="mt-2.5"><ActivityCell row={row} /></div>}
                {(row.client_note || !readOnly) && (
                  <div className="mt-2.5 border-t border-(--ad-line) pt-2.5">
                    <NoteCell key={row.client_note ?? ''} prospectId={row.prospect_id} note={row.client_note} readOnly={readOnly} onSaved={reload} onError={(msg) => toast(msg, 'error')} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="atbl hidden lg:block" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            <table className="table-fixed">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[24%]" />
                <col className="w-[22%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr>
                  {['Business', 'Status', 'Last activity', 'Notes'].map((h) => (
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
            <div className="flex items-center justify-between rounded-lg border border-(--ad-line) bg-(--ad-surface) px-4 py-3 text-[12.5px] text-(--ad-ink-soft)">
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

function BusinessCell({ row }: { row: PipelineRow }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-semibold text-(--ad-ink)" title={row.business_name}>{row.business_name}</div>
      {(row.category || row.location) && (
        <div className="truncate text-[12px] text-(--ad-ink-soft)">
          {[row.category, row.location].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}

function StatusCell({ row, basePath }: { row: PipelineRow; basePath: string }) {
  const seq = isSequenceStatus(row.sequence_status) ? row.sequence_status : null;
  const pill = seq
    ? SEQUENCE_STATUS_PILL[seq]
    : STATUS_PILL[row.pipeline_status] ?? { bg: 'var(--ad-surface-2)', text: 'var(--ad-ink-soft)' };
  const statusLabel = seq
    ? SEQUENCE_STATUS_SHORT_LABEL[seq]
    : PIPELINE_STATUS_SHORT_LABEL[row.pipeline_status] ?? STATUS_LABEL[row.pipeline_status] ?? row.pipeline_status;
  const fullLabel = seq ? SEQUENCE_STATUS_LABEL[seq] : STATUS_LABEL[row.pipeline_status] ?? row.pipeline_status;
  const awaitingInStatus = row.awaiting_approval > 0 && !seq;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {awaitingInStatus ? (
        // A waiting draft is the one thing the client can act on, so it replaces
        // the (contradictory) "email not written yet" label.
        <Link
          to={`${basePath}/approvals`}
          onClick={(e) => e.stopPropagation()}
          className="atbl-pill inline-flex max-w-full items-center gap-1 whitespace-normal bg-(--ad-green-tint) text-(--ad-green) no-underline hover:bg-(--ad-green-line)"
        >
          <ClipboardCheck size={11} className="shrink-0" /> Awaiting approval{row.awaiting_approval > 1 ? ` (${row.awaiting_approval})` : ''}
        </Link>
      ) : (
        <span title={fullLabel} className="inline-flex max-w-full">
          {/* A borderless pill has no visible edge, so its padding would read as a misaligned indent. */}
          <StatusPill pill={pill} className={`whitespace-normal! ${pill.bg === 'transparent' ? 'pl-0!' : ''}`}>{statusLabel}</StatusPill>
        </span>
      )}
      {row.hot_lead_status && (
        <Link
          to={basePath}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full bg-(--ad-green-tint) px-2 py-0.5 text-[10.5px] font-semibold text-(--ad-green) no-underline hover:bg-(--ad-green-line)"
        >
          <Flame size={10} /> Hot lead
        </Link>
      )}
      {row.awaiting_approval > 0 && seq && (
        <Link
          to={`${basePath}/approvals`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full bg-(--ad-green-tint) px-2 py-0.5 text-[10.5px] font-semibold text-(--ad-green) no-underline hover:bg-(--ad-green-line)"
        >
          <ClipboardCheck size={10} /> {row.awaiting_approval} awaiting approval
        </Link>
      )}
      {row.suppressed && !seq && (
        <span className="inline-flex items-center rounded-full border border-(--ad-line-mid) px-2 py-0.5 text-[10.5px] font-semibold text-(--ad-ink-soft)">
          Unsubscribed
        </span>
      )}
      {row.followups_stopped && (
        <span className="inline-flex items-center rounded-full bg-(--ad-surface-2) px-2 py-0.5 text-[10.5px] font-semibold text-(--ad-ink)">
          Follow-ups stopped
        </span>
      )}
      {row.sequence_paused && !row.followups_stopped && (
        <span className="inline-flex items-center gap-1 rounded-full bg-(--ad-green-tint) px-2 py-0.5 text-[10.5px] font-semibold text-(--ad-green)">
          <Pause size={10} /> Paused
        </span>
      )}
    </div>
  );
}

// Zero counts stay in the prospect's panel; here they would only bury the rows that have signal.
function ActivityCell({ row }: { row: PipelineRow }) {
  if (row.emails_sent === 0) return <span className="text-(--ad-ink-ghost)">-</span>;
  const replied = row.last_reply_at && (!row.last_sent_at || row.last_reply_at > row.last_sent_at);
  const date = replied ? row.last_reply_at : row.last_sent_at;
  const details = [
    row.emails_sent > 1 ? `${row.emails_sent} emails` : null,
    row.opened > 0 ? `Opened ${row.opened}x` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-(--ad-ink)">
        {date ? `${replied ? 'Replied' : 'Sent'} ${formatShortDate(date)}` : `${row.emails_sent} sent`}
      </div>
      {(details || row.replies > 0) && (
        <div className="mt-0.5 text-[12px] text-(--ad-ink-soft)">
          {details}
          {details && row.replies > 0 && ' · '}
          {row.replies > 0 && <span className="font-semibold text-(--ad-green)">{row.replies} {row.replies === 1 ? 'reply' : 'replies'}</span>}
        </div>
      )}
    </div>
  );
}

function ProspectRow({
  row, readOnly, basePath, onOpen, onNoteSaved, onNoteError,
}: {
  row: PipelineRow; readOnly: boolean; basePath: string; onOpen: () => void; onNoteSaved: () => void; onNoteError: (msg: string) => void;
}) {
  return (
    <tr className="cursor-pointer" onClick={onOpen}>
      <td className="min-w-0"><BusinessCell row={row} /></td>
      <td className="min-w-0"><StatusCell row={row} basePath={basePath} /></td>
      <td className="min-w-0"><ActivityCell row={row} /></td>
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
    return note
      ? <p className="m-0 line-clamp-2 wrap-break-word text-[12px] leading-snug text-(--ad-ink)" title={note}>{note}</p>
      : <span className="text-(--ad-ink-ghost)">-</span>;
  }

  if (editing) {
    // Inline, not a floating box: .atbl clips overflow, which would cut a popover off on the bottom rows.
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          maxLength={4000}
          rows={3}
          aria-label="Note"
          style={FONT}
          className="block w-full resize-none rounded-md border border-(--ad-green) bg-(--ad-surface) px-2 py-1.5 text-[12px] leading-snug text-(--ad-ink) outline-none"
        />
        <span className="mt-1 block text-[10.5px] text-(--ad-ink-soft)">{busy ? 'Saving…' : 'Saves when you click away'}</span>
      </div>
    );
  }

  if (note) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        title={`${note}\n\nClick to edit`}
        aria-label={`Edit note: ${note}`}
        className="block w-full cursor-pointer rounded-md border-0 bg-transparent p-0 text-left text-[12px] leading-snug text-(--ad-ink) transition-colors hover:text-(--ad-green)"
      >
        <span className="line-clamp-2 wrap-break-word">{note}</span>
      </button>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border-0 bg-transparent p-0 text-[12px] font-medium text-(--ad-ink-soft) transition-colors hover:text-(--ad-green)"
    >
      <Plus size={12} aria-hidden /> Add note
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

function PanelStatusBadge({
  sequenceStatus, pipelineStatus,
}: { sequenceStatus: string | null | undefined; pipelineStatus: string }) {
  // A hot lead (or another outcome) says more than "Replied, sequence stopped", so it wins,
  // except over hard stops like unsubscribed or bounced. See lib/sequenceCopy.ts.
  const src = panelBadgeSource(isSequenceStatus(sequenceStatus) ? sequenceStatus : null, pipelineStatus);
  if (src.kind === 'sequence') {
    return <StatusPill pill={SEQUENCE_STATUS_PILL[src.status]}>{SEQUENCE_STATUS_PANEL_LABEL[src.status]}</StatusPill>;
  }
  const pill = STATUS_PILL[src.status] ?? { bg: 'var(--ad-surface-2)', text: 'var(--ad-ink-soft)' };
  return <StatusPill pill={pill}>{STATUS_LABEL[src.status] ?? src.status}</StatusPill>;
}

const STOPPED_BECAUSE_LABEL: Record<NonNullable<StoppedBecause>, string> = {
  they_replied_with_interest: 'Follow-ups stopped: they replied with interest',
  unsubscribed_or_bounced: 'Follow-ups stopped: unsubscribed or bounced',
  they_said_not_interested: 'Follow-ups stopped: they said they are not interested',
  stopped: 'Follow-ups stopped for this prospect',
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-(--ad-green-tint) px-2.5 py-1 text-[11.5px] font-semibold text-(--ad-green)">
                    <ClipboardCheck size={11} /> Awaiting your approval
                  </span>
                ) : sequence ? (
                  <PanelStatusBadge sequenceStatus={sequence.sequence_status} pipelineStatus={sequence.prospect.pipeline_status} />
                ) : null}
                {paused && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-(--ad-green-tint) px-2.5 py-1 text-[11.5px] font-semibold text-(--ad-green)">
                    <Pause size={11} /> Paused
                  </span>
                )}
                {sequence?.followups_stopped && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-(--ad-surface-2) px-2.5 py-1 text-[11.5px] font-semibold text-(--ad-ink)">
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
              <div className="h-6 w-1/2 animate-pulse rounded bg-(--ad-line)" />
              <div className="h-24 w-full animate-pulse rounded-xl bg-(--ad-line)" />
            </div>
          ) : error ? (
            <div className="m-6 rounded-xl border border-(--ad-ink)/20 bg-(--ad-surface-2) px-4 py-3 text-[13px] text-(--ad-ink)">{error}</div>
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
                  <div className="mb-5 rounded-xl border px-4 py-3.5" style={{ background: 'var(--amber-tint)', borderColor: 'var(--ad-green-line)' }}>
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
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-(--ad-ink-soft)" />
                        </div>
                        <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                          {unwrittenFollowUpsText(unwrittenSteps.length, {
                            stopped: !!sequence.stopped_because || !!sequence.followups_stopped,
                            stoppedBecause: sequence.stopped_because,
                            firstEmailSent: !!steps[0]?.sent_at,
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <section className="lp-section">
                  <div className="lp-eyebrow">Their replies</div>
                  {sequence.replies.length === 0 ? (
                    <p className="m-0 text-[13px] text-(--ad-ink-soft)">No replies on record for this prospect yet.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {sequence.replies.map((r, i) => (
                        <div key={r.id ?? i} className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--line)' }}>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            {r.intent && (
                              <span className="text-[10.5px] font-semibold uppercase tracking-[.06em]" style={{ color: intentStyle(r.intent).color }}>{intentStyle(r.intent).label}</span>
                            )}
                            <span className="text-[11px] text-(--ad-ink-soft)">{formatShortDate(r.received_at)}</span>
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
    body { margin:0; padding:12px 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size:13.5px; line-height:1.6; color:var(--ad-ink); word-wrap:break-word; }
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
  const pill = STEP_STATE_PILL[step.state] ?? { bg: 'var(--ad-surface-2)', text: 'var(--ad-ink-soft)' };
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
                className="w-full rounded-lg border border-(--ad-green) bg-(--ad-surface) px-3 py-2 text-[13px] font-semibold text-(--ad-ink) outline-none"
              />
            )}
            <textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              aria-label={`${step.step} body`}
              rows={Math.max(6, bodyDraft.split('\n').length + 1)}
              style={FONT}
              className="w-full resize-y rounded-lg border border-(--ad-green) bg-(--ad-surface) px-3 py-2 text-[13px] leading-relaxed text-(--ad-ink) outline-none"
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
                style={{ borderColor: 'var(--line)', minHeight: 180, background: 'var(--ad-surface)' }}
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
