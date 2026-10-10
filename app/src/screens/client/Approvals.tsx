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
import { SkeletonTable } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { previewSequenceApproval, approveSequences, type ApprovalPreview } from '../../hooks/useSequenceActions';
import type { ClientMessageItem } from '../../types';
import { Clock, CheckCircle2, Send, Ban } from 'lucide-react';

const GMAIL_REQUIRED_TITLE = "Connect your Gmail in Settings before approving - that's what actually sends this.";

const HELP: HelpContent = {
  title: 'Approvals',
  body: [
    { type: 'p', text: "Every email we draft for your prospects lands here before it goes anywhere. Nothing sends until you approve it." },
    { type: 'p', text: "Read the draft, edit the copy if you want to tweak it, then Approve or Reject - one at a time, or select several to handle in bulk." },
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

const STEP_ORDER = ['initial', 'follow_up_d3', 'follow_up_d7', 'follow_up_d14'];
const APPROVAL_EXPLAINER =
  'Approving schedules every email. Follow-ups send 3, 5 and 7 business days after the previous email, and only if the prospect has not replied or unsubscribed.';
const EU_RECIPIENT_NOTE =
  'Emails to generic addresses (info@) and free-mail addresses (gmail, yahoo) are skipped automatically.';

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

export function Approvals({
  clientId, client = supabase, readOnly = false,
}: { clientId: string; client?: SupabaseClient; readOnly?: boolean }) {
  const {
    items, stats, loading, isFetching, dataUpdatedAt, error,
    approve: approveRaw, reject: rejectRaw, bulkReject: bulkRejectRaw, reload,
  } = useClientApprovals(clientId, client);
  const approve = readOnly ? async () => {} : approveRaw;
  const reject = readOnly ? async () => {} : rejectRaw;
  const bulkReject = readOnly ? async () => {} : bulkRejectRaw;
  const { connection: gmailConnection } = useGmailConnection(clientId);
  const { rows: campaigns } = useClientCampaignList(clientId, client);
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh approvals.');
  const [editItem, setEditItem] = useState<ClientMessageItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [approvalPlan, setApprovalPlan] = useState<{ prospectIds: string[]; preview: ApprovalPreview } | null>(null);
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

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const allSelected = paged.length > 0 && paged.every((i) => selected.has(i.id));
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
    if (readOnly) return;
    const source = selected.size > 0 ? items.filter((i) => selected.has(i.id)) : items;
    const prospectIds = Array.from(new Set(source.map((i) => i.prospect_id)));
    if (prospectIds.length === 0) return;

    setBulkBusy(true);
    const res = await previewSequenceApproval(clientId, prospectIds);
    setBulkBusy(false);
    if (res.data === null) { toast(res.error, 'error'); return; }
    if (res.data.emails === 0) {
      toast('Nothing to approve - these prospects have replied or are no longer active.', 'warning');
      return;
    }
    setApprovalPlan({ prospectIds, preview: res.data });
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

  async function handleBulkReject() {
    setBulkBusy(true);
    await bulkReject(Array.from(selected));
    setSelected(new Set());
    setBulkBusy(false);
  }

  const pagBtnCls = 'cursor-pointer rounded-md border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div style={FONT} className="flex flex-col gap-6 content">

      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]"> <img src="https://cdn-icons-png.flaticon.com/128/5442/5442020.png" alt="Approvals" className="w-10 h-10" />Approvals</h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">
            Nothing sends until you approve it. Review each draft, edit if needed, then approve or reject.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <RefreshButton
            onRefresh={handleRefresh}
            isFetching={isFetching}
            dataUpdatedAt={dataUpdatedAt}
            className="cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]"
          />
        </div>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={Clock}
          iconColor="#d4870f"
          label="Awaiting Review"
          value={stats.pending}
          sub={stats.pending > 0 ? 'needs your decision' : 'queue is clear'}
          subColor={stats.pending > 0 ? '#d4870f' : '#9a9d92'}
        />
        <StatTile
          icon={CheckCircle2}
          iconColor="#3c7a5b"
          label="Approved Today"
          value={stats.approvedToday}
          sub="emails approved"
          subColor="#9a9d92"
        />
        <StatTile
          icon={Send}
          iconColor="#3c7a5b"
          label="Sent Today"
          value={stats.sentToday}
          sub="emails delivered"
          subColor="rgba(255,255,255,0.55)"
          accent
        />
        <StatTile
          icon={Ban}
          iconColor="#a8533a"
          label="Rejected"
          value={stats.rejected}
          sub="drafts discarded"
          subColor="#9a9d92"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">
          Couldn't load your approvals: {error}
        </div>
      )}

      {/* Table / Cards */}
      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={4} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">Queue's clear.</strong>
          <span className="text-[13px] text-[#62655c]">No drafts waiting for review. New ones appear here as we write them for your prospects.</span>
        </div>
      ) : (
        <>
          {/* Selection bar */}
          <div className="rounded-lg border border-[#ece8df] bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[#62655c]">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#3c7a5b]" />
              Select all
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selected.size > 0 && <span className="text-[12.5px] text-[#9a9d92]">{selected.size} selected</span>}
              <button
                onClick={handleBulkApprove}
                disabled={bulkBusy || approving || (selected.size > 0 ? selectedBlockedByGmail : items.some(needsGmail))}
                title={(selected.size > 0 ? selectedBlockedByGmail : items.some(needsGmail)) ? GMAIL_REQUIRED_TITLE : undefined}
                className="cursor-pointer rounded-md border-0 bg-[#3c7a5b] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkBusy ? 'Checking…' : selected.size > 0 ? 'Approve selected sequences' : 'Approve all pending'}
              </button>
              {selected.size > 0 && (
                <button
                  onClick={handleBulkReject}
                  disabled={bulkBusy}
                  className="cursor-pointer rounded-md border border-[#a8533a] bg-transparent px-3 py-1.5 text-[12px] font-bold text-[#a8533a] transition-colors hover:bg-[#a8533a] hover:text-white disabled:opacity-50"
                >
                  Reject selected
                </button>
              )}
            </div>
          </div>
          <p className="m-0 mt-2 text-[12px] leading-relaxed text-[#62655c]">{APPROVAL_EXPLAINER}</p>
          {hasEuDrafts && (
            <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-[#62655c]">{EU_RECIPIENT_NOTE}</p>
          )}
          </div>

          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              <colgroup>
                <col className="w-9" />
                <col className="w-[34%]" />
                <col className="w-[16%]" />
                <col className="w-[22%]" />
                <col className="w-[28%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="w-9" />
                  {(['Prospect', 'Type', 'Subject', ''] as const).map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3">
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} className="accent-[#3c7a5b]" />
                    </td>
                    <td className="min-w-0">
                      <div className="truncate font-bold text-[#20211c]" title={item.prospect?.business_name ?? undefined}>
                        {item.prospect?.business_name ?? 'Unknown'}
                      </div>
                      {item.prospect?.contact_name && (
                        <div className="mt-0.5 truncate text-[11px] text-[#9a9d92]">{item.prospect.contact_name}</div>
                      )}
                      <ProspectMeta item={item} className="mt-0.5" />
                    </td>
                    <td>
                      <span className="atbl-pill" style={{ background: '#edf4ef', color: '#3c7a5b' }}>
                        {TYPE_LABEL[item.message_type] ?? item.message_type}
                      </span>
                    </td>
                    <td className="min-w-0 text-[#62655c]">
                      <div className="truncate" title={item.subject ?? undefined}>
                        {item.subject ?? <span className="italic text-[#c4bfb5]">No subject</span>}
                      </div>
                    </td>
                    <td className="px-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          onClick={() => approve(item.id)}
                          disabled={needsGmail(item)}
                          title={needsGmail(item) ? GMAIL_REQUIRED_TITLE : undefined}
                          className="cursor-pointer whitespace-nowrap rounded-md border-0 bg-[#3c7a5b] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setEditItem(item)}
                          className="cursor-pointer whitespace-nowrap rounded-md border border-[#ece8df] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => reject(item.id)}
                          className="cursor-pointer whitespace-nowrap rounded-md border border-[#a8533a] bg-transparent px-3 py-1.5 text-[12px] font-bold text-[#a8533a] transition-colors hover:bg-[#a8533a] hover:text-white"
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
              <div key={item.id} className="rounded-xl border border-[#ece8df] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleOne(item.id)}
                      className="mt-1 accent-[#3c7a5b] shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-[#20211c] truncate">{item.prospect?.business_name ?? 'Unknown'}</div>
                      {item.prospect?.contact_name && (
                        <div className="mt-0.5 truncate text-[11px] text-[#9a9d92]">{item.prospect.contact_name}</div>
                      )}
                      <ProspectMeta item={item} className="mt-0.5" />
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full bg-[#edf4ef] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em] text-[#3c7a5b]">
                    {TYPE_LABEL[item.message_type] ?? item.message_type}
                  </span>
                </div>
                {item.subject && (
                  <div className="mt-1.5 truncate text-[12px] text-[#9a9d92]">{item.subject}</div>
                )}
                <div className="mt-3 flex items-center gap-2 border-t border-[#f5f2ec] pt-3">
                  <button
                    onClick={() => approve(item.id)}
                    disabled={needsGmail(item)}
                    title={needsGmail(item) ? GMAIL_REQUIRED_TITLE : undefined}
                    className="cursor-pointer flex-1 rounded-md border-0 bg-[#3c7a5b] px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setEditItem(item)}
                    className="cursor-pointer flex-1 rounded-md border border-[#ece8df] bg-white px-3 py-2 text-[12px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => reject(item.id)}
                    className="cursor-pointer flex-1 rounded-md border border-[#a8533a] bg-transparent px-3 py-2 text-[12px] font-bold text-[#a8533a] transition-colors hover:bg-[#a8533a] hover:text-white"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Shared pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-[#ece8df] bg-white px-4 py-3 text-[12.5px] text-[#9a9d92]">
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
            blockedByGmail={needsGmail(editItem)}
            onClose={() => setEditItem(null)}
            onApprove={(id, body, subject) => { approve(id, body, subject); setEditItem(null); }}
          />
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
            <ul className="m-0 mb-3 list-none p-0">
              {STEP_ORDER.filter((k) => (approvalPlan.preview.by_step[k] ?? 0) > 0).map((k) => (
                <li key={k} className="flex justify-between border-b border-[#f5f2ec] py-1 last:border-0">
                  <span>{TYPE_LABEL[k] ?? k}</span>
                  <span className="font-bold text-[#20211c]">{approvalPlan.preview.by_step[k]}</span>
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

function ProspectMeta({ item, className = '' }: { item: ClientMessageItem; className?: string }) {
  const location = item.prospect?.location;
  const phone    = item.prospect?.phone;
  if (!location && !phone) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#9a9d92] ${className}`}>
      {location && <span>{location}</span>}
      {location && phone && <span className="text-[#c4bfb5]">·</span>}
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
  const bg   = accent ? '#3c7a5b' : '#ffffff';
  const bdr  = accent ? '#3c7a5b' : '#ece8df';
  const inkC = accent ? '#ffffff' : '#20211c';
  const lblC = accent ? 'rgba(255,255,255,0.65)' : '#9a9d92';
  const icnC = accent ? 'rgba(255,255,255,0.7)' : iconColor;

  return (
    <div
      style={{ background: bg, borderColor: bdr }}
      className="flex flex-col rounded-lg border px-5 py-[18px] gap-0 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-center gap-[5px] mb-[10px]">
        <Icon size={13} strokeWidth={2} style={{ color: icnC, flexShrink: 0 }} />
        <span
          style={{ color: lblC }}
          className="text-[11px] font-bold uppercase tracking-[.08em] leading-none"
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
  blockedByGmail,
  onClose,
  onApprove,
}: {
  item: ClientMessageItem;
  blockedByGmail: boolean;
  onClose: () => void;
  onApprove: (id: string, body?: string, subject?: string) => void;
}) {
  const [draft, setDraft] = useState(item.body);
  const [subjectDraft, setSubjectDraft] = useState(item.subject ?? '');
  const bodyDirty    = draft.trim() !== item.body.trim();
  const subjectDirty = subjectDraft.trim() !== (item.subject ?? '').trim();
  const dirty = bodyDirty || subjectDirty;

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
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[600px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#ece8df] px-5 py-4">
          <div>
            <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Edit draft</h2>
            <p className="m-0 mt-0.5 text-[12px] text-[#62655c]">
              {item.prospect?.business_name ?? 'Unknown'}
              <span className="mx-1.5 text-[#c4bfb5]">·</span>
              {TYPE_LABEL[item.message_type] ?? item.message_type}
            </p>
          </div>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] transition-colors hover:text-[#20211c]">×</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {item.subject !== null && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">Subject</div>
              <input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                style={{ ...FONT, boxShadow: '0 0 0 3px rgba(60,122,91,0.12)' }}
                className="w-full rounded-xl border border-[#3c7a5b] bg-white px-3.5 py-2.5 text-[13px] font-bold text-[#20211c] outline-none"
              />
            </div>
          )}
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">Message body</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(6, draft.split('\n').length + 1)}
              style={{ ...FONT, boxShadow: '0 0 0 3px rgba(60,122,91,0.12)' }}
              className="w-full resize-y rounded-xl border border-[#3c7a5b] bg-white px-4 py-3 text-[13px] leading-relaxed text-[#20211c] outline-none"
            />
          </div>
          <div className="rounded-xl border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[12px] text-[#62655c]">
            {item.prospect?.category && <>{item.prospect.category}</>}
            {item.prospect?.location && <><span className="mx-1.5 text-[#c4bfb5]">·</span>{item.prospect.location}</>}
          </div>
          {blockedByGmail && (
            <div className="rounded-xl border border-[#e8d5a8] bg-[#f8efdb] px-3.5 py-2.5 text-[12px] text-[#8a6417]">
              <Link to="/app/settings" className="font-bold underline">Connect your Gmail</Link> in Settings before approving - that's what actually sends this.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className="cursor-pointer rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:bg-[#fbf9f5]">
            Cancel
          </button>
          <button
            onClick={() => onApprove(item.id, bodyDirty ? draft : undefined, subjectDirty ? subjectDraft : undefined)}
            disabled={blockedByGmail}
            title={blockedByGmail ? GMAIL_REQUIRED_TITLE : undefined}
            className="cursor-pointer rounded-xl border-0 bg-[#3c7a5b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dirty ? 'Save & approve' : 'Approve'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
