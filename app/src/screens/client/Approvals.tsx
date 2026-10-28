import { btn } from '../../lib/clientButtons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useClientApprovals } from '../../hooks/useClientApprovals';
import { useClientCampaignList } from '../../hooks/useClientCampaigns';
import { isEuCountry } from '../../lib/countries';
import { useGmailConnection } from '../../hooks/useGmailConnection';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { confirmDiscard } from '../../lib/confirmDiscard';
import { SkeletonTable } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { previewSequenceApproval, approveSequences, type ApprovalPreview } from '../../hooks/useSequenceActions';
import { blockInfo, type BlockTone } from '../../lib/blockReasons';
import { partialFailureMessage } from '../../lib/chunkedBulk';
import type { ClientMessageItem } from '../../types';
import { approvalTypeLabel, APPROVAL_STEP_ORDER, APPROVAL_EXPLAINER } from '../../lib/approvalLabels';
import {
  applyApprovalView, DEFAULT_APPROVAL_SORT, APPROVAL_SORT_OPTIONS,
  type ApprovalSort, type ApprovalTypeFilter,
} from '../../lib/approvalsView';
import { ScheduledCell, PendingCell, WaitingCell, HeldBadge, AnglePill, ObservationDetails } from '../../components/ApprovalCells';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { formatPendingSince, pendingSinceOf, type ScheduleMap } from '../../lib/approvalsView';
import { useApprovalsSchedule } from '../../hooks/useApprovalsSchedule';

type ApprovalTab = 'pending' | 'approved' | 'blocked';
import { Clock, CheckCircle2, Send, Ban, ClipboardCheck } from 'lucide-react';

const GMAIL_REQUIRED_TITLE = "Connect your Gmail in Settings before approving - that's what actually sends this.";

const HELP: HelpContent = {
  title: 'Approvals',
  body: [
    { type: 'p', text: "Every email we draft for your prospects lands here before it goes anywhere. Nothing sends until you approve it." },
    { type: 'p', text: "Read the draft, edit the copy if you want to tweak it, then Approve or Reject - one at a time, or select several to handle in bulk." },
    { type: 'ul', items: [
      "Approve - sends the message exactly as written",
      "Edit then approve - change the copy first, then send",
      "Reject - discards the draft and cancels that prospect's remaining follow-ups",
    ]},
  ],
};

const PAGE_SIZE = 10;

const TYPE_FILTER_OPTIONS: { value: ApprovalTypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  ...APPROVAL_STEP_ORDER.map((t) => ({ value: t as ApprovalTypeFilter, label: approvalTypeLabel(t) })),
];
const EU_RECIPIENT_NOTE =
  'Emails to generic addresses (info@) and free-mail addresses (gmail, yahoo) are skipped automatically.';

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

function FilterSelect({ label, ariaLabel, value, onChange, options, className = '' }: {
  label: string; ariaLabel: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        style={FONT}
        aria-label={ariaLabel}
        className={`h-10 min-w-0 max-w-full basis-0 shrink max-md:basis-full gap-2 rounded-lg border-[#e8e3f7] bg-[#f9f6ff] px-3 text-[13px] font-semibold text-[#0e0822] focus:border-[#7412ef] focus:ring-0 focus:ring-offset-0 ${className}`}
      >
        <span className="w-14 shrink-0 text-left text-[11px] font-semibold uppercase tracking-[.06em] text-[#605978]">{label}</span>
        <span className="min-w-0 flex-1 truncate text-left"><SelectValue /></span>
      </SelectTrigger>
      <SelectContent style={FONT} className="bg-white text-[13px] text-[#0e0822]">
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Detail({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[.06em] text-[#605978]">{label}</dt>
      <dd className="m-0 mt-0.5 wrap-break-word text-[#0e0822]">{children ?? (value || '-')}</dd>
    </div>
  );
}

const READ_ONLY_MSG = 'You\'re viewing read-only. Turn on "Edit as admin" in the banner to approve or reject.';

export function Approvals({
  clientId, client = supabase, readOnly = false, basePath = '/app', isAdmin = false,
}: { clientId: string; client?: SupabaseClient; readOnly?: boolean; basePath?: string; isAdmin?: boolean }) {
  // Drafts held by policy (generic/freemail recipients) are hidden from clients;
  // admins can reveal them. Not tied to readOnly: admin edit mode is still admin.
  const [showHeld, setShowHeld] = useState(false);
  const {
    items, stats, approvedDrafts, timeZone, loading, isFetching, dataUpdatedAt, error,
    approve: approveRaw, saveEdits, reject: rejectRaw, bulkReject: bulkRejectRaw, reload,
  } = useClientApprovals(clientId, client, isAdmin && showHeld, !isAdmin);
  const [tab, setTab] = useState<ApprovalTab>('pending');
  const [sort, setSort] = useState<ApprovalSort>(DEFAULT_APPROVAL_SORT);
  const [typeFilter, setTypeFilter] = useState<ApprovalTypeFilter>('all');
  const { schedule } = useApprovalsSchedule(clientId, client);
  const { connection: gmailConnection } = useGmailConnection(clientId);
  const { rows: campaigns } = useClientCampaignList(clientId, client);
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh approvals.');
  const [editItem, setEditItem] = useState<ClientMessageItem | null>(null);
  // Drafts waiting on the reject confirmation - one row, or the bulk selection.
  const [rejectIds, setRejectIds] = useState<string[] | null>(null);
  const [rejecting, setRejecting] = useState(false);

  // View-as-client is read-only; every action says so instead of silently doing nothing.
  async function doApprove(id: string, body?: string, subject?: string) {
    if (readOnly) { toast(READ_ONLY_MSG, 'warning'); return; }
    const { error: err } = await approveRaw(id, body, subject);
    if (err) toast(`Couldn't approve the email: ${err}`, 'error');
    else toast(body !== undefined || subject !== undefined ? 'Edits saved and email approved.' : 'Email approved.');
  }

  // A single row can be rejected from any tab (incl. approved-but-blocked).
  function askReject(ids: string[]) {
    if (readOnly) { toast(READ_ONLY_MSG, 'warning'); return; }
    if (ids.length > 0) setRejectIds(ids);
  }

  // Bulk reject only ever covers drafts that are loaded and still pending.
  function askBulkReject() {
    const loaded = new Set(items.map((i) => i.id));
    askReject(Array.from(selected).filter((id) => loaded.has(id)));
  }

  async function confirmReject() {
    if (!rejectIds) return;
    setRejecting(true);
    const n = rejectIds.length;
    let err: string | null = null;
    let done = n;
    let failed = false;
    if (n === 1) {
      ({ error: err } = await rejectRaw(rejectIds[0]));
    } else {
      const res = await bulkRejectRaw(rejectIds);
      done = res.affected;
      failed = res.failedBatches > 0;
      if (failed) err = partialFailureMessage(res, 'rejected', 'reject');
    }
    setRejecting(false);
    setRejectIds(null);
    if (failed) {
      // Partial progress is real: the rows that did go through are gone from the list.
      toast(err as string, 'error');
      return;
    }
    if (err) { toast(`Couldn't reject: ${err}`, 'error'); return; }
    setSelected((prev) => {
      const next = new Set(prev);
      rejectIds.forEach((id) => next.delete(id));
      return next;
    });
    if (n === 1) toast('Draft rejected.');
    else if (done === n) toast(`${n} drafts rejected.`);
    else toast(`${done} of ${n} drafts rejected - the rest were already handled.`, 'warning');
  }

  async function handleSaveDraft(id: string, body?: string, subject?: string) {
    if (readOnly) { toast(READ_ONLY_MSG, 'warning'); return; }
    const { error: err } = await saveEdits(id, body, subject);
    if (err) { toast(`Couldn't save the draft: ${err}`, 'error'); return; }
    toast('Draft saved');
    // Re-baseline the open modal so it's no longer dirty.
    setEditItem((cur) => (cur?.id === id ? { ...cur, body: body ?? cur.body, subject: subject ?? cur.subject } : cur));
  }
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [approvalPlan, setApprovalPlan] = useState<{ prospectIds: string[]; preview: ApprovalPreview; campaignsLabel: string } | null>(null);
  const [approving, setApproving] = useState(false);

  // Approving an email-channel message only matters if it can actually be
  // sent - which needs the client's own connected Gmail. Non-email channels
  // (whatsapp/sms) don't depend on it, so those stay approvable regardless.
  function needsGmail(item: ClientMessageItem) {
    return item.channel === 'email' && !gmailConnection.connected;
  }

  // Show the EU recipient-filter note only when a waiting draft belongs to a
  // campaign that targets an EU country.
  const euCampaignIds = new Set(campaigns.filter((c) => isEuCountry(c.country)).map((c) => c.id));
  const hasEuDrafts = items.some((i) => i.campaign_id != null && euCampaignIds.has(i.campaign_id));

  const sendableDrafts = approvedDrafts?.sendable ?? [];
  const blockedDrafts  = approvedDrafts?.blocked ?? [];
  const sendableCount  = approvedDrafts?.counts.sendable ?? 0;
  const blockedCount   = approvedDrafts?.counts.blocked ?? 0;
  const baseList = tab === 'pending' ? items : tab === 'approved' ? sendableDrafts : blockedDrafts;
  // Filter, then sort the whole loaded list before it is cut into pages.
  const visible = applyApprovalView(baseList, { sort, type: typeFilter, schedule });
  const now = new Date();
  const isPendingTab = tab === 'pending';

  // The pending list is paged up to a ceiling; stats.pending is the exact count.
  // When they differ, "all" would mean rows that aren't loaded, so bulk-by-scope is off.
  const totalPending = Math.max(stats.pending, items.length);
  const pendingCapped = stats.pending > items.length;

  const campaignName = (id: string | null | undefined) =>
    (id ? campaigns.find((c) => c.id === id)?.name : null) ?? 'Unknown campaign';
  // "Prague Restaurants (12), Berlin Cafes (3)" for the given loaded drafts.
  function campaignBreakdown(drafts: { campaign_id?: string | null }[]): string {
    const counts = new Map<string, number>();
    drafts.forEach((d) => {
      const name = campaignName(d.campaign_id);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    const parts = Array.from(counts, ([name, n]) => (counts.size === 1 ? name : `${name} (${n})`));
    return parts.join(', ');
  }
  const draftById = new Map([...items, ...sendableDrafts, ...blockedDrafts].map((d) => [d.id, d]));

  function switchTab(next: ApprovalTab) {
    setTab(next);
    setPage(1);
    setSelected(new Set());
  }

  function changeSort(next: ApprovalSort) { setSort(next); setPage(1); }
  function changeTypeFilter(next: ApprovalTypeFilter) { setTypeFilter(next); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const allSelected = !pendingCapped && paged.length > 0 && paged.every((i) => selected.has(i.id));
  const selectedBlockedByGmail = Array.from(selected).some((id) => {
    const item = items.find((i) => i.id === id);
    return item ? needsGmail(item) : false;
  });

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        paged.forEach((i) => next.delete(i.id));
        return next;
      }
      const next = new Set(prev);
      paged.forEach((i) => next.add(i.id));
      return next;
    });
  }

  // Sequence-level bulk approval: selected rows map to their prospects; with
  // nothing selected it covers every prospect that has a draft waiting.
  async function handleBulkApprove() {
    if (readOnly) { toast(READ_ONLY_MSG, 'warning'); return; }
    // "All" only when the whole queue is loaded; otherwise a selection is required.
    if (selected.size === 0 && pendingCapped) return;
    const source = selected.size > 0 ? items.filter((i) => selected.has(i.id)) : items;
    const prospectIds = Array.from(new Set(source.map((i) => i.prospect_id)));
    if (prospectIds.length === 0) return;
    const campaignsLabel = campaignBreakdown(source);

    setBulkBusy(true);
    const res = await previewSequenceApproval(clientId, prospectIds);
    setBulkBusy(false);
    if (res.data === null) { toast(res.error, 'error'); return; }
    if (res.data.emails === 0) {
      toast('Nothing to approve - these prospects have replied or are no longer active.', 'warning');
      return;
    }
    setApprovalPlan({ prospectIds, preview: res.data, campaignsLabel });
  }

  async function confirmBulkApprove() {
    if (!approvalPlan) return;
    setApproving(true);
    const res = await approveSequences(clientId, approvalPlan.prospectIds);
    setApproving(false);
    setApprovalPlan(null);
    if (res.data === null) { toast(res.error, 'error'); return; }
    setSelected(new Set());
    const { emails_approved: e, prospects: p } = res.data;
    toast(`${e} email${e === 1 ? '' : 's'} approved across ${p} prospect${p === 1 ? '' : 's'}`);
  }

  const pagBtnCls = btn('secondary', 'md');

  return (
    <div style={FONT} className="flex flex-col gap-6 content">

      {/* Header */}
      <header className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-2 font-extrabold tracking-tight text-[#0e0822]">
            <ClipboardCheck size={24} strokeWidth={2} className="text-[#7412ef]" aria-hidden />
            Approvals
          </h1>
          <p className="m-0 mt-1 text-[13px] text-[#605978]">
            Nothing sends until you approve it. Review each draft, edit if needed, then approve or reject.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <RefreshButton
            onRefresh={handleRefresh}
            isFetching={isFetching}
            dataUpdatedAt={dataUpdatedAt}
            className={btn('secondary', 'lg')}
          />
        </div>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={Clock}
          iconColor="#7412ef"
          label="Awaiting Review"
          value={stats.pending}
          sub={stats.pending > 0 ? 'needs your decision' : 'queue is clear'}
          subColor={stats.pending > 0 ? '#7412ef' : '#605978'}
        />
        <StatTile
          icon={CheckCircle2}
          iconColor="#7412ef"
          label="Approved today"
          value={stats.approvedToday}
          sub="includes any already sent"
          subColor="#605978"
        />
        <StatTile
          icon={Send}
          iconColor="#7412ef"
          label="Sent Today"
          value={stats.sentToday}
          sub="emails delivered"
          subColor="rgba(255,255,255,0.55)"
          accent
        />
        <StatTile
          icon={Ban}
          iconColor="#0e0822"
          label="Rejected (all time)"
          value={stats.rejected}
          sub="drafts discarded"
          subColor="#605978"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-[#0e0822]/20 bg-[#f9f6ff] px-4 py-3 text-[13px] text-[#0e0822]">
          Couldn't load your approvals: {error}
        </div>
      )}

      {/* Approved summary - sendable and blocked are never lumped together */}
      {approvedDrafts && (sendableCount > 0 || blockedCount > 0) && (
        <p className="m-0 text-[13px] font-semibold text-[#0e0822]" data-testid="approved-summary">
          Approved: {sendableCount} sendable, {blockedCount} blocked
        </p>
      )}

      {/* Tabs */}
      {!loading && (
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {([
            ['pending', `Pending (${totalPending})`],
            ['approved', `Approved (${sendableCount})`],
            ['blocked', `Blocked (${blockedCount})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                tab === key
                  ? key === 'blocked' ? 'border-[#0e0822] bg-[#0e0822] text-white' : 'border-[#7412ef] bg-[#7412ef] text-white'
                  : 'border-[#e8e3f7] bg-white text-[#605978] hover:bg-[#f9f6ff]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {isAdmin && tab === 'blocked' && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[#605978]">
          <input type="checkbox" checked={showHeld} onChange={(e) => setShowHeld(e.target.checked)} className="accent-[#7412ef]" />
          Held by policy
        </label>
      )}
      {tab === 'blocked' && blockedCount > 0 && (
        <p className="m-0 text-[12.5px] text-[#605978]">
          These drafts are approved but won't send until the reason shown is cleared. You can reject any you don't want to keep.
        </p>
      )}
      {tab !== 'pending' && approvedDrafts && (tab === 'approved' ? sendableCount : blockedCount) > baseList.length && (
        <p className="m-0 text-[12px] text-[#605978]">Showing the latest {baseList.length} of {tab === 'approved' ? sendableCount : blockedCount}.</p>
      )}

      {/* Sort + type filter */}
      {!loading && baseList.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 md:flex-nowrap rounded-xl border border-[#e8e3f7] bg-white p-2.5">
          <FilterSelect
            label="Type"
            className="grow-2"
            ariaLabel="Filter by email type"
            value={typeFilter}
            onChange={(v) => changeTypeFilter(v as ApprovalTypeFilter)}
            options={TYPE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.value === 'all' ? 'All' : o.label }))}
          />
          <FilterSelect
            label="Sort"
            className="grow-3"
            ariaLabel="Sort drafts"
            value={sort}
            onChange={(v) => changeSort(v as ApprovalSort)}
            options={APPROVAL_SORT_OPTIONS}
          />
          {(typeFilter !== 'all' || sort !== DEFAULT_APPROVAL_SORT) && (
            <button
              onClick={() => { changeTypeFilter('all'); changeSort(DEFAULT_APPROVAL_SORT); }}
              className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1.5 text-[12.5px] font-semibold text-[#605978] underline-offset-2 transition-colors hover:text-[#0e0822] hover:underline"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Table / Cards */}
      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={5} />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#e8e3f7] bg-white p-10 text-center">
          <strong className="text-[15px] font-semibold text-[#0e0822]">
            {baseList.length > 0 ? 'No drafts match this filter.' : isPendingTab ? "Queue's clear." : tab === 'approved' ? 'Nothing approved and waiting.' : 'Nothing blocked.'}
          </strong>
          <span className="text-[13px] text-[#605978]">
            {baseList.length > 0 ? 'Choose "All types" to see everything on this tab.' : isPendingTab
              ? 'No drafts waiting for review. New ones appear here as we write them for your prospects.'
              : tab === 'approved'
                ? 'Approved drafts that are ready or scheduled to send show up here.'
                : 'No approved drafts are being held back.'}
          </span>
        </div>
      ) : (
        <>
          {/* Selection bar */}
          <div className="rounded-lg border border-[#e8e3f7] bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            {isPendingTab ? (
              <label
                className={`flex items-center gap-2 text-[12.5px] font-semibold text-[#605978] ${pendingCapped ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                title={pendingCapped ? `Only ${items.length} of ${totalPending} pending drafts are loaded, so select-all is off. Tick rows individually, or work through the queue to bring it under the limit.` : undefined}
              >
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={pendingCapped} className="accent-[#7412ef]" />
                Select all
              </label>
            ) : <span />}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isPendingTab && (selected.size > 0 || pendingCapped) && (
                <span className="text-[12.5px] text-[#605978]">
                  {pendingCapped ? `${selected.size} of ${totalPending} selected (${items.length} loaded)` : `${selected.size} selected`}
                </span>
              )}
              {isPendingTab && (
              <button
                onClick={handleBulkApprove}
                disabled={bulkBusy || approving || (selected.size === 0 && pendingCapped) || (selected.size > 0 ? selectedBlockedByGmail : items.some(needsGmail))}
                title={(selected.size > 0 ? selectedBlockedByGmail : items.some(needsGmail))
                  ? GMAIL_REQUIRED_TITLE
                  : (selected.size === 0 && pendingCapped) ? `Only ${items.length} of ${totalPending} drafts are loaded. Select rows to approve instead.` : undefined}
                className={btn('primary', 'md')}
              >
                {bulkBusy ? 'Checking…' : selected.size > 0 ? 'Approve selected sequences' : 'Approve all pending'}
              </button>
              )}
              {isPendingTab && selected.size > 0 && (
                <button
                  onClick={askBulkReject}
                  disabled={bulkBusy || rejecting}
                  className={btn('danger', 'md')}
                >
                  Reject selected
                </button>
              )}
            </div>
          </div>
          <p className="m-0 mt-2 text-[12px] leading-relaxed text-[#605978]">{APPROVAL_EXPLAINER}</p>
          {hasEuDrafts && (
            <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-[#605978]">{EU_RECIPIENT_NOTE}</p>
          )}
          </div>

          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              <colgroup>
                <col className="w-9" />
                <col className="w-[19%]" />
                <col className="w-[25%]" />
                <col className="w-[17%]" />
                <col className="w-[8%]" />
                <col className="w-[27%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="w-9" />
                  {['Prospect', 'Subject', 'Scheduled send', 'Waiting', ''].map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((item) => (
                  <tr
                    key={item.id}
                    onClick={isPendingTab ? () => setEditItem(item) : undefined}
                    className={isPendingTab ? 'cursor-pointer' : undefined}
                  >
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      {isPendingTab && <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} className="accent-[#7412ef]" />}
                    </td>
                    <td className="min-w-0">
                      <div className="line-clamp-2 font-semibold text-[#0e0822]" title={item.prospect?.business_name ?? undefined}>
                        {item.prospect?.business_name ?? 'Unknown'}
                      </div>
                      {(item.prospect?.contact_name || item.prospect?.location) && (
                        <div className="mt-0.5 truncate text-[11px] text-[#605978]">
                          {[item.prospect?.contact_name, item.prospect?.location].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="min-w-0 text-[#605978]">
                      <div className="line-clamp-2" title={item.subject ?? undefined}>
                        {item.subject ?? <span className="italic text-[#8f8aa8]">No subject</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {item.message_type !== 'initial' && (
                          <span className="atbl-pill" style={{ background: '#f1e9ff', color: '#7412ef' }}>
                            {approvalTypeLabel(item.message_type)}
                          </span>
                        )}
                        <AnglePill angle={item.angle} />
                      </div>
                      <BlockBadge reason={item.block_reason} className="mt-1" />
                      {isAdmin && <HeldBadge row={schedule.get(item.id)} settingsPath={readOnly ? null : `${basePath}/settings`} className="mt-1" />}
                    </td>
                    <td className="whitespace-nowrap"><ScheduledCell schedule={schedule} id={item.id} tz={timeZone} now={now} /></td>
                    <td className="whitespace-nowrap text-[12px] text-[#605978]">
                      <WaitingCell item={item} schedule={schedule} tz={timeZone} now={now} staleClassName="font-semibold text-[#7412ef]" />
                    </td>
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-nowrap items-center justify-end gap-1.5">
                        {isPendingTab && (<>
                        <button
                          onClick={() => doApprove(item.id)}
                          disabled={needsGmail(item)}
                          title={needsGmail(item) ? GMAIL_REQUIRED_TITLE : undefined}
                          className={btn('primary', 'md')}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setEditItem(item)}
                          className={btn('secondary', 'md')}
                        >
                          Edit
                        </button>
                        </>)}
                        <button
                          onClick={() => askReject([item.id])}
                          className={btn('danger', 'md')}
                        >
                          Reject
                        </button>
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
              <div key={item.id} className="rounded-xl border border-[#e8e3f7] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {isPendingTab && (
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleOne(item.id)}
                        className="mt-1 accent-[#7412ef] shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-[#0e0822] truncate">{item.prospect?.business_name ?? 'Unknown'}</div>
                      {item.prospect?.contact_name && (
                        <div className="mt-0.5 truncate text-[11px] text-[#605978]">{item.prospect.contact_name}</div>
                      )}
                      <ProspectMeta item={item} className="mt-0.5" />
                    </div>
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#f1e9ff] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.04em] text-[#7412ef]">
                      {approvalTypeLabel(item.message_type)}
                    </span>
                    <AnglePill angle={item.angle} />
                  </span>
                </div>
                {item.subject && (
                  <div className="mt-1.5 truncate text-[12px] text-[#605978]">{item.subject}</div>
                )}
                <BlockBadge reason={item.block_reason} className="mt-1.5" />
                {isAdmin && <HeldBadge row={schedule.get(item.id)} settingsPath={readOnly ? null : `${basePath}/settings`} className="mt-1.5" />}
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11.5px]">
                  <div><div className="text-[10px] font-semibold uppercase tracking-[.06em] text-[#605978]">Scheduled</div><ScheduledCell schedule={schedule} id={item.id} tz={timeZone} now={now} /></div>
                  <div><div className="text-[10px] font-semibold uppercase tracking-[.06em] text-[#605978]">Pending since</div><PendingCell item={item} schedule={schedule} tz={timeZone} now={now} /></div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-[#f9f6ff] pt-3">
                  {isPendingTab && (<>
                  <button
                    onClick={() => doApprove(item.id)}
                    disabled={needsGmail(item)}
                    title={needsGmail(item) ? GMAIL_REQUIRED_TITLE : undefined}
                    className={`${btn('primary', 'md')} flex-1`}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setEditItem(item)}
                    className={`${btn('secondary', 'md')} flex-1`}
                  >
                    Edit
                  </button>
                  </>)}
                  <button
                    onClick={() => askReject([item.id])}
                    className={`${btn('danger', 'md')} flex-1`}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Shared pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-[#e8e3f7] bg-white px-4 py-3 text-[12.5px] text-[#605978]">
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
        </>
      )}

      <AnimatePresence>
        {editItem && (
          <EditModal
            key="edit-modal"
            item={editItem}
            schedule={schedule}
            timeZone={timeZone}
            blockedByGmail={needsGmail(editItem)}
            settingsPath={readOnly ? null : `${basePath}/settings`}
            onClose={() => setEditItem(null)}
            onSave={handleSaveDraft}
            onApprove={(id, body, subject) => {
              // Read-only: warn and leave the modal (and its edits) open.
              if (readOnly) { toast(READ_ONLY_MSG, 'warning'); return; }
              doApprove(id, body, subject);
              setEditItem(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rejectIds && (
          <ConfirmDialog
            key="reject-confirm"
            title={rejectIds.length === 1 ? 'Reject this draft?' : `Reject ${rejectIds.length} pending drafts?`}
            confirmLabel="Reject"
            cancelLabel="Keep"
            danger
            busy={rejecting}
            onConfirm={confirmReject}
            onCancel={() => setRejectIds(null)}
          >
            <p className="m-0 mb-2 font-semibold text-[#0e0822]">
              {rejectIds.length} draft{rejectIds.length === 1 ? '' : 's'} in {campaignBreakdown(rejectIds.map((id) => draftById.get(id) ?? { campaign_id: null }))}
            </p>
            {rejectIds.length === 1 ? 'It' : 'They'} won't be sent, and any follow-ups still planned for {rejectIds.length === 1 ? 'that prospect' : 'those prospects'} are cancelled too. This can't be undone.
          </ConfirmDialog>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {approvalPlan && (
          <ConfirmDialog
            key="bulk-approve"
            title={`Approve ${approvalPlan.preview.emails} email${approvalPlan.preview.emails === 1 ? '' : 's'} across ${approvalPlan.preview.prospects} prospect${approvalPlan.preview.prospects === 1 ? '' : 's'}?`}
            confirmLabel="Approve"
            busy={approving}
            onConfirm={confirmBulkApprove}
            onCancel={() => setApprovalPlan(null)}
          >
            <p className="m-0 mb-2 font-semibold text-[#0e0822]">Campaign: {approvalPlan.campaignsLabel}</p>
            <ul className="m-0 mb-3 list-none p-0">
              {APPROVAL_STEP_ORDER.filter((k) => (approvalPlan.preview.by_step[k] ?? 0) > 0).map((k) => (
                <li key={k} className="flex justify-between border-b border-[#f9f6ff] py-1 last:border-0">
                  <span>{approvalTypeLabel(k)}</span>
                  <span className="font-semibold text-[#0e0822]">{approvalPlan.preview.by_step[k]}</span>
                </li>
              ))}
            </ul>
            {APPROVAL_EXPLAINER}
          </ConfirmDialog>
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

const BLOCK_TONE_STYLE: Record<BlockTone, { bg: string; fg: string }> = {
  blocked:   { bg: '#f9f6ff', fg: '#0e0822' },
  paused:    { bg: '#f1e9ff', fg: '#5b0fc2' },
  scheduled: { bg: '#f9f6ff', fg: '#605978' },
};

function BlockBadge({ reason, className = '' }: { reason: string | null | undefined; className?: string }) {
  if (!reason) return null;
  const info = blockInfo(reason);
  const style = BLOCK_TONE_STYLE[info.tone];
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span
        style={{ background: style.bg, color: style.fg }}
        className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.04em]"
      >
        {info.badge}
      </span>
      {info.text !== info.badge && <span className="text-[11px] leading-snug" style={{ color: style.fg }}>{info.text}</span>}
    </div>
  );
}

function ProspectMeta({ item, className = '' }: { item: ClientMessageItem; className?: string }) {
  const location = item.prospect?.location;
  const phone    = item.prospect?.phone;
  if (!location && !phone) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#605978] ${className}`}>
      {location && <span>{location}</span>}
      {location && phone && <span className="text-[#8f8aa8]">·</span>}
      {phone && <span className="font-mono">{formatPhone(phone)}</span>}
    </div>
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
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: number;
  sub: string;
  subColor: string;
  accent?: boolean;
}) {
  const bg   = accent ? '#7412ef' : '#ffffff';
  const bdr  = accent ? '#7412ef' : '#e8e3f7';
  const inkC = accent ? '#ffffff' : '#0e0822';
  const lblC = accent ? 'rgba(255,255,255,0.65)' : '#605978';
  const icnC = accent ? 'rgba(255,255,255,0.7)' : iconColor;

  return (
    <div
      style={{ background: bg, borderColor: bdr }}
      className="flex flex-col rounded-lg border px-5 py-[18px] gap-0"
    >
      <div className="flex items-center gap-[5px] mb-[10px]">
        <Icon size={13} strokeWidth={2} style={{ color: icnC, flexShrink: 0 }} />
        <span
          style={{ color: lblC }}
          className="text-[11px] font-semibold uppercase tracking-[.08em] leading-none"
        >
          {label}
        </span>
      </div>

      <span
        style={{ color: inkC }}
        className="text-[30px] font-extrabold leading-none tracking-[-0.04em] tabular-nums mb-[7px]"
      >
        {value}
      </span>

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
  schedule,
  timeZone,
  blockedByGmail,
  settingsPath,
  onClose,
  onSave,
  onApprove,
}: {
  item: ClientMessageItem;
  schedule: ScheduleMap;
  timeZone: string;
  blockedByGmail: boolean;
  /** null in view-as-client, which has no Settings page to link to. */
  settingsPath: string | null;
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
  const requestClose = () => { if (confirmDiscard(dirty)) onClose(); };

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
      {...useOverlayClose(requestClose, { escape: true })}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[600px] md:rounded-md md:border md:border-[#e8e3f7]"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e8e3f7] px-5 py-4">
          <div>
            <h2 className="m-0 text-[18px] font-semibold text-[#0e0822]">Review draft</h2>
            <p className="m-0 mt-0.5 text-[12px] text-[#605978]">
              {item.prospect?.business_name ?? 'Unknown'}
              <span className="mx-1.5 text-[#8f8aa8]">·</span>
              {approvalTypeLabel(item.message_type)}
            </p>
          </div>
          <button onClick={requestClose} aria-label="Close" className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#605978] transition-colors hover:text-[#0e0822]">×</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {item.subject !== null && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[#605978]">Subject</div>
              <input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                style={{ ...FONT, boxShadow: '0 0 0 3px rgba(116, 18, 239, 0.14)' }}
                className="w-full rounded-xl border border-[#7412ef] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-[#0e0822] outline-none"
              />
            </div>
          )}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[#605978]">Message body</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(6, draft.split('\n').length + 1)}
              style={{ ...FONT, boxShadow: '0 0 0 3px rgba(116, 18, 239, 0.14)' }}
              className="w-full resize-y rounded-xl border border-[#7412ef] bg-white px-4 py-3 text-[13px] leading-relaxed text-[#0e0822] outline-none"
            />
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[#e8e3f7] bg-[#f9f6ff] px-3.5 py-3 text-[12px] text-[#605978]">
            <Detail label="Prospect" value={[item.prospect?.category, item.prospect?.location].filter(Boolean).join(' · ')} />
            <Detail label="Phone" value={item.prospect?.phone ? formatPhone(item.prospect.phone) : null} />
            <Detail label="Scheduled send">
              <ScheduledCell schedule={schedule} id={item.id} tz={timeZone} now={new Date()} />
            </Detail>
            <Detail label="Waiting since" value={formatPendingSince(pendingSinceOf(item, schedule), timeZone)} />
            <ObservationDetails observation={item.observation} sourceUrl={item.observation_source_url} Detail={Detail} />
          </dl>
          {blockedByGmail && (
            <div className="rounded-xl border border-[#e8dafd] bg-[#f1e9ff] px-3.5 py-2.5 text-[12px] text-[#5b0fc2]">
              {settingsPath
                ? <Link to={settingsPath} className="font-semibold underline">Connect your Gmail</Link>
                : <strong className="font-semibold">Connect your Gmail</strong>} in Settings before approving - that's what actually sends this.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#e8e3f7] px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={btn('secondary', 'lg')}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            title={dirty ? undefined : 'Change the subject or message to save a draft'}
            className={`cursor-pointer rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed ${
              dirty
                ? 'border-[#7412ef] bg-[#f1e9ff] text-[#5b0fc2] hover:bg-[#e8dafd]'
                : 'border-[#cfc9e8] bg-transparent text-[#605978]'
            }`}
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            onClick={() => onApprove(item.id, bodyDirty ? draft : undefined, subjectDirty ? subjectDraft : undefined)}
            disabled={blockedByGmail || saving}
            title={blockedByGmail ? GMAIL_REQUIRED_TITLE : undefined}
            className={btn('primary', 'lg')}
          >
            {dirty ? 'Save & approve' : 'Approve'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
