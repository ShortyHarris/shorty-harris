import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApprovalQueue } from '../../hooks/useApprovalQueue';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { SkeletonTable } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { RowMenu } from '../../components/RowMenu';
import { useToast, ToastHost } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { partialFailureMessage } from '../../lib/chunkedBulk';
import type { QueueItem } from '../../types';
import { Clock, CheckCircle2, Send, Ban, Eye, AlertTriangle, RefreshCw } from 'lucide-react';

const TOO_MANY_MSG = 'Too many to act on at once - narrow by client.';
const GMAIL_TOOLTIP ="This client needs to connect their Gmail from Settings before messages can be sent";

function senderBlocked(item: QueueItem): boolean {
  return !item.sender_email || item.sender_status !== 'active';
}

const HELP: HelpContent = {
  title: 'Approval Queue',
  body: [
    { type: 'p', text: "Every email the AI drafts lands here before it goes anywhere. Nothing sends until you approve it." },
    { type: 'p', text: "Read the draft, edit the copy if you want to tweak it, then Approve or Reject." },
    { type: 'ul', items: [
      "Approve - sends the message exactly as written",
      "Edit then approve - change the copy first, then send",
      "Reject - discards the draft; the prospect receives nothing",
    ]},
  ],
};

const TYPE_LABEL: Record<string, string> = {
  initial: 'First touch',
  follow_up_d3: 'Follow-up D3',
  follow_up_d7: 'Follow-up D7',
  follow_up_d14: 'Follow-up D14',
};

const PAGE_SIZE = 10;
const ALL_CLIENTS = 'all';

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

export function ApprovalQueue() {
  const { items: allItems, stats, loading, isFetching, dataUpdatedAt, error, approve, bulkApprove, saveEdits, reject, reload, truncated } = useApprovalQueue();
  const { toasts, toast, dismiss } = useToast();
  async function doApprove(id: string, body?: string, subject?: string) {
    const { error: err } = await approve(id, body, subject);
    if (err) toast(`Couldn't approve the email: ${err}`, 'error');
    else toast(body !== undefined || subject !== undefined ? 'Edits saved and email approved.' : 'Email approved.');
  }
  async function doSave(id: string, body?: string, subject?: string) {
    const { error: err } = await saveEdits(id, body, subject);
    if (err) { toast(`Couldn't save the draft: ${err}`, 'error'); return; }
    toast('Draft saved');
    // Re-baseline the open modal so it's no longer dirty.
    setEditItem((cur) => (cur?.id === id ? { ...cur, body: body ?? cur.body, subject: subject ?? cur.subject } : cur));
  }
  async function doReject(id: string) {
    const { error: err } = await reject(id);
    if (err) toast(`Couldn't reject the email: ${err}`, 'error'); else toast('Email rejected.');
  }
  const [editItem, setEditItem] = useState<QueueItem | null>(null);
  const [page, setPage] = useState(1);
  const [clientFilter, setClientFilter] = useState<string>(ALL_CLIENTS);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const queueRef = useRef<HTMLDivElement | null>(null);

  // Clients with drafts waiting, busiest first, for the filter dropdown.
  const clientOptions = Array.from(
    allItems.reduce((acc, i) => {
      if (!i.client_id) return acc;
      const cur = acc.get(i.client_id);
      acc.set(i.client_id, { id: i.client_id, name: i.client?.business_name ?? 'Unknown client', count: (cur?.count ?? 0) + 1 });
      return acc;
    }, new Map<string, { id: string; name: string; count: number }>()).values()
  ).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Fall back to everything once the filtered client's queue empties out.
  const activeFilter = clientOptions.some((c) => c.id === clientFilter) ? clientFilter : ALL_CLIENTS;
  const items = activeFilter === ALL_CLIENTS ? allItems : allItems.filter((i) => i.client_id === activeFilter);
  const activeClient = clientOptions.find((c) => c.id === activeFilter) ?? null;
  const approvable = items.filter((i) => !senderBlocked(i));

  async function doBulkApprove() {
    if (truncated) { toast(TOO_MANY_MSG, 'warning'); setConfirmBulk(false); return; }
    setBulkBusy(true);
    const res = await bulkApprove(approvable.map((i) => i.id));
    setBulkBusy(false);
    setConfirmBulk(false);
    if (res.failedBatches > 0) { toast(partialFailureMessage(res, 'approved', 'approve the emails'), 'error'); return; }
    toast(`${res.affected} email${res.affected === 1 ? '' : 's'} approved for ${activeClient?.name ?? 'this client'}.`);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const scrollToQueue = () => queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  async function handleRefresh() {
    try {
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to refresh approvals.', 'error');
    }
  }

  const pagBtnCls = 'cursor-pointer rounded-md border border-(--ad-line-strong) bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-(--ad-ink) transition-colors hover:bg-(--ad-surface-2) disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div style={FONT} className="flex flex-col gap-6">

      {/* Header */}
      <header className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-(--ad-ink)"> <img src="https://cdn-icons-png.flaticon.com/128/5442/5442020.png" alt="Approvals" className="w-10 h-10" />Approvals</h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">
            Nothing sends until you approve it. Review each draft, edit if needed, then approve or reject.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dataUpdatedAt > 0 && (
            <span className="whitespace-nowrap text-[11px] text-(--ad-ink-faint) max-md:hidden">
              {isFetching ? 'Updating…' : `Updated ${formatRelativeTime(dataUpdatedAt)}`}
            </span>
          )}
          <HelpButton content={HELP} />
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-line-strong) hover:bg-(--ad-surface-2) disabled:cursor-not-allowed disabled:opacity-60 max-md:px-2.5"
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            <span className="max-md:hidden">Refresh</span>
          </button>
        </div>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={Clock}
          iconColor="var(--ad-orange)"
          label="Awaiting Review"
          value={stats.pending}
          sub={stats.pending > 0 ? 'needs your decision' : 'queue is clear'}
          subColor={stats.pending > 0 ? 'var(--ad-orange)' : 'var(--ad-ink-faint)'}
          onClick={stats.pending > 0 ? scrollToQueue : undefined}
        />
        <StatTile
          icon={CheckCircle2}
          iconColor="var(--ad-green)"
          label="Approved Today"
          value={stats.approvedToday}
          sub="emails approved"
          subColor="var(--ad-ink-faint)"
        />
        <StatTile
          icon={Send}
          iconColor="var(--ad-green)"
          label="Sent Today"
          value={stats.sentToday}
          sub="emails delivered"
          subColor="rgba(255,255,255,0.55)"
          accent
        />
        <StatTile
          icon={Ban}
          iconColor="var(--ad-clay)"
          label="Rejected"
          value={stats.rejected}
          sub="drafts discarded"
          subColor="var(--ad-ink-faint)"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">
          Couldn't load the queue: {error}
        </div>
      )}

      {truncated && (
        <div className="rounded-xl border border-(--ad-amber)/30 bg-(--ad-amber-tint) px-4 py-3 text-[13px] text-(--ad-amber)">
          {TOO_MANY_MSG} Only the oldest {allItems.length} of {stats.pending} pending drafts are loaded.
        </div>
      )}

      {/* Client filter + per-client bulk approve */}
      {!loading && clientOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Select value={activeFilter} onValueChange={(v) => { setClientFilter(v); setPage(1); }}>
            <SelectTrigger style={FONT} aria-label="Filter by client" className="h-10 w-70 max-w-full rounded-lg border-(--ad-line) bg-(--ad-surface) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)"><SelectValue /></SelectTrigger>
            <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
              <SelectItem value={ALL_CLIENTS}>All clients ({allItems.length})</SelectItem>
              {clientOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name} ({c.count})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeClient && (
            <button
              onClick={() => setConfirmBulk(true)}
              disabled={approvable.length === 0 || truncated}
              title={truncated ? TOO_MANY_MSG : approvable.length === 0 ? GMAIL_TOOLTIP : undefined}
              className="cursor-pointer rounded-md border-0 bg-(--ad-green) px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-(--ad-green-hover) disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve all {approvable.length} for {activeClient.name}
            </button>
          )}
        </div>
      )}

      {/* Table / Cards */}
      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={5} />
      ) : items.length === 0 ? (
        <div ref={queueRef} className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-bold text-(--ad-ink)">Queue's clear.</strong>
          <span className="text-[13px] text-(--ad-ink-soft)">No drafts waiting for review. New ones appear here as the AI writes them.</span>
        </div>
      ) : (
        <div ref={queueRef} className="flex flex-col gap-6">
          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[28%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr>
                  {(['Prospect', 'Client', 'Type', 'Subject', ''] as const).map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((item) => (
                  <tr key={item.id}>
                    <td className="min-w-0">
                      <div className="truncate font-bold text-(--ad-ink)" title={item.prospect?.business_name ?? undefined}>
                        {item.prospect?.business_name ?? 'Unknown'}
                      </div>
                      {item.prospect?.contact_name && (
                        <div className="mt-0.5 truncate text-[11px] text-(--ad-ink-faint)">{item.prospect.contact_name}</div>
                      )}
                      <ProspectMeta item={item} className="mt-0.5" />
                    </td>
                    <td className="min-w-0 text-(--ad-ink-soft)">
                      <div className="truncate" title={item.client?.business_name ?? undefined}>{item.client?.business_name ?? '-'}</div>
                      <SenderLine item={item} className="mt-0.5" />
                    </td>
                    <td>
                      <span className="atbl-pill" style={{ background: 'var(--ad-green-tint)', color: 'var(--ad-green)' }}>
                        {TYPE_LABEL[item.message_type] ?? item.message_type}
                      </span>
                    </td>
                    <td className="min-w-0 text-(--ad-ink-soft)">
                      <div className="truncate" title={item.subject ?? undefined}>
                        {item.subject ?? <span className="italic text-(--ad-ink-ghost)">No subject</span>}
                      </div>
                      <OpenBadge item={item} />
                    </td>
                    <td className="px-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => doApprove(item.id)}
                          disabled={senderBlocked(item)}
                          title={senderBlocked(item) ? GMAIL_TOOLTIP : undefined}
                          className="cursor-pointer rounded-md border-0 bg-(--ad-green) px-3.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-(--ad-green-hover) disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <RowMenu items={[
                          { type: 'action', label: 'Edit', onClick: () => setEditItem(item) },
                          { type: 'action', label: 'Reject', destructive: true, onClick: () => doReject(item.id) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            {paged.map((item) => (
              <div key={item.id} className="rounded-xl border border-(--ad-line) bg-(--ad-surface) p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-(--ad-ink) truncate">{item.prospect?.business_name ?? 'Unknown'}</div>
                    {item.prospect?.contact_name && (
                      <div className="mt-0.5 text-[11px] text-(--ad-ink-faint)">{item.prospect.contact_name}</div>
                    )}
                    <ProspectMeta item={item} className="mt-0.5" />
                  </div>
                  <span className="flex-shrink-0 inline-flex items-center whitespace-nowrap rounded-full bg-(--ad-green-tint) px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em] text-(--ad-green)">
                    {TYPE_LABEL[item.message_type] ?? item.message_type}
                  </span>
                </div>
                {item.client?.business_name && (
                  <div className="mt-1.5 truncate text-[12px] text-(--ad-ink-soft)">{item.client.business_name}</div>
                )}
                <SenderLine item={item} className="mt-0.5" />
                {item.subject && (
                  <div className="mt-1 truncate text-[12px] text-(--ad-ink-faint)">{item.subject}</div>
                )}
                <OpenBadge item={item} className="mt-1" />
                <div className="mt-3 flex items-center gap-2 border-t border-(--ad-fill) pt-3">
                  <button
                    onClick={() => doApprove(item.id)}
                    disabled={senderBlocked(item)}
                    title={senderBlocked(item) ? GMAIL_TOOLTIP : undefined}
                    className="cursor-pointer flex-1 rounded-md border-0 bg-(--ad-green) px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-(--ad-green-hover) disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <RowMenu items={[
                    { type: 'action', label: 'Edit', onClick: () => setEditItem(item) },
                    { type: 'action', label: 'Reject', destructive: true, onClick: () => doReject(item.id) },
                  ]} />
                </div>
              </div>
            ))}
          </div>

          {/* Shared pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-(--ad-line) bg-(--ad-surface) px-4 py-3 text-[12.5px] text-(--ad-ink-faint)">
              <span>Page {safePage} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className={pagBtnCls}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className={pagBtnCls}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {editItem && (
          <EditModal
            key="edit-modal"
            item={editItem}
            onClose={() => setEditItem(null)}
            onSave={doSave}
            onApprove={(id, body, subject) => { doApprove(id, body, subject); setEditItem(null); }}
          />
        )}
        {confirmBulk && activeClient && (
          <ConfirmDialog
            key="bulk-confirm"
            title={`Approve ${approvable.length} email${approvable.length === 1 ? '' : 's'} for ${activeClient.name}?`}
            confirmLabel="Approve all"
            busy={bulkBusy}
            onConfirm={doBulkApprove}
            onCancel={() => setConfirmBulk(false)}
          >
            They'll go out from {activeClient.name}'s mailbox exactly as drafted, and you'll be recorded as the approver.
            {approvable.length < items.length && (
              <> {items.length - approvable.length} draft{items.length - approvable.length === 1 ? ' is' : 's are'} skipped because the sender's Gmail isn't connected.</>
            )}
          </ConfirmDialog>
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function ProspectMeta({ item, className = '' }: { item: QueueItem; className?: string }) {
  const location = item.prospect?.location;
  const phone    = item.prospect?.phone;
  if (!location && !phone) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-(--ad-ink-faint) ${className}`}>
      {location && <span>{location}</span>}
      {location && phone && <span className="text-(--ad-ink-ghost)">·</span>}
      {phone && <span className="font-mono">{formatPhone(phone)}</span>}
    </div>
  );
}

function SenderLine({ item, className = '' }: { item: QueueItem; className?: string }) {
  if (senderBlocked(item)) {
    return (
      <div title={GMAIL_TOOLTIP} className={`flex min-w-0 items-center gap-1 text-[11px] font-semibold text-(--ad-clay) ${className}`}>
        <AlertTriangle size={11} strokeWidth={2.2} className="shrink-0" />
        <span className="truncate">Gmail not connected</span>
      </div>
    );
  }
  return (
    <div className={`truncate text-[11px] text-(--ad-ink-faint) ${className}`} title={item.sender_email ?? undefined}>
      Sending from: <span className="font-medium text-(--ad-ink-soft)">{item.sender_email}</span>
    </div>
  );
}

function OpenBadge({ item, className = '' }: { item: QueueItem; className?: string }) {
  if (item.message_type === 'initial' || item.originalOpenCount <= 0) return null;
  const title = item.originalOpenedAt
    ? `Original message last opened ${new Date(item.originalOpenedAt).toLocaleString()}`
    : undefined;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold text-(--ad-amber) ${className}`}
    >
      <Eye size={11} strokeWidth={2.2} />
      Opened {item.originalOpenCount}x
    </span>
  );
}

function StatTile({
  icon: Icon,
  iconColor,
  label,
  value,
  sub,
  subColor,
  accent,
  onClick,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: number;
  sub: string;
  subColor: string;
  accent?: boolean;
  onClick?: () => void;
}) {
  const bg   = accent ? 'var(--ad-green)' : 'var(--ad-surface)';
  const bdr  = accent ? 'var(--ad-green)' : 'var(--ad-line)';
  const inkC = accent ? '#ffffff' : 'var(--ad-ink)';
  const lblC = accent ? 'rgba(255,255,255,0.65)' : 'var(--ad-ink-faint)';
  const icnC = accent ? 'rgba(255,255,255,0.7)' : iconColor;

  return (
    <div
      onClick={onClick}
      style={{ background: bg, borderColor: bdr, boxShadow: '0 1px 2px rgba(32,33,28,.04)' }}
      className={`flex flex-col rounded-lg border px-5 py-[18px] gap-0 transition-shadow hover:shadow-md ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* Icon + label row */}
      <div className="flex items-center gap-[5px] mb-[10px]">
        <Icon size={13} strokeWidth={2} style={{ color: icnC, flexShrink: 0 }} />
        <span
          style={{ color: lblC }}
          className="text-[11px] font-bold uppercase tracking-[.08em] leading-none"
        >
          {label}
        </span>
      </div>

      {/* Big number */}
      <span
        style={{ color: inkC }}
        className="text-[30px] font-extrabold leading-none tracking-[-0.04em] tabular-nums mb-[7px]"
      >
        {value}
      </span>

      {/* Secondary text */}
      <span
        style={{ color: subColor }}
        className="text-[11px] font-semibold leading-none"
      >
        {sub}
      </span>
    </div>
  );
}

function EditModal({
  item,
  onClose,
  onSave,
  onApprove,
}: {
  item: QueueItem;
  onClose: () => void;
  onSave: (id: string, body?: string, subject?: string) => Promise<void>;
  onApprove: (id: string, body?: string, subject?: string) => void;
}) {
  const [draft, setDraft] = useState(item.body);
  const [subjectDraft, setSubjectDraft] = useState(item.subject ?? '');
  const [saving, setSaving] = useState(false);
  const bodyDirty    = draft.trim() !== item.body.trim();
  const subjectDirty = subjectDraft.trim() !== (item.subject ?? '').trim();
  const dirty = bodyDirty || subjectDirty;

  async function handleSave() {
    setSaving(true);
    try { await onSave(item.id, bodyDirty ? draft : undefined, subjectDirty ? subjectDraft : undefined); }
    finally { setSaving(false); }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[600px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-(--ad-line) px-5 py-4">
          <div>
            <h2 className="m-0 text-[18px] font-bold text-(--ad-ink)">Edit draft</h2>
            <p className="m-0 mt-0.5 text-[12px] text-(--ad-ink-soft)">
              {item.prospect?.business_name ?? 'Unknown'}
              <span className="mx-1.5 text-(--ad-ink-ghost)">·</span>
              {TYPE_LABEL[item.message_type] ?? item.message_type}
            </p>
          </div>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) transition-colors hover:text-(--ad-ink)">×</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {item.subject !== null && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-(--ad-ink-faint)">Subject</div>
              <input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                style={{ ...FONT, boxShadow: '0 0 0 3px rgba(60,122,91,0.12)' }}
                className="w-full rounded-xl border border-(--ad-green) bg-(--ad-surface) px-3.5 py-2.5 text-[13px] font-bold text-(--ad-ink) outline-none"
              />
            </div>
          )}
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-(--ad-ink-faint)">Message body</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(6, draft.split('\n').length + 1)}
              style={{ ...FONT, boxShadow: '0 0 0 3px rgba(60,122,91,0.12)' }}
              className="w-full resize-y rounded-xl border border-(--ad-green) bg-(--ad-surface) px-4 py-3 text-[13px] leading-relaxed text-(--ad-ink) outline-none"
            />
          </div>
          <div className="rounded-xl border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[12px] text-(--ad-ink-soft)">
            For <strong className="font-bold text-(--ad-ink)">{item.client?.business_name ?? 'unknown client'}</strong>
            {item.prospect?.category && <><span className="mx-1.5 text-(--ad-ink-ghost)">·</span>{item.prospect.category}</>}
            {item.prospect?.location && <><span className="mx-1.5 text-(--ad-ink-ghost)">·</span>{item.prospect.location}</>}
          </div>
          {senderBlocked(item) && (
            <div className="flex items-center gap-1.5 rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-3.5 py-2.5 text-[12px] font-semibold text-(--ad-clay)">
              <AlertTriangle size={13} strokeWidth={2.2} className="shrink-0" />
              {GMAIL_TOOLTIP}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className="cursor-pointer rounded-md border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:bg-(--ad-surface-2)">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="cursor-pointer rounded-md border border-(--ad-green) bg-transparent px-4 py-2 text-[13px] font-bold text-(--ad-green) transition-colors hover:bg-(--ad-surface-2) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => onApprove(item.id, bodyDirty ? draft : undefined, subjectDirty ? subjectDraft : undefined)}
            disabled={senderBlocked(item) || saving}
            title={senderBlocked(item) ? GMAIL_TOOLTIP : undefined}
            className="cursor-pointer rounded-md border-0 bg-(--ad-green) px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-(--ad-green-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dirty ? 'Save & approve' : 'Approve'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
