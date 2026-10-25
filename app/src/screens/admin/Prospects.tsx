import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useProspects, useProspectCategories, useClientsList, useClientCampaigns,
  updateProspect, getProspectDeleteCounts, deleteProspect,
} from '../../hooks/useAdminData';
import { clampPage, rangeLabel, totalPages } from '../../lib/prospectQuery';
import type { ProspectListRow, UpdateProspectInput, ProspectDeleteCounts } from '../../hooks/useAdminData';
import { SkeletonTable } from '../../components/Skeleton';
import { MobileFab } from '../../components/MobileFab';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { RowMenu } from '../../components/RowMenu';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import { isValidEmail, isValidPhone, normalizePhone } from '../../lib/validation';
import { RequiredMark } from '../../components/RequiredMark';

const HELP: HelpContent = {
  title: 'Prospects',
  body: [
    { type: 'p', text: "Every contact added to the outreach pipeline, across all clients and campaigns. The scraper finds and adds them automatically." },
    { type: 'p', text: "Use the ⋮ menu on each row to update their pipeline status or copy their email. Use the filters at the top to narrow by client, status, or category." },
    { type: 'ul', items: [
      "New - just added, no contact yet",
      "Contacted - email sent",
      "Replied - they responded",
      "Hot Lead - showed buying interest",
      "Won / Lost - deal resolved",
    ]},
  ],
};
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const STATUS_OPTIONS = ['all', 'new', 'contacted', 'replied', 'hot_lead', 'won', 'lost', 'generation_failed', 'message_pending'] as const;

const STATUS_LABEL: Record<string, string> = {
  all: 'All statuses', new: 'New', contacted: 'Contacted',
  replied: 'Replied', hot_lead: 'Hot lead', won: 'Won', lost: 'Lost',
  generation_failed: 'Gen. failed', message_pending: 'Msg. pending',
};

const STATUS_PILL: Record<string, { bg: string; text: string; border?: string }> = {
  new:                { bg: 'var(--ad-green-tint)', text: 'var(--ad-green)' },
  contacted:          { bg: 'var(--ad-amber-tint)', text: 'var(--ad-amber)' },
  replied:            { bg: 'var(--ad-amber-tint)', text: 'var(--ad-amber)' },
  hot_lead:           { bg: 'var(--ad-green)', text: '#fff' },
  won:                { bg: 'var(--ad-green)', text: '#fff' },
  lost:               { bg: 'transparent', text: 'var(--ad-ink-faint)', border: '1px solid var(--ad-line-strong)' },
  generation_failed:  { bg: 'var(--ad-clay-tint)', text: 'var(--ad-clay)', border: '1px solid rgba(168,83,58,0.2)' },
  message_pending:    { bg: 'var(--ad-purple-tint)', text: 'var(--ad-purple)', border: '1px solid rgba(107,79,160,0.2)' },
};

const SEARCH_DEBOUNCE_MS = 300;

const ghostCls   = 'cursor-pointer whitespace-nowrap rounded-xl border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-line-strong) hover:bg-(--ad-surface-2)';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-green) px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-(--ad-green-hover) disabled:opacity-50';
const dangerCls  = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-clay) px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-(--ad-clay-hover) disabled:opacity-50';

export function Prospects() {
  const [qInput, setQInput] = useState('');
  const [q, setQ]           = useState('');   // debounced copy of qInput, what the query uses
  const [status, setStatus] = useState('all');
  const [cat, setCat]       = useState('all');
  const [page, setPage]     = useState(1);
  const { rows: paged, total, loading, isFetching, isPlaceholderData, dataUpdatedAt, error, reload, updateStatus } =
    useProspects({ q: q.trim(), status, category: cat, page });
  const categories = useProspectCategories();
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh prospects.');
  const [showAdd, setShowAdd] = useState(false);
  const [editProspect, setEditProspect]   = useState<ProspectListRow | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<ProspectListRow | null>(null);

  useEffect(() => {
    if (qInput === q) return;
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [qInput, q]);

  const pages    = totalPages(total);
  const safePage = clampPage(page, total);

  // A delete (or a filter change landing elsewhere) can leave the current page past the end.
  useEffect(() => {
    if (!isPlaceholderData && !loading && page !== safePage) setPage(safePage);
  }, [isPlaceholderData, loading, page, safePage]);

  function updateQ(v: string)         { setQInput(v); }
  function updateFilterStatus(v: string) { setStatus(v); setPage(1); }
  function updateCat(v: string)       { setCat(v);    setPage(1); }

  const pagBtnCls = 'cursor-pointer rounded-lg border border-(--ad-line-strong) bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-(--ad-ink) transition-colors hover:bg-(--ad-surface-2) disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div style={FONT} className="flex flex-col gap-6">

      {/* Header */}
      <header className="page-header flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-(--ad-ink)"> <img src="https://cdn-icons-png.flaticon.com/128/143/143438.png" alt="Prospects" className="w-10 h-10" />Prospects</h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">{total.toLocaleString()} {q.trim() || status !== 'all' || cat !== 'all' ? 'matching' : 'total across all clients'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
          <button onClick={() => setShowAdd(true)} className={`${primaryCls} hidden md:inline-flex`}>+ Add prospect</button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3  bg-(--ad-surface) ">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <Search className="absolute left-3 h-4 w-4 text-(--ad-ink-faint) pointer-events-none" />
          <input
            value={qInput}
            onChange={(e) => updateQ(e.target.value)}
            placeholder="Search name, email, contact…"
            style={FONT}
            className="w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) py-2 pl-9 pr-3 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)"
          />
        </div>

        <Select value={status} onValueChange={updateFilterStatus}>
          <SelectTrigger
            style={FONT}
            className="h-9 w-[155px] rounded-lg border-(--ad-line) bg-(--ad-surface) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={cat} onValueChange={updateCat}>
          <SelectTrigger
            style={FONT}
            className="h-9 w-[155px] rounded-lg border-(--ad-line) bg-(--ad-surface) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)"
          >
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.category} value={c.category}>{c.category} ({c.n.toLocaleString()})</SelectItem>
            ))}
            {/* Keep a selected category visible even if the RPC list hasn't loaded or dropped it. */}
            {cat !== 'all' && !categories.some((c) => c.category === cat) && (
              <SelectItem value={cat}>{cat}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">
          {error}
        </div>
      )}

      {/* Table / Cards */}
      {loading ? (
        <SkeletonTable rows={10} cols={5} />
      ) : total === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-bold text-(--ad-ink)">No matches.</strong>
          <span className="text-[13px] text-(--ad-ink-soft)">Try adjusting your filters or search query.</span>
        </div>
      ) : (
        <div className={`flex flex-col gap-6 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[24%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr>
                  {['Business', 'Contact', 'Category', 'Location', 'Status', ''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => {
                  const pill = STATUS_PILL[r.pipeline_status] ?? STATUS_PILL.new;
                  const statusMenuItems = (
                    [
                      { type: 'header' as const, label: 'Set status' },
                      ...(['won','lost'] as const).map((s) => ({
                        type: 'action' as const,
                        label: STATUS_LABEL[s],
                        dot: STATUS_PILL[s]?.text ?? 'var(--ad-ink-faint)',
                        checked: r.pipeline_status === s,
                        onClick: () => updateStatus(r.id, s),
                      })),
                    ]
                  );
                  const copyEmailItem = r.email
                    ? [
                        { type: 'separator' as const },
                        {
                          type: 'action' as const,
                          label: 'Copy email',
                          onClick: () => navigator.clipboard.writeText(r.email!),
                        },
                      ]
                    : [];
                  const editDeleteItems = [
                    { type: 'separator' as const },
                    { type: 'action' as const, label: 'Edit prospect', onClick: () => setEditProspect(r) },
                    { type: 'action' as const, label: 'Delete prospect', destructive: true, onClick: () => setDeleteTarget(r) },
                  ];
                  return (
                    <tr key={r.id}>
                      <td className="min-w-0">
                        <div className="truncate font-bold text-(--ad-ink)" title={r.business_name}>{r.business_name}</div>
                      </td>
                      <td className="min-w-0">
                        <div className="truncate text-(--ad-ink)" title={r.contact_name ?? undefined}>{r.contact_name ?? '-'}</div>
                        {r.email && (
                          <div className="mt-0.5 truncate font-mono text-[11px] text-(--ad-ink-faint)" title={r.email}>
                            {r.email}
                          </div>
                        )}
                      </td>
                      <td className="min-w-0 text-(--ad-ink-soft)">
                        <div className="truncate" title={r.category ?? undefined}>{r.category ?? '-'}</div>
                      </td>
                      <td className="min-w-0 text-(--ad-ink-soft)">
                        <div className="truncate" title={r.location ?? undefined}>{r.location ?? '-'}</div>
                      </td>
                      <td className="pr-3">
                        <span className="atbl-pill" style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}>
                          {r.pipeline_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 text-right">
                        <RowMenu items={[...statusMenuItems, ...copyEmailItem, ...editDeleteItems]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            {paged.map((r) => {
              const pill = STATUS_PILL[r.pipeline_status] ?? STATUS_PILL.new;
              return (
                <div key={r.id} className="rounded-xl border border-(--ad-line) bg-(--ad-surface) p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 truncate font-bold text-(--ad-ink)" title={r.business_name}>{r.business_name}</div>
                    <span
                      style={{
                        background: pill.bg,
                        color: pill.text,
                        border: pill.border ?? 'none',
                      }}
                      className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]"
                    >
                      {r.pipeline_status.replace('_', ' ')}
                    </span>
                  </div>
                  {(r.contact_name || r.email) && (
                    <div className="mt-1.5">
                      {r.contact_name && (
                        <div className="truncate text-[12px] text-(--ad-ink)">{r.contact_name}</div>
                      )}
                      {r.email && (
                        <div className="mt-0.5 truncate font-mono text-[11px] text-(--ad-ink-faint)" title={r.email}>
                          {r.email}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-(--ad-ink-soft)">
                    {r.client?.business_name && (
                      <span>{r.client.business_name}</span>
                    )}
                    {r.category && (
                      <>
                        <span className="text-(--ad-ink-ghost)">·</span>
                        <span>{r.category}</span>
                      </>
                    )}
                    {r.location && (
                      <>
                        <span className="text-(--ad-ink-ghost)">·</span>
                        <span>{r.location}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-3 border-t border-(--ad-fill) pt-3 flex gap-2">
                    <button
                      onClick={() => setEditProspect(r)}
                      className="cursor-pointer rounded-lg border border-(--ad-line) bg-(--ad-surface) px-3 py-1.5 text-[12px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-green) hover:text-(--ad-green)"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="cursor-pointer rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-[12px] font-semibold text-(--ad-ink-ghost) transition-colors hover:border-(--ad-clay)/30 hover:bg-(--ad-clay-tint) hover:text-(--ad-clay)"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shared pagination */}
          <div className="flex items-center justify-between rounded-lg border border-(--ad-line) bg-(--ad-surface) px-4 py-3 text-[12.5px] text-(--ad-ink-faint)">
            <span>{rangeLabel(safePage, total)}{pages > 1 && ` · Page ${safePage} of ${pages}`}</span>
            {pages > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage <= 1 || isPlaceholderData}
                  className={pagBtnCls}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= pages || isPlaceholderData}
                  className={pagBtnCls}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile FAB */}
      <MobileFab onClick={() => setShowAdd(true)} label="Add prospect" />

      <AnimatePresence>
        {showAdd && (
          <NewProspectModal
            key="new-prospect-modal"
            onClose={() => setShowAdd(false)}
            onCreated={() => { setShowAdd(false); toast('Prospect added.'); reload(); }}
          />
        )}
        {editProspect && (
          <EditProspectModal
            key={`edit-${editProspect.id}`}
            prospect={editProspect}
            onClose={() => setEditProspect(null)}
            onSaved={() => { setEditProspect(null); toast('Prospect updated.'); reload(); }}
          />
        )}
        {deleteTarget && (
          <DeleteProspectModal
            key={`delete-${deleteTarget.id}`}
            prospect={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onDeleted={() => { setDeleteTarget(null); toast('Prospect deleted.'); reload(); }}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/* ── Add Prospect Modal (WF1) ──────────────────────────────────────── */
function NewProspectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const clients = useClientsList();
  const [clientId, setClientId]         = useState('');
  const [campaignId, setCampaignId]     = useState('');
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName]   = useState('');
  const [email, setEmail]               = useState('');
  const [phone, setPhone]               = useState('');
  const [category, setCategory]         = useState('');
  const [location, setLocation]         = useState('');
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState<string | null>(null);
  const [successId, setSuccessId]       = useState<string | null>(null);

  const campaigns = useClientCampaigns(clientId);

  function handleClientChange(id: string) {
    setClientId(id);
    setCampaignId('');
  }

  async function submit() {
    if (!clientId)             { setErr('Select a client.'); return; }
    if (!campaignId)           { setErr('Select a campaign.'); return; }
    if (!businessName.trim())  { setErr('Business name is required.'); return; }
    if (email.trim() && !isValidEmail(email))    { setErr('Enter a valid email address.'); return; }
    if (phone.trim() && !isValidPhone(phone))    { setErr('Enter a valid phone number.'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('https://n8n.shortyharris.com/webhook/wf1-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id:   campaignId,
          client_id:     clientId,
          business_name: businessName.trim(),
          contact_name:  contactName.trim(),
          email:         email.trim(),
          phone:         phone.trim() ? normalizePhone(phone) : '',
          category:      category.trim(),
          location:      location.trim(),
        }),
      });
      const json = await res.json();
      if (json.prospect_id || json.status === 'imported') {
        setSuccessId(json.prospect_id ?? '-');
        onCreated();
      } else {
        setErr(json.message ?? 'Import failed - check the response from WF1.');
      }
    } catch {
      setErr('Could not reach the import endpoint. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-(--ad-ink-faint)';
  const inputCls = 'w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)';

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
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[540px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-(--ad-ink)">Add prospect</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {successId && (
            <div className="rounded-xl border border-(--ad-green)/20 bg-(--ad-green-tint) px-4 py-3 text-[13px] text-(--ad-green)">
              Prospect imported successfully.
            </div>
          )}

          <div>
            <label className={fieldLbl}>Client<RequiredMark /></label>
            <Select value={clientId} onValueChange={handleClientChange}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)">
                <SelectValue placeholder="Select a client…" />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={fieldLbl}>Campaign<RequiredMark /></label>
            <Select value={campaignId} onValueChange={setCampaignId} disabled={!clientId}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green) disabled:opacity-50">
                <SelectValue placeholder={clientId ? 'Select a campaign…' : 'Select a client first'} />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={fieldLbl}>Business name<RequiredMark /></label>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Sunrise Plumbing" style={FONT} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLbl}>Contact name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Jane Smith" style={FONT} className={inputCls} />
            </div>
            <div>
              <label className={fieldLbl}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com" style={FONT} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLbl}>Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 512 000 0000" style={FONT} className={inputCls} />
            </div>
            <div>
              <label className={fieldLbl}>Category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Plumbing" style={FONT} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={fieldLbl}>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Austin TX" style={FONT} className={inputCls} />
          </div>

          {err && (
            <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={submit} disabled={busy} className={primaryCls}>
            {busy ? 'Importing…' : 'Import prospect'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Edit Prospect Modal ────────────────────────────────────────────── */
function EditProspectModal({
  prospect, onClose, onSaved,
}: { prospect: ProspectListRow; onClose: () => void; onSaved: () => void }) {
  const [businessName, setBusinessName] = useState(prospect.business_name);
  const [contactName, setContactName]   = useState(prospect.contact_name ?? '');
  const [email, setEmail]               = useState(prospect.email ?? '');
  const [phone, setPhone]               = useState(prospect.phone ?? '');
  const [category, setCategory]         = useState(prospect.category ?? '');
  const [location, setLocation]         = useState(prospect.location ?? '');
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState<string | null>(null);

  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-(--ad-ink-faint)';
  const inputCls = 'w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)';

  async function submit() {
    if (!businessName.trim()) { setErr('Business name is required.'); return; }
    if (email.trim() && !isValidEmail(email)) { setErr('Enter a valid email address.'); return; }
    if (phone.trim() && !isValidPhone(phone)) { setErr('Enter a valid phone number.'); return; }
    setBusy(true); setErr(null);
    const input: UpdateProspectInput = {
      business_name: businessName.trim(),
      contact_name:  contactName.trim(),
      email:         email.trim(),
      phone:         phone.trim() ? normalizePhone(phone) : '',
      category:      category.trim(),
      location:      location.trim(),
    };
    const { error } = await updateProspect(prospect.id, input);
    setBusy(false);
    if (error) setErr(error.message); else onSaved();
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
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[540px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-(--ad-ink)">Edit prospect</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <label className={fieldLbl}>Business name<RequiredMark /></label>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={FONT} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLbl}>Contact name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={FONT} className={inputCls} />
            </div>
            <div>
              <label className={fieldLbl}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={FONT} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLbl}>Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={FONT} className={inputCls} />
            </div>
            <div>
              <label className={fieldLbl}>Category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} style={FONT} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={fieldLbl}>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} style={FONT} className={inputCls} />
          </div>

          {err && (
            <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={submit} disabled={busy} className={primaryCls}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Delete Prospect Modal ─────────────────────────────────────────── */
function DeleteProspectModal({
  prospect, onClose, onDeleted,
}: { prospect: ProspectListRow; onClose: () => void; onDeleted: () => void }) {
  const [counts, setCounts] = useState<ProspectDeleteCounts | null>(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  useEffect(() => {
    getProspectDeleteCounts(prospect.id).then(setCounts);
  }, [prospect.id]);

  async function confirm() {
    setBusy(true); setErr(null);
    const { error } = await deleteProspect(prospect.id);
    setBusy(false);
    if (error) setErr(error); else onDeleted();
  }

  const blastItems = counts
    ? [
        counts.messages  > 0 && `${counts.messages} message${counts.messages !== 1 ? 's' : ''}`,
        counts.hot_leads > 0 && `${counts.hot_leads} hot lead${counts.hot_leads !== 1 ? 's' : ''}`,
        counts.replies   > 0 && `${counts.replies} repl${counts.replies !== 1 ? 'ies' : 'y'}`,
      ].filter(Boolean)
    : [];

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
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[540px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-(--ad-ink)">Delete prospect</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-4">
            <p className="m-0 text-[14px] font-bold text-(--ad-clay)">
              Permanently delete "{prospect.business_name}"?
            </p>
            <p className="m-0 mt-1.5 text-[13px] text-(--ad-clay)/80">
              This action cannot be undone. All data associated with this prospect will be permanently deleted.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[.06em] text-(--ad-ink-faint)">This will permanently delete:</p>
            {!counts ? (
              <div className="flex items-center gap-2 text-[13px] text-(--ad-ink-faint)">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-(--ad-line-strong) border-t-(--ad-clay)" />
                Counting affected records…
              </div>
            ) : blastItems.length === 0 ? (
              <p className="text-[13px] text-(--ad-ink-soft)">No associated records - the prospect row only.</p>
            ) : (
              <ul className="m-0 list-none p-0 flex flex-col gap-1">
                {blastItems.map((item) => (
                  <li key={String(item)} className="flex items-center gap-2 text-[13px] text-(--ad-ink-soft)">
                    <span className="text-(--ad-clay)">✕</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {err && (
            <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={confirm} disabled={busy || !counts} className={dangerCls}>
            {busy ? 'Deleting…' : `Delete ${prospect.business_name}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
