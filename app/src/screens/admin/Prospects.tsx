import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useProspects, useClientsList, useClientCampaigns,
  updateProspect, getProspectDeleteCounts, deleteProspect,
} from '../../hooks/useAdminData';
import type { ProspectListRow, UpdateProspectInput, ProspectDeleteCounts } from '../../hooks/useAdminData';
import { SkeletonTable } from '../../components/Skeleton';
import { RowMenu } from '../../components/RowMenu';
import { HelpButton, type HelpContent } from '../../components/HelpButton';

const HELP: HelpContent = {
  title: 'Prospects',
  body: [
    { type: 'p', text: "Every contact added to the outreach pipeline, across all clients and campaigns. The scraper finds and adds them automatically." },
    { type: 'p', text: "Use the ⋮ menu on each row to update their pipeline status or copy their email. Use the filters at the top to narrow by client, status, or category." },
    { type: 'ul', items: [
      "New — just added, no contact yet",
      "Contacted — email sent",
      "Replied — they responded",
      "Hot Lead — showed buying interest",
      "Won / Lost — deal resolved",
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
  new:                { bg: '#edf4ef', text: '#3c7a5b' },
  contacted:          { bg: '#f8efdb', text: '#b9831f' },
  replied:            { bg: '#f8efdb', text: '#b9831f' },
  hot_lead:           { bg: '#3c7a5b', text: '#fff' },
  won:                { bg: '#3c7a5b', text: '#fff' },
  lost:               { bg: 'transparent', text: '#9a9d92', border: '1px solid #ddd8cb' },
  generation_failed:  { bg: '#f6e8e2', text: '#a8533a', border: '1px solid rgba(168,83,58,0.2)' },
  message_pending:    { bg: '#f0ecf8', text: '#6b4fa0', border: '1px solid rgba(107,79,160,0.2)' },
};

const PAGE_SIZE = 15;

const ghostCls   = 'cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#3c7a5b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:opacity-50';
const dangerCls  = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#a8533a] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#8a3f2b] disabled:opacity-50';

export function Prospects() {
  const { rows, loading, error, reload, updateStatus } = useProspects();
  const [q, setQ]           = useState('');
  const [status, setStatus] = useState('all');
  const [cat, setCat]       = useState('all');
  const [page, setPage]     = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editProspect, setEditProspect]   = useState<ProspectListRow | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<ProspectListRow | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (status !== 'all' && r.pipeline_status !== status) return false;
    if (cat !== 'all' && r.category !== cat) return false;
    if (q) {
      const hay = `${r.business_name} ${r.email ?? ''} ${r.contact_name ?? ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function updateQ(v: string)         { setQ(v);      setPage(1); }
  function updateFilterStatus(v: string) { setStatus(v); setPage(1); }
  function updateCat(v: string)       { setCat(v);    setPage(1); }

  const pagBtnCls = 'cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div style={FONT} className="flex flex-col gap-6">

      {/* Header */}
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]"> <img src="https://cdn-icons-png.flaticon.com/128/143/143438.png" alt="Prospects" className="w-10 h-10" />Prospects</h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">{rows.length} total across all clients</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <button onClick={reload} className={ghostCls}>Refresh</button>
          <button onClick={() => setShowAdd(true)} className={`${primaryCls} hidden md:inline-flex`}>+ Add prospect</button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#ece8df] bg-white p-3">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <Search className="absolute left-3 h-4 w-4 text-[#9a9d92] pointer-events-none" />
          <input
            value={q}
            onChange={(e) => updateQ(e.target.value)}
            placeholder="Search name, email, contact…"
            style={FONT}
            className="w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] py-2 pl-9 pr-3 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white"
          />
        </div>

        <Select value={status} onValueChange={updateFilterStatus}>
          <SelectTrigger
            style={FONT}
            className="h-9 w-[155px] rounded-lg border-[#ece8df] bg-white text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={cat} onValueChange={updateCat}>
          <SelectTrigger
            style={FONT}
            className="h-9 w-[155px] rounded-lg border-[#ece8df] bg-white text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]"
          >
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">
          {error}
        </div>
      )}

      {/* Table / Cards */}
      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={6} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">No matches.</strong>
          <span className="text-[13px] text-[#62655c]">Try adjusting your filters or search query.</span>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table>
              <thead>
                <tr>
                  {['Business', 'Contact', 'Client', 'Category', 'Location', 'Status', ''].map((h) => (
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
                        dot: STATUS_PILL[s]?.text ?? '#9a9d92',
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
                      <td className="font-bold text-[#20211c]">{r.business_name}</td>
                      <td>
                        <div className="text-[#20211c]">{r.contact_name ?? '—'}</div>
                        {r.email && (
  <div
    className="mt-0.5 font-mono text-[11px] text-[#9a9d92] truncate max-w-[220px]"
    title={r.email}
  >
    {r.email}
  </div>
)}
                      </td>
                      <td className="text-[#62655c]">{r.client?.business_name ?? '—'}</td>
                      <td className="text-[#62655c]">{r.category ?? '—'}</td>
                      <td className="text-[#62655c]">{r.location ?? '—'}</td>
                      <td>
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
                <div key={r.id} className="rounded-xl border border-[#ece8df] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-bold text-[#20211c]">{r.business_name}</div>
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
                        <div className="text-[12px] text-[#20211c]">{r.contact_name}</div>
                      )}
                     {r.email && (
  <div
    className="mt-0.5 font-mono text-[11px] text-[#9a9d92] truncate max-w-[220px]"
    title={r.email}
  >
    {r.email}
  </div>
)}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#62655c]">
                    {r.client?.business_name && (
                      <span>{r.client.business_name}</span>
                    )}
                    {r.category && (
                      <>
                        <span className="text-[#c4bfb5]">·</span>
                        <span>{r.category}</span>
                      </>
                    )}
                    {r.location && (
                      <>
                        <span className="text-[#c4bfb5]">·</span>
                        <span>{r.location}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-3 border-t border-[#f5f2ec] pt-3 flex gap-2">
                    <button
                      onClick={() => setEditProspect(r)}
                      className="cursor-pointer rounded-lg border border-[#ece8df] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="cursor-pointer rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-[12px] font-semibold text-[#c4bfb5] transition-colors hover:border-[#a8533a]/30 hover:bg-[#fdf0ec] hover:text-[#a8533a]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
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

      {/* Mobile FAB */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-[#3c7a5b] text-white shadow-[0_4px_20px_rgba(60,122,91,0.35)] text-[28px] leading-none transition-colors hover:bg-[#2d5e46]"
        aria-label="Add prospect"
      >
        +
      </button>

      <AnimatePresence>
        {showAdd && (
          <NewProspectModal
            key="new-prospect-modal"
            onClose={() => setShowAdd(false)}
            onCreated={() => { setShowAdd(false); reload(); }}
          />
        )}
        {editProspect && (
          <EditProspectModal
            key={`edit-${editProspect.id}`}
            prospect={editProspect}
            onClose={() => setEditProspect(null)}
            onSaved={() => { setEditProspect(null); reload(); }}
          />
        )}
        {deleteTarget && (
          <DeleteProspectModal
            key={`delete-${deleteTarget.id}`}
            prospect={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onDeleted={() => { setDeleteTarget(null); reload(); }}
          />
        )}
      </AnimatePresence>
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
          phone:         phone.trim(),
          category:      category.trim(),
          location:      location.trim(),
        }),
      });
      const json = await res.json();
      if (json.prospect_id || json.status === 'imported') {
        setSuccessId(json.prospect_id ?? '—');
        onCreated();
      } else {
        setErr(json.message ?? 'Import failed — check the response from WF1.');
      }
    } catch {
      setErr('Could not reach the import endpoint. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
  const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

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
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[540px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Add prospect</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {successId && (
            <div className="rounded-xl border border-[#3c7a5b]/20 bg-[#edf4ef] px-4 py-3 text-[13px] text-[#3c7a5b]">
              Prospect imported successfully.
            </div>
          )}

          <div>
            <label className={fieldLbl}>Client <span className="text-[#a8533a]">*</span></label>
            <Select value={clientId} onValueChange={handleClientChange}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]">
                <SelectValue placeholder="Select a client…" />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={fieldLbl}>Campaign <span className="text-[#a8533a]">*</span></label>
            <Select value={campaignId} onValueChange={setCampaignId} disabled={!clientId}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b] disabled:opacity-50">
                <SelectValue placeholder={clientId ? 'Select a campaign…' : 'Select a client first'} />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={fieldLbl}>Business name <span className="text-[#a8533a]">*</span></label>
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
            <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
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

  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
  const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

  async function submit() {
    if (!businessName.trim()) { setErr('Business name is required.'); return; }
    setBusy(true); setErr(null);
    const input: UpdateProspectInput = {
      business_name: businessName.trim(),
      contact_name:  contactName.trim(),
      email:         email.trim(),
      phone:         phone.trim(),
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
      onClick={onClose}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[540px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Edit prospect</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <label className={fieldLbl}>Business name <span className="text-[#a8533a]">*</span></label>
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
            <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
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
      onClick={onClose}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[540px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Delete prospect</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div className="rounded-xl border border-[#a8533a]/20 bg-[#fdf0ec] px-4 py-4">
            <p className="m-0 text-[14px] font-bold text-[#a8533a]">
              Permanently delete "{prospect.business_name}"?
            </p>
            <p className="m-0 mt-1.5 text-[13px] text-[#a8533a]/80">
              This action cannot be undone. All data associated with this prospect will be permanently deleted.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">This will permanently delete:</p>
            {!counts ? (
              <div className="flex items-center gap-2 text-[13px] text-[#9a9d92]">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#ddd8cb] border-t-[#a8533a]" />
                Counting affected records…
              </div>
            ) : blastItems.length === 0 ? (
              <p className="text-[13px] text-[#62655c]">No associated records — the prospect row only.</p>
            ) : (
              <ul className="m-0 list-none p-0 flex flex-col gap-1">
                {blastItems.map((item) => (
                  <li key={String(item)} className="flex items-center gap-2 text-[13px] text-[#62655c]">
                    <span className="text-[#a8533a]">✕</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {err && (
            <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={confirm} disabled={busy || !counts} className={dangerCls}>
            {busy ? 'Deleting…' : `Delete ${prospect.business_name}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
