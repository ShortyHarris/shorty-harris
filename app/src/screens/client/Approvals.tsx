import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useClientApprovals } from '../../hooks/useClientApprovals';
import { useGmailConnection } from '../../hooks/useGmailConnection';
import { SkeletonTable } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import type { ClientMessageItem } from '../../types';
import { Clock, CheckCircle2, Send, Ban } from 'lucide-react';

const GMAIL_REQUIRED_TITLE = "Connect your Gmail in Settings before approving — that's what actually sends this.";

const HELP: HelpContent = {
  title: 'Approvals',
  body: [
    { type: 'p', text: "Every email we draft for your prospects lands here before it goes anywhere. Nothing sends until you approve it." },
    { type: 'p', text: "Read the draft, edit the copy if you want to tweak it, then Approve or Reject — one at a time, or select several to handle in bulk." },
    { type: 'ul', items: [
      "Approve — sends the message exactly as written",
      "Edit then approve — change the copy first, then send",
      "Reject — discards the draft; the prospect receives nothing",
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

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

export function Approvals({ clientId }: { clientId: string }) {
  const { items, stats, loading, error, approve, reject, bulkApprove, bulkReject, reload } = useClientApprovals(clientId);
  const { connection: gmailConnection } = useGmailConnection(clientId);
  const [editItem, setEditItem] = useState<ClientMessageItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Approving an email-channel message only matters if it can actually be
  // sent — which needs the client's own connected Gmail. Non-email channels
  // (whatsapp/sms) don't depend on it, so those stay approvable regardless.
  function needsGmail(item: ClientMessageItem) {
    return item.channel === 'email' && !gmailConnection.connected;
  }

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

  async function handleBulkApprove() {
    setBulkBusy(true);
    await bulkApprove(Array.from(selected));
    setSelected(new Set());
    setBulkBusy(false);
  }

  async function handleBulkReject() {
    setBulkBusy(true);
    await bulkReject(Array.from(selected));
    setSelected(new Set());
    setBulkBusy(false);
  }

  const pagBtnCls = 'cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40';

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
          <button
            onClick={reload}
            className="cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]"
          >
            Refresh
          </button>
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
          <div className="flex items-center justify-between rounded-lg border border-[#ece8df] bg-white px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[#62655c]">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#3c7a5b]" />
              Select all
            </label>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] text-[#9a9d92]">{selected.size} selected</span>
                <button
                  onClick={handleBulkApprove}
                  disabled={bulkBusy || selectedBlockedByGmail}
                  title={selectedBlockedByGmail ? GMAIL_REQUIRED_TITLE : undefined}
                  className="cursor-pointer rounded-lg border-0 bg-[#3c7a5b] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Approve selected
                </button>
                <button
                  onClick={handleBulkReject}
                  disabled={bulkBusy}
                  className="cursor-pointer rounded-lg border border-[#a8533a] bg-transparent px-3 py-1.5 text-[12px] font-bold text-[#a8533a] transition-colors hover:bg-[#a8533a] hover:text-white disabled:opacity-50"
                >
                  Reject selected
                </button>
              </div>
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
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => approve(item.id)}
                          disabled={needsGmail(item)}
                          title={needsGmail(item) ? GMAIL_REQUIRED_TITLE : undefined}
                          className="cursor-pointer whitespace-nowrap rounded-lg border-0 bg-[#3c7a5b] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setEditItem(item)}
                          className="cursor-pointer whitespace-nowrap rounded-lg border border-[#ece8df] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => reject(item.id)}
                          className="cursor-pointer whitespace-nowrap rounded-lg border border-[#a8533a] bg-transparent px-3 py-1.5 text-[12px] font-bold text-[#a8533a] transition-colors hover:bg-[#a8533a] hover:text-white"
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
                    className="cursor-pointer flex-1 rounded-lg border-0 bg-[#3c7a5b] px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setEditItem(item)}
                    className="cursor-pointer flex-1 rounded-lg border border-[#ece8df] bg-white px-3 py-2 text-[12px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => reject(item.id)}
                    className="cursor-pointer flex-1 rounded-lg border border-[#a8533a] bg-transparent px-3 py-2 text-[12px] font-bold text-[#a8533a] transition-colors hover:bg-[#a8533a] hover:text-white"
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
      onClick={onClose}
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
              <Link to="/app/settings" className="font-bold underline">Connect your Gmail</Link> in Settings before approving — that's what actually sends this.
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
