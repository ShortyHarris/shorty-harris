import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Clock, Send, PencilLine, AlertCircle, Undo2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  useSendQueue, SEND_WINDOWS, SEND_QUEUE_SORTS, skippedLine,
  type QueuedMessage, type SendWindow, type SendQueueSort, type BulkQueueResult,
} from '../hooks/useSendQueue';
import { useOverlayClose } from '../hooks/useOverlayClose';
import { confirmDiscard } from '../lib/confirmDiscard';
import { approvalTypeLabel, APPROVAL_STEP_ORDER } from '../lib/approvalLabels';
import { BlockBadge } from './BlockBadge';
import { AnglePill, ObservationDetails, SignOffWarning } from './ApprovalCells';
import { ConfirmDialog } from './ConfirmDialog';
import { ModalClose } from './ModalClose';
import { SkeletonTable } from './Skeleton';
import { actionBtn } from '../lib/actionButtons';
import { formatPastTime, sendTimeText } from '../lib/sendQueueView';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

// The send queue: approved emails that have not gone out yet. Shared by the client's Approvals
// page (Approved tab, one client) and the admin Send queue page (every client, with a client
// filter). Anyone allowed to change the queue can open an email, correct it and keep it approved,
// move it back to Pending, or cancel it, until the sender picks it up.

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const PAGE_SIZE = 10;
const ALL = 'all';

const TYPE_OPTIONS = [
  { value: ALL, label: 'All' },
  ...APPROVAL_STEP_ORDER.map((t) => ({ value: t as string, label: approvalTypeLabel(t) })),
];

function SendTime({ item }: { item: QueuedMessage }) {
  const text = sendTimeText(item);
  const due = !item.sending && item.due;
  const estimate = !item.sending && !due && item.estimated_send_at && !item.is_confirmed;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className={item.sending ? 'inline-flex items-center gap-1 font-semibold text-(--ad-green)' : item.estimated_send_at ? 'font-semibold text-(--ad-ink)' : 'italic text-(--ad-ink-soft)'}>
        {item.sending && <Send size={12} strokeWidth={2} aria-hidden />}
        {text}
      </span>
      {due && (
        <span className="text-[11px] text-(--ad-ink-soft)" title="It is due now and goes out on the next send run, inside the send window and the daily limit.">
          due, next send run
        </span>
      )}
      {estimate && (
        <span className="text-[11px] text-(--ad-ink-soft)" title="Based on the queue order and the daily sending limit. It moves if emails ahead of it are pulled back or the limit changes.">
          estimate
        </span>
      )}
    </span>
  );
}

function FilterSelect({ label, ariaLabel, value, onChange, options, className = '' }: {
  label: string; ariaLabel: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        style={FONT}
        aria-label={ariaLabel}
        className={`h-10 min-w-0 max-w-full basis-0 shrink max-md:basis-full gap-2 rounded-lg border-(--ad-line) bg-(--ad-surface-2) px-3 text-[13px] font-semibold text-(--ad-ink) focus:border-(--ad-green) focus:ring-0 focus:ring-offset-0 ${className}`}
      >
        <span className="w-16 shrink-0 text-left text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-soft)">{label}</span>
        <span className="min-w-0 flex-1 truncate text-left"><SelectValue /></span>
      </SelectTrigger>
      <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function StatusTags({ item }: { item: QueuedMessage }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {item.message_type !== 'initial' && (
        <span className="atbl-pill" style={{ background: 'var(--ad-green-tint)', color: 'var(--ad-green)' }}>
          {approvalTypeLabel(item.message_type)}
        </span>
      )}
      <AnglePill angle={item.angle} />
      {item.queue_edited_at && (
        <span className="atbl-pill inline-flex items-center gap-1" style={{ background: 'var(--ad-surface-2)', color: 'var(--ad-ink-soft)' }} title="The copy was corrected after it was approved">
          <PencilLine size={10} strokeWidth={2} aria-hidden /> Edited
        </span>
      )}
    </div>
  );
}

type Pending =
  | { kind: 'unapprove' | 'cancel'; items: QueuedMessage[] }
  | null;

export function SendQueue({
  clientId, client = supabase, readOnly = false, toast, readOnlyMessage, compact = false,
}: {
  /** One client, or null for every client (admins only). */
  clientId: string | null;
  /** Session that reads the queue (the impersonation session in View-as-client). */
  client?: SupabaseClient;
  readOnly?: boolean;
  toast: (text: string, tone?: 'success' | 'error' | 'warning') => void;
  readOnlyMessage?: string;
  /** Inside the Approvals page: no intro paragraph. */
  compact?: boolean;
}) {
  const [clientFilter, setClientFilter] = useState<string>(ALL);
  const [campaignFilter, setCampaignFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [windowFilter, setWindowFilter] = useState<SendWindow>('all');
  const [sort, setSort] = useState<SendQueueSort>('send_asc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<string, QueuedMessage>>(new Map());
  const [openItem, setOpenItem] = useState<QueuedMessage | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const effectiveClient = clientId ?? (clientFilter === ALL ? null : clientFilter);
  const { queue, loading, error, edit, unapprove, cancel } = useSendQueue({
    clientId: effectiveClient,
    campaignId: campaignFilter === ALL ? null : campaignFilter,
    window: windowFilter,
    messageType: typeFilter === ALL ? null : typeFilter,
    sort,
    page,
    pageSize: PAGE_SIZE,
  }, client);

  const rows = queue?.rows ?? [];
  const total = queue?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (queue && page > totalPages) setPage(totalPages);
  const allClientsMode = clientId === null;

  function resetPage() { setPage(1); setSelected(new Map()); }
  function guard(): boolean {
    if (readOnly) { toast(readOnlyMessage ?? "You're viewing read-only.", 'warning'); return false; }
    return true;
  }

  const selectable = rows.filter((r) => !r.sending);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  function toggle(item: QueuedMessage) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allSelected) selectable.forEach((r) => next.delete(r.id));
      else selectable.forEach((r) => next.set(r.id, r));
      return next;
    });
  }

  function report(res: BulkQueueResult, verb: string) {
    if (res.error) { toast(`Couldn't ${verb}: ${res.error}`, 'error'); return; }
    const skipped = skippedLine(res.skipped);
    const what = `${res.done} email${res.done === 1 ? '' : 's'}`;
    const msg = verb === 'move back to pending' ? `${what} moved back to Pending.` : `${what} cancelled. ${res.done === 1 ? 'It' : 'They'} won't be sent.`;
    toast(skipped ? `${msg} ${skipped}.` : msg, skipped ? 'warning' : 'success');
  }

  async function runConfirmed() {
    if (!confirm) return;
    setBusy(true);
    const res = confirm.kind === 'unapprove' ? await unapprove(confirm.items) : await cancel(confirm.items);
    setBusy(false);
    report(res, confirm.kind === 'unapprove' ? 'move back to pending' : 'cancel');
    setSelected((prev) => {
      const next = new Map(prev);
      confirm.items.forEach((i) => next.delete(i.id));
      return next;
    });
    if (openItem && confirm.items.some((i) => i.id === openItem.id) && !res.error) setOpenItem(null);
    setConfirm(null);
  }

  function ask(kind: 'unapprove' | 'cancel', items: QueuedMessage[]) {
    if (!guard() || items.length === 0) return;
    setConfirm({ kind, items });
  }

  async function saveEdits(item: QueuedMessage, subject?: string, body?: string): Promise<boolean> {
    if (!guard()) return false;
    const { error: err } = await edit(item, subject, body);
    if (err) { toast(`Couldn't save: ${err}`, 'error'); return false; }
    toast('Changes saved. The email stays approved and keeps its place in the queue.');
    setOpenItem((cur) => (cur?.id === item.id ? { ...cur, subject: subject ?? cur.subject, body: body ?? cur.body, queue_edited_at: new Date().toISOString() } : cur));
    return true;
  }

  const campaignOptions = [
    { value: ALL, label: 'All' },
    ...(queue?.campaigns ?? [])
      .filter((c) => !allClientsMode || effectiveClient === null || c.client_id === effectiveClient)
      .map((c) => ({ value: c.id, label: `${c.name ?? 'Untitled campaign'} (${c.count})` })),
  ];
  // Keep a picked campaign selectable even while the list it came from is reloading.
  if (campaignFilter !== ALL && !campaignOptions.some((o) => o.value === campaignFilter)) {
    campaignOptions.push({ value: campaignFilter, label: 'Selected campaign' });
  }
  const clientOptions = [
    { value: ALL, label: 'All clients' },
    ...(queue?.clients ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.count})` })),
  ];
  if (clientFilter !== ALL && !clientOptions.some((o) => o.value === clientFilter)) {
    clientOptions.push({ value: clientFilter, label: 'Selected client' });
  }
  const filtersActive = clientFilter !== ALL || campaignFilter !== ALL || typeFilter !== ALL || windowFilter !== 'all' || sort !== 'send_asc';

  return (
    <div style={FONT} className="flex flex-col gap-3" data-testid="send-queue">
      {!compact && (
        <p className="m-0 text-[13px] leading-relaxed text-(--ad-ink-soft)">
          Approved emails waiting to go out, soonest first. Open one to check or correct the copy: saving keeps it approved and in its place.
          Move it back to Pending to re-approve it later, or cancel it so it never sends. Once an email shows <strong className="text-(--ad-ink)">Sending now</strong> it can no longer be changed.
        </p>
      )}

      {/* Send window chips */}
      <div role="group" aria-label="Send window" className="flex flex-wrap gap-1.5">
        {SEND_WINDOWS.map((w) => (
          <button
            key={w.value}
            onClick={() => { setWindowFilter(w.value); resetPage(); }}
            aria-pressed={windowFilter === w.value}
            className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ad-green) active:translate-y-px ${
              windowFilter === w.value
                ? 'border-(--ad-green) bg-(--ad-green-tint) text-(--ad-green-hover)'
                : 'border-(--ad-line) bg-(--ad-surface) text-(--ad-ink-soft) hover:bg-(--ad-surface-2)'
            }`}
          >
            {w.label}{queue ? ` (${queue.windows[w.value]})` : ''}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5 md:flex-nowrap rounded-xl border border-(--ad-line) bg-(--ad-surface) p-2.5">
        {allClientsMode && (
          <FilterSelect label="Client" ariaLabel="Filter by client" className="grow-3" value={clientFilter}
            onChange={(v) => { setClientFilter(v); setCampaignFilter(ALL); resetPage(); }} options={clientOptions} />
        )}
        <FilterSelect label="Campaign" ariaLabel="Filter by campaign" className="grow-3" value={campaignFilter}
          onChange={(v) => { setCampaignFilter(v); resetPage(); }} options={campaignOptions} />
        <FilterSelect label="Type" ariaLabel="Filter by email type" className="grow-2" value={typeFilter}
          onChange={(v) => { setTypeFilter(v); resetPage(); }} options={TYPE_OPTIONS} />
        <FilterSelect label="Sort" ariaLabel="Sort the send queue" className="grow-3" value={sort}
          onChange={(v) => { setSort(v as SendQueueSort); resetPage(); }} options={SEND_QUEUE_SORTS} />
        {filtersActive && (
          <button
            onClick={() => { setClientFilter(ALL); setCampaignFilter(ALL); setTypeFilter(ALL); setWindowFilter('all'); setSort('send_asc'); resetPage(); }}
            className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1.5 text-[12.5px] font-semibold text-(--ad-ink-soft) underline-offset-2 hover:text-(--ad-ink) hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-(--ad-line) bg-(--ad-surface-2) px-4 py-3 text-[13px] text-(--ad-ink)">
          Couldn't load the send queue: {error}
        </div>
      )}

      {loading || !queue ? (
        <SkeletonTable rows={PAGE_SIZE} cols={4} />
      ) : total === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-semibold text-(--ad-ink)">
            {queue.windows.all > 0 || filtersActive ? 'Nothing matches these filters.' : 'Nothing approved and waiting.'}
          </strong>
          <span className="text-[13px] text-(--ad-ink-soft)">
            {queue.windows.all > 0 || filtersActive ? 'Choose "All" to see the whole queue.' : 'Approved emails that are waiting to send show up here.'}
          </span>
        </div>
      ) : (
        <>
          {/* Selection bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--ad-line) bg-(--ad-surface) px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-(--ad-ink-soft)">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectable.length === 0} className="accent-(--ad-green)" />
              Select page
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-[12.5px] text-(--ad-ink-soft)">
                {selected.size > 0 ? `${selected.size} selected` : `${total} waiting to send`}
              </span>
              {selected.size > 0 && (
                <>
                  <button onClick={() => ask('unapprove', Array.from(selected.values()))} disabled={busy} className={actionBtn('secondary')}>
                    <Undo2 size={14} strokeWidth={2.2} aria-hidden /> Move back to pending
                  </button>
                  <button onClick={() => ask('cancel', Array.from(selected.values()))} disabled={busy} className={actionBtn('dangerOutline')}>
                    <XCircle size={14} strokeWidth={2.2} aria-hidden /> Cancel selected
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              <colgroup>
                <col className="w-9" />
                <col className="w-[27%]" />
                <col className="w-[35%]" />
                <col className="w-[18%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="w-9" />
                  <th>Prospect</th>
                  <th>Subject</th>
                  <th>Sends</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} onClick={() => setOpenItem(item)} className="cursor-pointer" data-testid="send-queue-row">
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.prospect?.business_name ?? 'email'}`}
                        checked={selected.has(item.id)}
                        disabled={item.sending}
                        onChange={() => toggle(item)}
                        className="accent-(--ad-green)"
                      />
                    </td>
                    <td className="min-w-0">
                      <div className="line-clamp-2 font-semibold text-(--ad-ink)">{item.prospect?.business_name ?? 'Unknown'}</div>
                      <div className="mt-0.5 truncate text-[11px] text-(--ad-ink-soft)">
                        {[allClientsMode ? item.client_name : null, item.campaign_name].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="min-w-0 text-(--ad-ink-soft)">
                      <div className="line-clamp-2" title={item.subject ?? undefined}>
                        {item.subject ?? <span className="italic text-(--ad-ink-ghost)">No subject</span>}
                      </div>
                      <StatusTags item={item} />
                      {item.category === 'blocked' && <BlockBadge reason={item.block_reason} campaignStatus={item.campaign_status} className="mt-1" />}
                      {item.sign_off_missing_name && <SignOffWarning className="mt-1" />}
                    </td>
                    <td className="text-[12.5px]"><SendTime item={item} /></td>
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-nowrap items-center justify-end gap-1.5">
                        <button onClick={() => setOpenItem(item)} className={actionBtn('secondary', 'sm')}>Review</button>
                        <button onClick={() => ask('cancel', [item])} disabled={item.sending} title={item.sending ? 'Being sent right now' : 'Cancel this email'} className={actionBtn('dangerGhost', 'sm')}>
                          <XCircle size={14} strokeWidth={2.2} aria-hidden /> Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((item) => (
              <div key={item.id} className="rounded-xl border border-(--ad-line) bg-(--ad-surface) p-4">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.prospect?.business_name ?? 'email'}`}
                    checked={selected.has(item.id)}
                    disabled={item.sending}
                    onChange={() => toggle(item)}
                    className="mt-1 shrink-0 accent-(--ad-green)"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-(--ad-ink)">{item.prospect?.business_name ?? 'Unknown'}</div>
                    <div className="truncate text-[11px] text-(--ad-ink-soft)">
                      {[allClientsMode ? item.client_name : null, item.campaign_name].filter(Boolean).join(' · ')}
                    </div>
                    {item.subject && <div className="mt-1.5 truncate text-[12px] text-(--ad-ink-soft)">{item.subject}</div>}
                    <StatusTags item={item} />
                    {item.category === 'blocked' && <BlockBadge reason={item.block_reason} campaignStatus={item.campaign_status} className="mt-1" />}
                    <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                      <Clock size={12} strokeWidth={2} className="shrink-0 text-(--ad-ink-soft)" aria-hidden />
                      <SendTime item={item} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-(--ad-surface-2) pt-3">
                  <button onClick={() => setOpenItem(item)} className={actionBtn('secondary', 'md', 'flex-1')}>Review</button>
                  <button onClick={() => ask('cancel', [item])} disabled={item.sending} className={actionBtn('dangerGhost', 'md')}>
                    <XCircle size={14} strokeWidth={2.2} aria-hidden /> Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-(--ad-line) bg-(--ad-surface) px-4 py-3 text-[12.5px] text-(--ad-ink-soft)">
              <span>Page {Math.min(page, totalPages)} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(page - 1)} disabled={page <= 1} className={actionBtn('secondary', 'sm')}>Previous</button>
                <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className={actionBtn('secondary', 'sm')}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {openItem && (
          <QueuedMessageModal
            key="queued-modal"
            item={openItem}
            readOnly={readOnly}
            showClient={allClientsMode}
            onClose={() => setOpenItem(null)}
            onSave={saveEdits}
            onUnapprove={(item) => ask('unapprove', [item])}
            onCancel={(item) => ask('cancel', [item])}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirm && (
          <ConfirmDialog
            key="queue-confirm"
            title={confirm.kind === 'unapprove'
              ? `Move ${confirm.items.length === 1 ? 'this email' : `${confirm.items.length} emails`} back to Pending?`
              : `Cancel ${confirm.items.length === 1 ? 'this email' : `${confirm.items.length} emails`}?`}
            confirmLabel={confirm.kind === 'unapprove' ? 'Move to Pending' : 'Cancel email'}
            cancelLabel="Keep in queue"
            danger={confirm.kind === 'cancel'}
            busy={busy}
            onConfirm={runConfirmed}
            onCancel={() => setConfirm(null)}
          >
            {confirm.kind === 'unapprove'
              ? <>{confirm.items.length === 1 ? 'It leaves' : 'They leave'} the send queue and {confirm.items.length === 1 ? 'waits' : 'wait'} on the Pending tab for approval again. Nothing is deleted, and you can edit before re-approving.</>
              : <>{confirm.items.length === 1 ? 'It' : 'They'} won't be sent, and any follow-ups still planned for {confirm.items.length === 1 ? 'that prospect' : 'those prospects'} are cancelled too. This can't be undone. To fix the copy instead, open the email and edit it, or move it back to Pending.</>}
          </ConfirmDialog>
        )}
      </AnimatePresence>
    </div>
  );
}

function Detail({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-semibold text-(--ad-ink-soft)">{label}</dt>
      <dd className="m-0 mt-0.5 wrap-break-word text-(--ad-ink)">{children}</dd>
    </div>
  );
}

function QueuedMessageModal({ item, readOnly, showClient, onClose, onSave, onUnapprove, onCancel }: {
  item: QueuedMessage;
  readOnly: boolean;
  showClient: boolean;
  onClose: () => void;
  onSave: (item: QueuedMessage, subject?: string, body?: string) => Promise<boolean>;
  onUnapprove: (item: QueuedMessage) => void;
  onCancel: (item: QueuedMessage) => void;
}) {
  const [subject, setSubject] = useState(item.subject ?? '');
  const [body, setBody] = useState(item.body);
  const [saving, setSaving] = useState(false);
  const subjectDirty = subject.trim() !== (item.subject ?? '').trim();
  const bodyDirty = body.trim() !== item.body.trim();
  const dirty = subjectDirty || bodyDirty;
  const locked = readOnly || item.sending;
  const requestClose = () => { if (confirmDiscard(dirty)) onClose(); };

  async function save() {
    setSaving(true);
    try { await onSave(item, subjectDirty ? subject : undefined, bodyDirty ? body : undefined); }
    finally { setSaving(false); }
  }

  const inputCls = 'w-full rounded-xl border border-(--ad-line-strong) bg-(--ad-surface) text-[13px] text-(--ad-ink) outline-none focus:border-(--ad-green) disabled:bg-(--ad-surface-2) disabled:text-(--ad-ink-soft)';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-[rgba(14,8,34,0.45)] md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(requestClose, { escape: true })}
    >
      <motion.div
        style={FONT}
        role="dialog"
        aria-modal="true"
        aria-label="Queued email"
        className="modal-card flex h-full w-full flex-col overflow-hidden bg-(--ad-surface) md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[640px] md:rounded-md md:border md:border-(--ad-line)"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-(--ad-line) px-5 py-4">
          <div className="min-w-0">
            <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Approved, waiting to send</h2>
            <p className="m-0 mt-0.5 truncate text-[12px] text-(--ad-ink-soft)">
              {item.prospect?.business_name ?? 'Unknown'}
              {item.prospect?.email && <><span className="mx-1.5 text-(--ad-ink-ghost)">·</span>{item.prospect.email}</>}
              <span className="mx-1.5 text-(--ad-ink-ghost)">·</span>{approvalTypeLabel(item.message_type)}
            </p>
          </div>
          <ModalClose onClick={requestClose} />
        </div>

        <div className="modal-scroll flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {item.sending && (
            <p role="status" className="m-0 flex items-start gap-2 rounded-xl border border-(--ad-green-line) bg-(--ad-green-tint) px-3.5 py-2.5 text-[12.5px] text-(--ad-green-hover)">
              <Send size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
              This email is being sent right now, so it can no longer be changed.
            </p>
          )}
          {item.subject !== null && (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-(--ad-ink)">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} style={FONT}
                className={`${inputCls} px-3.5 py-2.5 font-semibold`} />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-(--ad-ink)">Message body</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} style={FONT}
              rows={Math.max(8, body.split('\n').length + 1)}
              className={`${inputCls} resize-y px-4 py-3 leading-relaxed`} />
          </label>
          {item.sign_off_missing_name && <SignOffWarning />}

          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-3 text-[12px] text-(--ad-ink-soft)">
            <Detail label="Sends"><SendTime item={item} /></Detail>
            <Detail label="Campaign">{item.campaign_name ?? '-'}</Detail>
            {showClient && <Detail label="Client">{item.client_name}</Detail>}
            <Detail label="Approved">{item.approved_at ? formatPastTime(item.approved_at, item.time_zone) : '-'}</Detail>
            {item.queue_edited_at && <Detail label="Last edited">{formatPastTime(item.queue_edited_at, item.time_zone)}</Detail>}
            <Detail label="Prospect">{[item.prospect?.contact_name, item.prospect?.category, item.prospect?.location].filter(Boolean).join(' · ') || '-'}</Detail>
            <ObservationDetails observation={item.observation} sourceUrl={item.observation_source_url} Detail={Detail} />
          </dl>
          {item.category === 'blocked' && <BlockBadge reason={item.block_reason} campaignStatus={item.campaign_status} />}
          {readOnly && (
            <p className="m-0 flex items-start gap-2 text-[12.5px] text-(--ad-ink-soft)">
              <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
              Read-only view: changes are turned off.
            </p>
          )}
        </div>

        {/* Phone: one column, the expected action first and the destructive one last.
            Desktop: destructive on the far left, away from Save; safe actions on the right. */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-(--ad-line) px-5 py-4 md:flex-row md:items-center md:gap-2.5">
          <button onClick={save} disabled={locked || !dirty || saving}
            className={actionBtn('primary', 'lg', 'w-full md:order-3 md:w-auto')}
            title={dirty ? 'Save the changes; the email stays approved' : 'Change the subject or message to save'}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button onClick={() => onUnapprove(item)} disabled={locked || saving}
            className={actionBtn('secondary', 'lg', 'w-full md:order-2 md:w-auto')}
            title="Take it out of the send queue and put it back on the Pending tab">
            <Undo2 size={15} strokeWidth={2.2} aria-hidden /> Move back to pending
          </button>
          <button onClick={() => onCancel(item)} disabled={locked || saving}
            className={actionBtn('dangerGhost', 'lg', 'w-full md:order-1 md:mr-auto md:w-auto')}>
            <XCircle size={15} strokeWidth={2.2} aria-hidden /> Cancel email
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
