import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useClients, createClient, sendClientInvite,
  updateClient, getClientDeleteCounts, deleteClient,
} from '../../hooks/useAdminData';
import type {
  NewClientInput, UpdateClientInput, ClientListRow, ClientDeleteCounts,
} from '../../hooks/useAdminData';
import { SkeletonTable } from '../../components/Skeleton';
import { RowMenu } from '../../components/RowMenu';
import { HelpButton, type HelpContent } from '../../components/HelpButton';

const HELP: HelpContent = {
  title: 'Clients',
  body: [
    { type: 'p', text: "Every business you run outreach for. Add new clients here, update their details, and send them a login invite so they can view their own Hot Leads." },
    { type: 'p', text: "Clicking Invite emails the client a secure link. Once they click it and set a password, they can log in to their dashboard." },
    { type: 'ul', items: [
      "Active — outreach is running",
      "Paused — campaigns on hold",
      "Churned — no longer active",
    ]},
  ],
};
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const CHANNEL_PILL: Record<string, { bg: string; text: string }> = {
  whatsapp: { bg: '#edf4ef', text: '#3c7a5b' },
  sms:      { bg: '#f8efdb', text: '#b9831f' },
};

const STATUS_PILL: Record<string, { bg: string; text: string }> = {
  active:  { bg: '#edf4ef', text: '#3c7a5b' },
  paused:  { bg: '#f8efdb', text: '#b9831f' },
  churned: { bg: '#f5f2ec', text: '#9a9d92' },
};

const ghostCls   = 'cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#3c7a5b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:opacity-50';
const dangerCls  = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#a8533a] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#8a3f2b] disabled:opacity-50';
const PAGE_SIZE  = 15;

const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

type InvitePhase = 'idle' | 'sending' | 'sent' | 'active' | 'error';

export function Clients() {
  const { rows, loading, error, reload } = useClients();
  const [showNew, setShowNew]     = useState(false);
  const [editClient, setEditClient]     = useState<ClientListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientListRow | null>(null);
  const [page, setPage]           = useState(1);
  const [invitePhase, setInvitePhase]   = useState<Record<string, InvitePhase>>({});
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function handleInvite(c: ClientListRow) {
    if (!c.contact_email) return;
    setInvitePhase((p) => ({ ...p, [c.id]: 'sending' }));
    setInviteErrors((e) => { const n = { ...e }; delete n[c.id]; return n; });
    const { error: err, alreadyActive } = await sendClientInvite(c.id, c.contact_email, c.business_name);
    if (err) {
      setInvitePhase((p) => ({ ...p, [c.id]: alreadyActive ? 'active' : 'error' }));
      if (!alreadyActive) setInviteErrors((e) => ({ ...e, [c.id]: err }));
    } else {
      setInvitePhase((p) => ({ ...p, [c.id]: 'sent' }));
    }
  }

  const pagBtnCls = 'cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-2 font-extrabold tracking-tight text-[#20211c]">
            <img src="https://cdn-icons-png.flaticon.com/128/143/143438.png" alt="Clients" className="w-9 h-9" />
            Clients
          </h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">{rows.length} client{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <button onClick={reload} className={ghostCls}>Refresh</button>
          <button onClick={() => setShowNew(true)} className={`${primaryCls} hidden md:inline-flex`}>+ New client</button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={6} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">No clients yet.</strong>
          <span className="text-[13px] text-[#62655c]">Create the first client to get started.</span>
          <button onClick={() => setShowNew(true)} className={`${primaryCls} mt-2`}>+ New client</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table>
              <thead>
                <tr>
                  {['Business', 'Type', 'Location', 'Added', 'Notify', 'Status', 'Invite', ''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => {
                  const ch    = c.notification_channel ?? 'whatsapp';
                  const cpill = CHANNEL_PILL[ch] ?? CHANNEL_PILL.whatsapp;
                  const spill = STATUS_PILL[c.status] ?? STATUS_PILL.active;
                  const phase = invitePhase[c.id] ?? 'idle';
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="font-bold text-[#20211c]">{c.business_name}</div>
                        {c.contact_email && <div className="mt-0.5 font-mono text-[11px] text-[#9a9d92]">{c.contact_email}</div>}
                        {c.contact_phone && <div className="font-mono text-[11px] text-[#c4bfb5]">{c.contact_phone}</div>}
                      </td>
                      <td className="text-[#62655c]">{c.business_type ?? '—'}</td>
                      <td className="text-[#62655c]">{c.location ?? '—'}</td>
                      <td className="text-[12px] text-[#9a9d92] whitespace-nowrap">
                        {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td>
                        <span className="atbl-pill" style={{ background: cpill.bg, color: cpill.text }}>
                          {ch}
                        </span>
                      </td>
                      <td>
                        <span className="atbl-pill" style={{ background: spill.bg, color: spill.text }}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <InviteCell
                          client={c}
                          phase={phase}
                          errMsg={inviteErrors[c.id]}
                          onInvite={() => handleInvite(c)}
                        />
                      </td>
                      <td className="px-3 text-right">
                        <RowMenu items={[
                          { type: 'action', label: 'Edit client', onClick: () => setEditClient(c) },
                          {
                            type: 'action',
                            label: phase === 'sent' || c.has_profile ? 'Resend invite' : 'Send invite',
                            onClick: () => handleInvite(c),
                            disabled: !c.contact_email || phase === 'sending' || phase === 'active',
                          },
                          { type: 'separator' },
                          { type: 'action', label: 'Delete client', destructive: true, onClick: () => setDeleteTarget(c) },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            {paged.map((c) => {
              const ch   = c.notification_channel ?? 'whatsapp';
              const pill = CHANNEL_PILL[ch] ?? CHANNEL_PILL.whatsapp;
              const spill = STATUS_PILL[c.status] ?? STATUS_PILL.active;
              return (
                <div key={c.id} className="rounded-xl border border-[#ece8df] bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-[14px] text-[#20211c]">{c.business_name}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span style={{ background: spill.bg, color: spill.text }}
                        className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em]">
                        {c.status}
                      </span>
                      <span style={{ background: pill.bg, color: pill.text }}
                        className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em]">
                        {ch}
                      </span>
                    </div>
                  </div>
                  {(c.business_type || c.location) && (
                    <p className="mt-1 text-[12px] text-[#62655c]">
                      {[c.business_type, c.location].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <div className="mt-2 flex flex-col gap-0.5">
                    {c.contact_email && <span className="font-mono text-[11px] text-[#9a9d92]">{c.contact_email}</span>}
                    {c.contact_phone && <span className="font-mono text-[11px] text-[#c4bfb5]">{c.contact_phone}</span>}
                  </div>
                  <div className="mt-3 border-t border-[#f5f2ec] pt-3 flex flex-wrap items-center gap-2">
                    <InviteCell
                      client={c}
                      phase={invitePhase[c.id] ?? 'idle'}
                      errMsg={inviteErrors[c.id]}
                      onInvite={() => handleInvite(c)}
                    />
                    <button
                      onClick={() => setEditClient(c)}
                      className="cursor-pointer rounded-lg border border-[#ece8df] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(c)}
                      className="cursor-pointer rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-[12px] font-semibold text-[#c4bfb5] transition-colors hover:border-[#a8533a]/30 hover:bg-[#fdf0ec] hover:text-[#a8533a]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-[#ece8df] bg-white px-4 py-3 text-[12.5px] text-[#9a9d92]">
              <span>Page {safePage} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} className={pagBtnCls}>Previous</button>
                <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} className={pagBtnCls}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Mobile FAB */}
      <button
        onClick={() => setShowNew(true)}
        className="fixed bottom-6 right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-[#3c7a5b] text-white shadow-[0_4px_20px_rgba(60,122,91,0.35)] text-[28px] leading-none transition-colors hover:bg-[#2d5e46]"
        aria-label="New client"
      >
        +
      </button>

      <AnimatePresence>
        {showNew && (
          <NewClientModal
            key="new-client-modal"
            onClose={() => setShowNew(false)}
            onCreated={() => { setShowNew(false); reload(); }}
          />
        )}
        {editClient && (
          <EditClientModal
            key={`edit-${editClient.id}`}
            client={editClient}
            onClose={() => setEditClient(null)}
            onSaved={() => { setEditClient(null); reload(); }}
          />
        )}
        {deleteTarget && (
          <DeleteClientModal
            key={`delete-${deleteTarget.id}`}
            client={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onDeleted={() => { setDeleteTarget(null); reload(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Invite cell ───────────────────────────────────────────────────── */
function InviteCell({
  client, phase, errMsg, onInvite,
}: {
  client: ClientListRow;
  phase: InvitePhase;
  errMsg: string | undefined;
  onInvite: () => void;
}) {
  if (!client.contact_email) {
    return <span className="text-[11px] text-[#c4bfb5]">No email</span>;
  }
  if (phase === 'sending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#9a9d92]">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#ddd8cb] border-t-[#3c7a5b]" />
        Sending…
      </span>
    );
  }
  if (phase === 'sent') {
    return <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3c7a5b]">✓ Invite sent</span>;
  }
  if (phase === 'active') {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#f5f2ec] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em] text-[#62655c]">
        Account active
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={onInvite}
        className={`cursor-pointer inline-flex items-center whitespace-nowrap rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
          client.has_profile
            ? 'border-[#ece8df] bg-white text-[#62655c] hover:border-[#ddd8cb] hover:bg-[#fbf9f5]'
            : 'border-[#3c7a5b] bg-[#edf4ef] text-[#3c7a5b] hover:bg-[#d9ede3]'
        }`}
      >
        {client.has_profile ? 'Resend invite' : 'Send invite'}
      </button>
      {phase === 'error' && errMsg && (
        <span className="text-[11px] leading-snug text-[#a8533a]">{errMsg}</span>
      )}
    </div>
  );
}

/* ── Modal shell ───────────────────────────────────────────────────── */
function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[560px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ── New Client Modal ──────────────────────────────────────────────── */
function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [businessName, setBusinessName]       = useState('');
  const [businessType, setBusinessType]       = useState('');
  const [location, setLocation]               = useState('');
  const [contactEmail, setContactEmail]       = useState('');
  const [contactPhone, setContactPhone]       = useState('');
  const [notifChannel, setNotifChannel]       = useState<NewClientInput['notification_channel']>('whatsapp');
  const [startingCredits, setStartingCredits] = useState(0);
  const [busy, setBusy]                       = useState(false);
  const [err, setErr]                         = useState<string | null>(null);
  const reqStar = <span className="ml-0.5 text-[#a8533a]">*</span>;

  async function submit() {
    if (!businessName.trim()) { setErr('Business name is required.'); return; }
    if (!contactEmail.trim()) { setErr('Contact email is required.'); return; }
    if (!contactPhone.trim()) { setErr('Contact phone is required.'); return; }
    setBusy(true); setErr(null);
    const { error } = await createClient({
      business_name: businessName.trim(), business_type: businessType.trim(),
      location: location.trim(), contact_email: contactEmail.trim(),
      contact_phone: contactPhone.trim(), notification_channel: notifChannel,
      starting_credits: startingCredits,
    });
    setBusy(false);
    if (error) setErr(error.message); else onCreated();
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
        <h2 className="m-0 text-[18px] font-bold text-[#20211c]">New client</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div>
          <label className={fieldLbl}>Business name{reqStar}</label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Acme Roofing" style={FONT} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLbl}>Business type</label>
            <input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="e.g. Roofing" style={FONT} className={inputCls} />
          </div>
          <div>
            <label className={fieldLbl}>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Austin TX" style={FONT} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={fieldLbl}>Contact email{reqStar}</label>
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="owner@example.com" style={FONT} className={inputCls} />
        </div>
        <div>
          <label className={fieldLbl}>Contact phone{reqStar}</label>
          <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 512 000 0000" style={FONT} className={inputCls} />
          <p className="mt-1 text-[11px] text-[#9a9d92]">Required for hot-lead WhatsApp / SMS notifications.</p>
        </div>
        <div>
          <label className={fieldLbl}>Notification channel</label>
          <Select value={notifChannel} onValueChange={(v) => setNotifChannel(v as NewClientInput['notification_channel'])}>
            <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]"><SelectValue /></SelectTrigger>
            <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="border-t border-[#f0ede6] pt-3">
          <label className={fieldLbl}>Starting credits</label>
          <input type="number" min={0} value={startingCredits}
            onChange={(e) => setStartingCredits(Math.max(0, Number(e.target.value)))} style={FONT} className={inputCls} />
          <p className="mt-1 text-[11px] text-[#9a9d92]">Added to the billing profile on creation. A default campaign is also created automatically.</p>
        </div>
        {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Cancel</button>
        <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Creating…' : 'Create client'}</button>
      </div>
    </ModalShell>
  );
}

/* ── Edit Client Modal ─────────────────────────────────────────────── */
function EditClientModal({
  client, onClose, onSaved,
}: { client: ClientListRow; onClose: () => void; onSaved: () => void }) {
  const [businessName, setBusinessName] = useState(client.business_name);
  const [businessType, setBusinessType] = useState(client.business_type ?? '');
  const [location, setLocation]         = useState(client.location ?? '');
  const [contactEmail, setContactEmail] = useState(client.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(client.contact_phone ?? '');
  const [notifChannel, setNotifChannel] = useState<UpdateClientInput['notification_channel']>(
    (client.notification_channel as UpdateClientInput['notification_channel']) ?? 'whatsapp',
  );
  const [status, setStatus] = useState<UpdateClientInput['status']>(
    (client.status as UpdateClientInput['status']) ?? 'active',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const reqStar = <span className="ml-0.5 text-[#a8533a]">*</span>;

  async function submit() {
    if (!businessName.trim()) { setErr('Business name is required.'); return; }
    if (!contactEmail.trim()) { setErr('Contact email is required.'); return; }
    if (!contactPhone.trim()) { setErr('Contact phone is required.'); return; }
    setBusy(true); setErr(null);
    const { error } = await updateClient(client.id, {
      business_name: businessName.trim(), business_type: businessType.trim(),
      location: location.trim(), contact_email: contactEmail.trim(),
      contact_phone: contactPhone.trim(), notification_channel: notifChannel, status,
    });
    setBusy(false);
    if (error) setErr(error.message); else onSaved();
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
        <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Edit client</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div>
          <label className={fieldLbl}>Business name{reqStar}</label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={FONT} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLbl}>Business type</label>
            <input value={businessType} onChange={(e) => setBusinessType(e.target.value)} style={FONT} className={inputCls} />
          </div>
          <div>
            <label className={fieldLbl}>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} style={FONT} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={fieldLbl}>Contact email{reqStar}</label>
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={FONT} className={inputCls} />
        </div>
        <div>
          <label className={fieldLbl}>Contact phone{reqStar}</label>
          <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={FONT} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLbl}>Notification channel</label>
            <Select value={notifChannel} onValueChange={(v) => setNotifChannel(v as UpdateClientInput['notification_channel'])}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]"><SelectValue /></SelectTrigger>
              <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={fieldLbl}>Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as UpdateClientInput['status'])}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]"><SelectValue /></SelectTrigger>
              <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Cancel</button>
        <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </ModalShell>
  );
}

/* ── Delete Client Modal ───────────────────────────────────────────── */
function DeleteClientModal({
  client, onClose, onDeleted,
}: { client: ClientListRow; onClose: () => void; onDeleted: () => void }) {
  const [counts, setCounts]   = useState<ClientDeleteCounts | null>(null);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  useEffect(() => {
    getClientDeleteCounts(client.id).then(setCounts);
  }, [client.id]);

  async function confirm() {
    setBusy(true); setErr(null);
    const { error } = await deleteClient(client.id);
    setBusy(false);
    if (error) setErr(error); else onDeleted();
  }

  const blastItems = counts
    ? [
        counts.campaigns  > 0 && `${counts.campaigns} campaign${counts.campaigns !== 1 ? 's' : ''}`,
        counts.prospects  > 0 && `${counts.prospects} prospect${counts.prospects !== 1 ? 's' : ''}`,
        counts.messages   > 0 && `${counts.messages} message${counts.messages !== 1 ? 's' : ''}`,
        counts.hot_leads  > 0 && `${counts.hot_leads} hot lead${counts.hot_leads !== 1 ? 's' : ''}`,
        counts.replies    > 0 && `${counts.replies} repl${counts.replies !== 1 ? 'ies' : 'y'}`,
      ].filter(Boolean)
    : [];

  return (
    <ModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
        <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Delete client</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#fdf0ec] px-4 py-4">
          <p className="m-0 text-[14px] font-bold text-[#a8533a]">
            Permanently delete "{client.business_name}"?
          </p>
          <p className="m-0 mt-1.5 text-[13px] text-[#a8533a]/80">
            This action cannot be undone. All data associated with this client will be permanently deleted.
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
            <p className="text-[13px] text-[#62655c]">No associated records — the client row only.</p>
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
          {client.has_profile && (
            <p className="mt-3 text-[12px] text-[#62655c]">
              This client has a login account — it will also be deleted.
            </p>
          )}
        </div>

        {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Cancel</button>
        <button
          onClick={confirm}
          disabled={busy || !counts}
          className={dangerCls}
        >
          {busy ? 'Deleting…' : `Delete ${client.business_name} and all related data`}
        </button>
      </div>
    </ModalShell>
  );
}
