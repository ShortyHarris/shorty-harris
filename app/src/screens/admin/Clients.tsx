import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { StatusPill, PILL, type StatusPillStyle } from '../../components/StatusPill';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useClients, createClient, sendClientInvite, updateClientLoginEmail,
  updateClient, getClientDeleteCounts, deleteClient, getClientUsage,
  adjustClientCredits, getClientCreditHistory,
} from '../../hooks/useAdminData';
import type {
  NewClientInput, UpdateClientInput, ClientListRow, ClientDeleteCounts, ClientUsage, CreditTransaction,
} from '../../hooks/useAdminData';
import { SkeletonTable } from '../../components/Skeleton';
import { MobileFab } from '../../components/MobileFab';
import { RowMenu } from '../../components/RowMenu';
import { SendingCard } from '../../components/SendingPanel';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import { isValidEmail, isValidPhone, normalizePhone } from '../../lib/validation';
import { RequiredMark } from '../../components/RequiredMark';
import { TimezoneSelect } from '../../components/TimezoneSelect';
import { CountrySelect } from '../../components/CountrySelect';
import {
  defaultTimezoneForCountry, DEFAULT_TIMEZONE, suggestedTimezonesForCountry, timezoneLabel,
} from '../../lib/timezones';
import { capSearchTerms, getActiveCampaignLimits } from '../../lib/campaignLimits';

const HELP: HelpContent = {
  title: 'Clients',
  body: [
    { type: 'p', text: "Every business you run outreach for. Add new clients here, update their details, and send them a login invite so they can view their own Hot Leads." },
    { type: 'p', text: "Clicking Invite emails the client a secure link. Once they click it and set a password, they can log in to their dashboard." },
    { type: 'ul', items: [
      "Active - outreach is running",
      "Paused - campaigns on hold",
      "Churned - no longer active",
    ]},
  ],
};
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const CHANNEL_PILL: Record<string, { bg: string; text: string }> = {
  whatsapp: { bg: 'var(--ad-green-tint)', text: 'var(--ad-green)' },
  sms:      { bg: 'var(--ad-amber-tint)', text: 'var(--ad-amber)' },
};

const STATUS_PILL: Record<string, StatusPillStyle> = {
  draft:   { ...PILL.ahead,   icon: 'circle' },
  active:  { ...PILL.waiting, icon: 'check' },
  paused:  { ...PILL.ahead,   icon: 'clock' },
  churned: { ...PILL.closed,  icon: 'minus' },
};

const ghostCls   = 'cursor-pointer whitespace-nowrap rounded-xl border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-line-strong) hover:bg-(--ad-surface-2)';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-green) px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-(--ad-green-hover) disabled:opacity-50';
const dangerCls  = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-clay) px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-(--ad-clay-hover) disabled:opacity-50';
const PAGE_SIZE  = 15;

const fieldLbl = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)';
const inputCls = 'w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)';

type InvitePhase = 'idle' | 'sending' | 'sent' | 'active' | 'error';

export function Clients() {
  const navigate = useNavigate();
  const { rows, loading, isFetching, dataUpdatedAt, error, reload } = useClients();
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh clients.');
  const [showNew, setShowNew]     = useState(false);
  const [editClient, setEditClient]     = useState<ClientListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientListRow | null>(null);
  const [changeEmailTarget, setChangeEmailTarget] = useState<ClientListRow | null>(null);
  const [creditsTarget, setCreditsTarget] = useState<ClientListRow | null>(null);
  const [sendingTarget, setSendingTarget] = useState<ClientListRow | null>(null);
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
    const { error: err, alreadyActive, resent } = await sendClientInvite(c.id, c.contact_email, c.business_name);
    if (err) {
      setInvitePhase((p) => ({ ...p, [c.id]: alreadyActive ? 'active' : 'error' }));
      if (!alreadyActive) {
        setInviteErrors((e) => ({ ...e, [c.id]: err }));
        toast(`Couldn't send invite to ${c.business_name}: ${err}`, 'error');
      } else {
        toast(`${c.business_name} already has an active account.`, 'warning');
      }
      // A DB trigger stamps profiles.activated_at on first sign-in, so this
      // reload just refreshes the row to show the disabled state up front
      // instead of only finding out on click.
      if (alreadyActive) reload();
    } else {
      setInvitePhase((p) => ({ ...p, [c.id]: 'sent' }));
      // A resend for someone who never signed in goes out as a password-setup (reset) email, not the original invite.
      toast(resent
        ? `Password-setup link sent to ${c.contact_email}. (Resends use the password-reset email, not the original invite.)`
        : `Invite sent to ${c.contact_email}.`);
    }
  }

  const pagBtnCls = 'cursor-pointer rounded-lg border border-(--ad-line-strong) bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-(--ad-ink) transition-colors hover:bg-(--ad-surface-2) disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="page-header flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-2 font-extrabold tracking-tight text-(--ad-ink)">
            <img src="https://cdn-icons-png.flaticon.com/128/143/143438.png" alt="Clients" className="w-9 h-9" />
            Clients
          </h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">{rows.length} client{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
          <button onClick={() => setShowNew(true)} className={`${primaryCls} hidden md:inline-flex`}>+ New client</button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={7} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-semibold text-(--ad-ink)">No clients yet.</strong>
          <span className="text-[13px] text-(--ad-ink-soft)">Create the first client to get started.</span>
          <button onClick={() => setShowNew(true)} className={`${primaryCls} mt-2`}>+ New client</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[15%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
                <col className="w-[15%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead>
                <tr>
                  {['Business', 'Representative', 'Added', 'Status', 'Credits', 'Invite', ''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => {
                  const spill = STATUS_PILL[c.status] ?? STATUS_PILL.active;
                  const phase = invitePhase[c.id] ?? 'idle';
                  return (
                    <tr key={c.id} onClick={() => setEditClient(c)} className="group cursor-pointer">
                      <td className="min-w-0">
                        <div className="truncate font-semibold text-(--ad-ink) group-hover:underline" title={c.business_name}>{c.business_name}</div>
                        <span className="mt-0.5 inline-block max-w-full truncate rounded-full bg-(--ad-fill) px-2 py-0.5 text-[10px] font-semibold text-(--ad-ink-faint)" title={`Send timezone: ${c.send_timezone}`}>
                          {timezoneLabel(c.send_timezone)}
                        </span>
                      </td>
                      <td className="min-w-0 text-(--ad-ink-soft)">
                        <div className="truncate" title={c.representative_name ?? undefined}>{c.representative_name || '-'}</div>
                      </td>
                      <td className="text-[12px] text-(--ad-ink-faint) whitespace-nowrap">
                        {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td>
                        <StatusPill pill={spill}>
                          {c.status}
                        </StatusPill>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-(--ad-ink)">{c.credits_remaining}</span>
                          <button
                            onClick={() => setCreditsTarget(c)}
                            className="cursor-pointer rounded-lg border border-(--ad-line) bg-(--ad-surface) px-2 py-1 text-[11px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-green) hover:text-(--ad-green)"
                          >
                            Add credits
                          </button>
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <InviteCell
                          client={c}
                          phase={phase}
                          errMsg={inviteErrors[c.id]}
                          onInvite={() => handleInvite(c)}
                        />
                      </td>
                      <td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowMenu items={[
                          { type: 'action', label: 'View as client', onClick: () => navigate(`/admin/impersonate/${c.id}`) },
                          { type: 'action', label: 'Edit client', onClick: () => setEditClient(c) },
                          { type: 'action', label: 'Sending', onClick: () => setSendingTarget(c) },
                          { type: 'action', label: 'Add credits', onClick: () => setCreditsTarget(c) },
                          {
                            type: 'action',
                            label: (phase === 'active' || c.activated_at) ? 'Activated' : phase === 'sent' || c.has_profile ? 'Resend invite' : 'Send invite',
                            onClick: () => handleInvite(c),
                            disabled: c.is_internal || !c.contact_email || phase === 'sending' || phase === 'active' || !!c.activated_at,
                            title: c.is_internal
                              ? 'Internal client - no invite needed.'
                              : (phase === 'active' || c.activated_at)
                              ? "This client can already sign in - resending won't do anything. Have them log in directly, or use “Forgot password” on the login screen if they've lost access."
                              : undefined,
                          },
                          {
                            type: 'action',
                            label: 'Change login email',
                            onClick: () => setChangeEmailTarget(c),
                            disabled: !c.has_profile,
                            title: !c.has_profile ? "This client has no login account yet - send an invite first." : undefined,
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
                <div key={c.id} className="rounded-xl border border-(--ad-line) bg-(--ad-surface) p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold text-[14px] text-(--ad-ink)" title={c.business_name}>{c.business_name}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span style={{ background: spill.bg, color: spill.text }}
                        className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.04em]">
                        {c.status}
                      </span>
                      <span style={{ background: pill.bg, color: pill.text }}
                        className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.04em]">
                        {ch}
                      </span>
                    </div>
                  </div>
                  {(c.business_type || c.location) && (
                    <p className="mt-1 text-[12px] text-(--ad-ink-soft)">
                      {[c.business_type, c.location].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-(--ad-ink-faint)" title={`Send timezone: ${c.send_timezone}`}>
                    {timezoneLabel(c.send_timezone)}
                  </p>
                  <div className="mt-2 flex flex-col gap-0.5">
                    {c.contact_email && <span className="font-mono text-[11px] text-(--ad-ink-faint)">{c.contact_email}</span>}
                    {c.contact_phone && <span className="font-mono text-[11px] text-(--ad-ink-ghost)">{c.contact_phone}</span>}
                  </div>
                  <div className="mt-3 border-t border-(--ad-fill) pt-3 flex flex-wrap items-center gap-2">
                    <InviteCell
                      client={c}
                      phase={invitePhase[c.id] ?? 'idle'}
                      errMsg={inviteErrors[c.id]}
                      onInvite={() => handleInvite(c)}
                    />
                    <button
                      onClick={() => navigate(`/admin/impersonate/${c.id}`)}
                      className="cursor-pointer rounded-lg border border-(--ad-line) bg-(--ad-surface) px-3 py-1.5 text-[12px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-green) hover:text-(--ad-green)"
                    >
                      View as client
                    </button>
                    <button
                      onClick={() => setCreditsTarget(c)}
                      className="cursor-pointer rounded-lg border border-(--ad-line) bg-(--ad-surface) px-3 py-1.5 text-[12px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-green) hover:text-(--ad-green)"
                    >
                      Add credits ({c.credits_remaining})
                    </button>
                    <button
                      onClick={() => setEditClient(c)}
                      className="cursor-pointer rounded-lg border border-(--ad-line) bg-(--ad-surface) px-3 py-1.5 text-[12px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-green) hover:text-(--ad-green)"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(c)}
                      className="cursor-pointer rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-[12px] font-semibold text-(--ad-ink-ghost) transition-colors hover:border-(--ad-clay)/30 hover:bg-(--ad-clay-tint) hover:text-(--ad-clay)"
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
            <div className="flex items-center justify-between rounded-lg border border-(--ad-line) bg-(--ad-surface) px-4 py-3 text-[12.5px] text-(--ad-ink-faint)">
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
      <MobileFab onClick={() => setShowNew(true)} label="New client" />

      <AnimatePresence>
        {showNew && (
          <NewClientModal
            key="new-client-modal"
            onClose={() => setShowNew(false)}
            onCreated={() => { setShowNew(false); toast('Client created.'); reload(); }}
          />
        )}
        {editClient && (
          <EditClientModal
            key={`edit-${editClient.id}`}
            client={editClient}
            onClose={() => setEditClient(null)}
            onSaved={() => { toast(`${editClient.business_name} updated.`); setEditClient(null); reload(); }}
          />
        )}
        {creditsTarget && (
          <AddCreditsModal
            key={`credits-${creditsTarget.id}`}
            client={creditsTarget}
            onClose={() => setCreditsTarget(null)}
            onAdjusted={(msg) => { toast(msg); reload(); }}
          />
        )}
        {deleteTarget && (
          <DeleteClientModal
            key={`delete-${deleteTarget.id}`}
            client={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onDeleted={() => { toast(`${deleteTarget.business_name} deleted.`); setDeleteTarget(null); reload(); }}
          />
        )}
        {sendingTarget && (
          <SendingModal
            key={`sending-${sendingTarget.id}`}
            client={sendingTarget}
            onClose={() => setSendingTarget(null)}
          />
        )}
        {changeEmailTarget && (
          <ChangeLoginEmailModal
            key={`change-email-${changeEmailTarget.id}`}
            client={changeEmailTarget}
            onClose={() => setChangeEmailTarget(null)}
            onChanged={() => { toast('Login email updated.'); setChangeEmailTarget(null); }}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/* ── Invite cell ───────────────────────────────────────────────────── */
// All states render as the same pill shape/size (atbl-pill) as the Status
// column next to it - only the actionable "send/resend" state is a real
// <button>, so the column reads as one consistent badge instead of mixing
// a wide bordered box with a tiny muted chip.
function InviteCell({
  client, phase, errMsg, onInvite,
}: {
  client: ClientListRow;
  phase: InvitePhase;
  errMsg: string | undefined;
  onInvite: () => void;
}) {
  const pillCls = 'atbl-pill w-[120px] justify-center';

  if (client.is_internal) {
    return <span className={pillCls} style={{ background: 'var(--ad-fill)', color: 'var(--ad-ink-faint)' }}>Internal</span>;
  }
  if (!client.contact_email) {
    return <span className={pillCls} style={{ background: 'var(--ad-fill)', color: 'var(--ad-ink-ghost)' }}>No email</span>;
  }
  if (phase === 'sending') {
    return (
      <span className={`${pillCls} inline-flex items-center gap-1.5`} style={{ background: 'var(--ad-fill)', color: 'var(--ad-ink-faint)' }}>
        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-(--ad-line-strong) border-t-(--ad-green)" />
        Sending
      </span>
    );
  }
  if (phase === 'sent') {
    return <span className={pillCls} style={{ background: 'var(--ad-green-tint)', color: 'var(--ad-green)' }}><Check size={12} strokeWidth={2} aria-hidden /> Invite sent</span>;
  }
  if (phase === 'active' || client.activated_at) {
    return (
      <span
        title="This client can already sign in - resending an invite won't do anything. Have them log in directly, or use “Forgot password” on the login screen if they've lost access."
        className={pillCls}
        style={{ background: 'var(--ad-fill)', color: 'var(--ad-ink-faint)' }}
      >
        Activated
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={onInvite}
        className={`${pillCls} cursor-pointer border-0 font-semibold transition-opacity hover:opacity-75`}
        style={client.has_profile
          ? { background: 'var(--ad-amber-tint)', color: 'var(--ad-amber)' }
          : { background: 'var(--ad-green-tint)', color: 'var(--ad-green)' }}
      >
        {client.has_profile ? 'Resend invite' : 'Send invite'}
      </button>
      {phase === 'error' && errMsg && (
        <span className="text-[11px] leading-snug text-(--ad-clay)">{errMsg}</span>
      )}
    </div>
  );
}

/* ── Modal shell ───────────────────────────────────────────────────── */
function ModalShell({ children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[560px] md:rounded-md md:border md:border-(--ad-line)"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

interface EnrichTargetProfile {
  segment: string;
  reasoning: string;
  priority: string;
}

interface EnrichResult {
  status: 'ok' | 'error' | string;
  reason?: string;
  detail?: string;
  website_url?: string;
  business_name?: string;
  business_type?: string;
  location?: string;
  contact_email?: string;
  contact_phone?: string;
  founder_name?: string;
  services?: string[];
  target_customer_profiles?: EnrichTargetProfile[];
  summary?: string;
  limited_data?: boolean;
}

const ENRICH_ERROR_MESSAGES: Record<string, string> = {
  invalid_url: "That doesn't look like a valid URL - check for typos.",
  could_not_resolve: "Couldn't resolve that URL - check the address and try again.",
  could_not_fetch_website: "Couldn't reach that website - check the URL.",
  'website_url is required': 'Website URL is required.',
  // Distinct from a generic/transient AI failure: this one won't fix itself
  // on retry, so it gets its own reason + message rather than falling under
  // enrichment_generation_failed's "try again" wording.
  ai_service_billing_issue: "The lookup service needs attention (billing/quota issue on our end) - this won't fix itself by retrying. Let an admin know.",
  enrichment_generation_failed: 'Enrichment temporarily unavailable - try again.',
};

// Fields the enrichment call can fill - used to fill gaps only (never
// overwrite what the admin already typed) and to track which of them came
// back genuinely empty (AI searched but found nothing) vs never asked about.
type EnrichableField = 'businessName' | 'businessType' | 'location' | 'contactEmail' | 'contactPhone';

/* ── Country + send timezone fields (shared by New / Edit) ─────────── */
const SELECT_TRIGGER_CLS = 'h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)';
const SELECT_CONTENT_CLS = 'bg-(--ad-surface) text-[13px] text-(--ad-ink)';

function CountryTimezoneFields({
  country, timezone, onCountryChange, onTimezoneChange,
}: {
  country: string;
  timezone: string;
  onCountryChange: (code: string) => void;
  onTimezoneChange: (timeZone: string) => void;
}) {
  return (
    <>
      <div>
        <label className={fieldLbl}>Country</label>
        <CountrySelect
          value={country}
          onValueChange={onCountryChange}
          triggerStyle={FONT}
          triggerClassName={SELECT_TRIGGER_CLS}
          contentStyle={FONT}
          contentClassName={SELECT_CONTENT_CLS}
        />
        <p className="mt-1 text-[11px] text-(--ad-ink-faint)">Where the business is based.</p>
      </div>
      <div>
        <label className={fieldLbl}>Send timezone</label>
        <TimezoneSelect
          value={timezone}
          onValueChange={onTimezoneChange}
          suggested={suggestedTimezonesForCountry(country)}
          triggerStyle={FONT}
          triggerClassName={SELECT_TRIGGER_CLS}
          contentStyle={FONT}
          contentClassName={SELECT_CONTENT_CLS}
        />
        <p className="mt-1 text-[11px] text-(--ad-ink-faint)">Emails are sent Monday to Friday, 9:00 to 17:00 in this timezone.</p>
      </div>
    </>
  );
}

/* ── New Client Modal ──────────────────────────────────────────────── */
function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [businessName, setBusinessName]       = useState('');
  const [businessType, setBusinessType]       = useState('');
  const [location, setLocation]               = useState('');
  const [websiteUrl, setWebsiteUrl]           = useState('');
  const [contactEmail, setContactEmail]       = useState('');
  const [contactPhone, setContactPhone]       = useState('');
  const [notifChannel, setNotifChannel]       = useState<NewClientInput['notification_channel']>('whatsapp');
  const [country, setCountry]                 = useState('');
  const [sendTimezone, setSendTimezone]       = useState(DEFAULT_TIMEZONE);
  // Once the admin picks a timezone themselves, changing the country stops re-defaulting it.
  const [timezoneTouched, setTimezoneTouched] = useState(false);
  const [startingCredits, setStartingCredits] = useState(0);
  const [saveAsDraft, setSaveAsDraft]         = useState(false);
  const [busy, setBusy]                       = useState(false);
  const [err, setErr]                         = useState<string | null>(null);
  const [enriching, setEnriching]             = useState(false);
  const [enrichErr, setEnrichErr]             = useState<string | null>(null);
  const [enrichResult, setEnrichResult]       = useState<EnrichResult | null>(null);
  const [notFoundFields, setNotFoundFields]   = useState<Set<EnrichableField>>(new Set());
  const reqStar = <RequiredMark />;

  function clearNotFound(field: EnrichableField) {
    setNotFoundFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function handleEnrich() {
    const url = websiteUrl.trim();
    if (!url) return;
    setEnriching(true); setEnrichErr(null);

    let res: Response;
    try {
      res = await fetch('https://n8n.shortyharris.com/webhook/wf9-enrich-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website_url: url, business_name: businessName.trim() }),
      });
    } catch (e) {
      // fetch() only throws for network-level failures - most commonly the n8n
      // webhook not sending CORS headers back to this origin, or DNS/offline.
      console.error('Enrich webhook unreachable:', e);
      setEnrichErr("Couldn't reach the enrichment service - check your connection, or the n8n workflow may not be active.");
      setEnriching(false);
      return;
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      console.error('Enrich webhook returned an error:', res.status, bodyText);
      setEnrichErr(`Enrichment service returned an error (HTTP ${res.status}).`);
      setEnriching(false);
      return;
    }

    let json: EnrichResult;
    try {
      json = await res.json();
    } catch (e) {
      console.error('Enrich webhook returned non-JSON response:', e);
      setEnrichErr('Enrichment service returned an unexpected response.');
      setEnriching(false);
      return;
    }

    if (json.status === 'error') {
      // For most reasons the mapped message is already the clearest wording
      // we have. The exception is enrichment_generation_failed: n8n now
      // passes through the real upstream error as `detail` (and reclassifies
      // anything billing/quota-shaped into ai_service_billing_issue before
      // it even gets here) - so for whatever's left over, show that real
      // detail instead of a generic "try again" that would hide it.
      const reason = json.reason ?? '';
      const message = reason === 'enrichment_generation_failed'
        ? (json.detail || ENRICH_ERROR_MESSAGES[reason])
        : (ENRICH_ERROR_MESSAGES[reason] ?? json.detail ?? 'Could not enrich from that website - fill in the details manually.');
      setEnrichErr(message);
      setEnriching(false);
      return;
    }

    setEnrichResult(json);

    // Fill gaps only - a field the admin already typed into is left alone,
    // and an empty string from the API means "searched, genuinely not found"
    // rather than an error, so it's tracked (not written) for the inline hint.
    const notFound = new Set<EnrichableField>();
    const applyField = (
      field: EnrichableField,
      value: string | undefined,
      current: string,
      setter: (v: string) => void,
    ) => {
      if (current.trim()) return;
      if (value) setter(value);
      else if (value === '') notFound.add(field);
    };
    applyField('businessName', json.business_name, businessName, setBusinessName);
    applyField('businessType', json.business_type, businessType, setBusinessType);
    applyField('location', json.location, location, setLocation);
    applyField('contactEmail', json.contact_email, contactEmail, setContactEmail);
    applyField('contactPhone', json.contact_phone, contactPhone, setContactPhone);
    setNotFoundFields(notFound);

    setEnriching(false);
  }

  // The enrichment can return more services than a campaign may have search
  // terms. Cap them here and show what was left out rather than slicing silently.
  const termPlan = capSearchTerms(enrichResult?.services ?? [], getActiveCampaignLimits().maxSearchTerms);

  async function submit() {
    if (!businessName.trim()) { setErr('Business name is required.'); return; }
    if (!saveAsDraft) {
      if (!contactEmail.trim()) { setErr('Contact email is required.'); return; }
      if (!contactPhone.trim()) { setErr('Contact phone is required.'); return; }
    }
    if (contactEmail.trim() && !isValidEmail(contactEmail)) { setErr('Enter a valid contact email address.'); return; }
    if (contactPhone.trim() && !isValidPhone(contactPhone)) { setErr('Enter a valid contact phone number.'); return; }
    setBusy(true); setErr(null);
    const { error } = await createClient({
      business_name: businessName.trim(), business_type: businessType.trim(),
      location: location.trim(), website_url: websiteUrl.trim(), contact_email: contactEmail.trim(),
      contact_phone: contactPhone.trim() ? normalizePhone(contactPhone) : '', notification_channel: notifChannel,
      country, send_timezone: sendTimezone,
      starting_credits: startingCredits,
      status: saveAsDraft ? 'draft' : 'active',
      // Pre-fill the auto-created default campaign from whatever we know:
      // the enrichment's services become search terms (no editable field of
      // their own to fall back on), and the location uses whatever ended up
      // in the Location field - enriched or hand-typed/corrected, either way.
      search_queries: termPlan.kept,
      target_locations: location.trim() ? [location.trim()] : [],
    });
    setBusy(false);
    if (error) setErr(error.message); else onCreated();
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
        <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">New client</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div>
          <label className={fieldLbl}>Business name{reqStar}</label>
          <input
            value={businessName}
            onChange={(e) => { setBusinessName(e.target.value); clearNotFound('businessName'); }}
            placeholder="e.g. Acme Roofing"
            style={FONT}
            className={inputCls}
          />
          {notFoundFields.has('businessName') && (
            <p className="mt-1 text-[11px] text-(--ad-amber)">Not found on the site - please fill in.</p>
          )}
        </div>
        <div>
          <label className={fieldLbl}>Website URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              onBlur={handleEnrich}
              placeholder="https://acmeroofing.com"
              style={FONT}
              className={inputCls}
            />
            <button
              type="button"
              onClick={handleEnrich}
              disabled={!websiteUrl.trim() || enriching}
              className={`${ghostCls} shrink-0`}
            >
              {enriching ? 'Looking up…' : 'Look up business info'}
            </button>
          </div>
          {/* Confirmed URL n8n actually fetched after following redirects -
              lets the admin catch a typo'd/parked domain that still "succeeds"
              against the wrong final destination. */}
          {enrichResult?.website_url && !enrichErr && (
            <p className="mt-1 text-[11px] text-(--ad-green)">
              Confirmed: <span className="font-semibold">{enrichResult.website_url}</span>
            </p>
          )}
          <p className="mt-1 text-[11px] text-(--ad-ink-faint)">
            {enriching
              ? 'Fetching the site and running AI extraction - this can take up to 15 seconds…'
              : 'Optional - auto-fills business name, type, location, and contact details from the site (won\'t overwrite anything you\'ve already typed).'}
          </p>
          {enrichErr && <p className="mt-1 text-[11px] text-(--ad-clay)">{enrichErr}</p>}
          {enrichResult && (enrichResult.services?.length || enrichResult.target_customer_profiles?.length || enrichResult.summary) && (
            <div className="mt-2 rounded-xl border border-(--ad-green)/20 bg-(--ad-green-tint) px-3.5 py-3 text-[12px] text-(--ad-ink) flex flex-col gap-1.5">
              {enrichResult.summary && <p className="m-0 text-(--ad-green)">{enrichResult.summary}</p>}
              {!!enrichResult.services?.length && (
                <p className="m-0"><strong className="font-semibold">Services:</strong> {enrichResult.services.join(', ')}</p>
              )}
              {termPlan.dropped.length > 0 && (
                <p className="m-0 text-(--ad-amber)">
                  A campaign can have up to {getActiveCampaignLimits().maxSearchTerms} search terms, so the first campaign
                  will start with <strong className="font-semibold">{termPlan.kept.join(', ')}</strong>.
                  Left out: {termPlan.dropped.join(', ')}. You can swap them in when you edit the campaign.
                </p>
              )}
              {!!enrichResult.target_customer_profiles?.length && (
                <p className="m-0">
                  <strong className="font-semibold">Target customers:</strong>{' '}
                  {enrichResult.target_customer_profiles.map((p, i) => (
                    <span key={p.segment ?? i} title={p.reasoning}>
                      {i > 0 && ', '}{p.segment}{p.priority ? ` (${p.priority})` : ''}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLbl}>Business type</label>
            <input
              value={businessType}
              onChange={(e) => { setBusinessType(e.target.value); clearNotFound('businessType'); }}
              placeholder="e.g. Roofing"
              style={FONT}
              className={inputCls}
            />
            {notFoundFields.has('businessType') && (
              <p className="mt-1 text-[11px] text-(--ad-amber)">Not found - please fill in.</p>
            )}
          </div>
          <div>
            <label className={fieldLbl}>Location</label>
            <input
              value={location}
              onChange={(e) => { setLocation(e.target.value); clearNotFound('location'); }}
              placeholder="e.g. Austin TX"
              style={FONT}
              className={inputCls}
            />
            {notFoundFields.has('location') && (
              <p className="mt-1 text-[11px] text-(--ad-amber)">Not found - please fill in.</p>
            )}
          </div>
        </div>
        <div>
          <label className={fieldLbl}>Contact email{reqStar}</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => { setContactEmail(e.target.value); clearNotFound('contactEmail'); }}
            placeholder="owner@example.com"
            style={FONT}
            className={inputCls}
          />
          {notFoundFields.has('contactEmail') && (
            <p className="mt-1 text-[11px] text-(--ad-amber)">Not found - please fill in.</p>
          )}
        </div>
        <div>
          <label className={fieldLbl}>Contact phone{reqStar}</label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => { setContactPhone(e.target.value); clearNotFound('contactPhone'); }}
            placeholder="+1 512 000 0000"
            style={FONT}
            className={inputCls}
          />
          {notFoundFields.has('contactPhone') && (
            <p className="mt-1 text-[11px] text-(--ad-amber)">Not found - please fill in.</p>
          )}
          <p className="mt-1 text-[11px] text-(--ad-ink-faint)">Required for hot-lead WhatsApp / SMS notifications.</p>
        </div>
        <div>
          <label className={fieldLbl}>Notification channel</label>
          <Select value={notifChannel} onValueChange={(v) => setNotifChannel(v as NewClientInput['notification_channel'])}>
            <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)"><SelectValue /></SelectTrigger>
            <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CountryTimezoneFields
          country={country}
          timezone={sendTimezone}
          onCountryChange={(code) => {
            setCountry(code);
            if (!timezoneTouched) setSendTimezone(defaultTimezoneForCountry(code));
          }}
          onTimezoneChange={(tz) => { setSendTimezone(tz); setTimezoneTouched(true); }}
        />
        <div className="border-t border-(--ad-fill) pt-3">
          <label className={fieldLbl}>Starting credits</label>
          <input type="number" min={0} value={startingCredits}
            onChange={(e) => setStartingCredits(Math.max(0, Number(e.target.value)))} style={FONT} className={inputCls} />
          <p className="mt-1 text-[11px] text-(--ad-ink-faint)">Added to the billing profile on creation. A default campaign is also created automatically.</p>
        </div>

        <div className="border-t border-(--ad-fill) pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-(--ad-ink-soft)">
            <input type="checkbox" checked={saveAsDraft} onChange={(e) => setSaveAsDraft(e.target.checked)} className="accent-(--ad-green)" />
            Save as draft
          </label>
          <p className="mt-1 text-[11px] text-(--ad-ink-faint)">Contact email and phone become optional - finish the profile later.</p>
        </div>

        {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Cancel</button>
        <button onClick={submit} disabled={busy} className={primaryCls}>
          {busy ? 'Creating…' : saveAsDraft ? 'Save as draft' : 'Create client'}
        </button>
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
  const [websiteUrl, setWebsiteUrl]     = useState(client.website_url ?? '');
  const [contactEmail, setContactEmail] = useState(client.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(client.contact_phone ?? '');
  const [contactName, setContactName]   = useState(client.contact_name ?? '');
  const [representativeName, setRepresentativeName] = useState(client.representative_name ?? '');
  const [notifChannel, setNotifChannel] = useState<UpdateClientInput['notification_channel']>(
    (client.notification_channel as UpdateClientInput['notification_channel']) ?? 'whatsapp',
  );
  const [status, setStatus] = useState<UpdateClientInput['status']>(
    (client.status as UpdateClientInput['status']) ?? 'active',
  );
  const [country, setCountry]           = useState(client.country ?? '');
  const [sendTimezone, setSendTimezone] = useState(client.send_timezone);
  const [monthlyProspectLimit, setMonthlyProspectLimit] = useState(client.monthly_prospect_limit);
  const [maxCampaigns, setMaxCampaigns] = useState(client.max_campaigns);
  const [autoApprove, setAutoApprove] = useState(client.auto_approve_campaigns);
  const [allowGeneric, setAllowGeneric] = useState(client.allow_generic_mailboxes ?? false);
  const [usage, setUsage] = useState<ClientUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const reqStar = <RequiredMark />;

  useEffect(() => {
    getClientUsage(client.id).then(setUsage);
  }, [client.id]);

  async function submit() {
    if (!businessName.trim()) { setErr('Business name is required.'); return; }
    if (!contactEmail.trim()) { setErr('Contact email is required.'); return; }
    if (!isValidEmail(contactEmail)) { setErr('Enter a valid contact email address.'); return; }
    if (!contactPhone.trim()) { setErr('Contact phone is required.'); return; }
    if (!isValidPhone(contactPhone)) { setErr('Enter a valid contact phone number.'); return; }
    setBusy(true); setErr(null);
    const { error } = await updateClient(client.id, {
      business_name: businessName.trim(), business_type: businessType.trim(),
      location: location.trim(), website_url: websiteUrl.trim(), contact_email: contactEmail.trim(),
      contact_phone: normalizePhone(contactPhone), contact_name: contactName.trim(),
      representative_name: representativeName,
      notification_channel: notifChannel, status,
      country, send_timezone: sendTimezone,
      monthly_prospect_limit: monthlyProspectLimit, max_campaigns: maxCampaigns,
      auto_approve_campaigns: autoApprove,
      allow_generic_mailboxes: allowGeneric,
    });
    setBusy(false);
    if (error) setErr(error.message); else onSaved();
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
        <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Edit client</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
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
          <label className={fieldLbl}>Website URL</label>
          <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://acmeroofing.com" style={FONT} className={inputCls} />
        </div>
        <div>
          <label className={fieldLbl}>Contact email{reqStar}</label>
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={FONT} className={inputCls} />
        </div>
        <div>
          <label className={fieldLbl}>Contact phone{reqStar}</label>
          <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={FONT} className={inputCls} />
        </div>
        <div>
          <label className={fieldLbl}>Contact name</label>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={FONT} className={inputCls} />
          <p className="mt-1 text-[11px] text-(--ad-ink-faint)">Billing / account contact. Not used to sign emails.</p>
        </div>
        <div>
          <label className={fieldLbl}>Representative name</label>
          <input value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} placeholder="e.g. Yvonne" style={FONT} className={inputCls} />
          <p className="mt-1 text-[11px] text-(--ad-ink-faint)">Signs outreach emails on this client's behalf (e.g. "Have a wonderful day, Yvonne"). Leave empty to sign with the business name.</p>
        </div>
        <div className="border-t border-(--ad-fill) pt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLbl}>Monthly prospect limit</label>
            <input
              type="number"
              min={0}
              value={monthlyProspectLimit}
              onChange={(e) => setMonthlyProspectLimit(Math.max(0, Number(e.target.value)))}
              style={FONT}
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-(--ad-ink-faint)">
              {usage
                ? `${usage.prospects_this_month} of ${usage.monthly_prospect_limit} prospects this month, resets ${new Date(usage.limit_resets_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : 'Loading usage…'}
            </p>
          </div>
          <div>
            <label className={fieldLbl}>Max campaigns</label>
            <input
              type="number"
              min={0}
              value={maxCampaigns}
              onChange={(e) => setMaxCampaigns(Math.max(0, Number(e.target.value)))}
              style={FONT}
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-(--ad-ink-faint)">
              {usage ? `${usage.campaign_count} of ${usage.max_campaigns} campaigns` : 'Loading usage…'}
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2 border-t border-(--ad-fill) pt-3 text-[13px] text-(--ad-ink-soft)">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
            className="mt-0.5 accent-(--ad-green)"
          />
          <span>
            <span className="block font-semibold text-(--ad-ink)">Auto-approve this client's campaigns</span>
            <span className="block text-[11px] text-(--ad-ink-faint)">Skips the "Awaiting approval" step - campaigns they create go active immediately, no admin review.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-[13px] text-(--ad-ink-soft)">
          <input
            type="checkbox"
            checked={allowGeneric}
            onChange={(e) => setAllowGeneric(e.target.checked)}
            className="mt-0.5 accent-(--ad-green)"
          />
          <span>
            <span className="block font-semibold text-(--ad-ink)">Allow shared mailboxes (info@, office@) for EU/Czech campaigns</span>
            <span className="block text-[11px] text-(--ad-clay)">Off by default. Emailing shared addresses in the EU/Czech Republic carries GDPR/PECR risk - only enable with the client's sign-off.</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLbl}>Notification channel</label>
            <Select value={notifChannel} onValueChange={(v) => setNotifChannel(v as UpdateClientInput['notification_channel'])}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)"><SelectValue /></SelectTrigger>
              <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={fieldLbl}>Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as UpdateClientInput['status'])}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)"><SelectValue /></SelectTrigger>
              <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CountryTimezoneFields
          country={country}
          timezone={sendTimezone}
          onCountryChange={setCountry}
          onTimezoneChange={setSendTimezone}
        />
        {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Cancel</button>
        <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </ModalShell>
  );
}

/* ── Add Credits Modal ─────────────────────────────────────────────── */
function AddCreditsModal({
  client, onClose, onAdjusted,
}: { client: ClientListRow; onClose: () => void; onAdjusted: (msg: string) => void }) {
  const [balance, setBalance] = useState(client.credits_remaining);
  const [amount, setAmount]   = useState('');
  const [note, setNote]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [ok, setOk]           = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<CreditTransaction[] | null>(null);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  function loadHistory() {
    setHistoryErr(null);
    getClientCreditHistory(client.id).then(setHistory).catch((e: Error) => setHistoryErr(e.message));
  }

  function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history === null) loadHistory();
  }

  const parsed = Number(amount);
  const valid  = amount.trim() !== '' && Number.isInteger(parsed) && parsed !== 0;

  async function submit() {
    setErr(null); setOk(null);
    if (!valid) { setErr('Enter a whole number (positive adds, negative removes).'); return; }
    if (balance + parsed < 0) { setErr(`That would take the balance below 0 (currently ${balance}).`); return; }
    setBusy(true);
    const res = await adjustClientCredits(client.id, parsed, note);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    const newBalance = res.balance ?? balance + parsed;
    setBalance(newBalance);
    setAmount(''); setNote('');
    const msg = `${parsed > 0 ? 'Added' : 'Removed'} ${Math.abs(parsed)} credit${Math.abs(parsed) !== 1 ? 's' : ''} - balance is now ${newBalance}.`;
    setOk(msg);
    onAdjusted(msg);
    if (showHistory) loadHistory(); else setHistory(null);
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
        <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Credits - {client.business_name}</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div className="rounded-xl bg-(--ad-surface-2) px-4 py-3 text-[13px] text-(--ad-ink-soft)">
          Current balance: <strong className="text-[18px] text-(--ad-ink)">{balance}</strong>
        </div>
        <div>
          <label className={fieldLbl}>Amount (whole number)<RequiredMark /></label>
          <input
            type="number" step={1} value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 10 to add, -5 to remove"
            style={FONT} className={inputCls}
          />
          {valid && (
            <p className="mt-1 text-[11px] text-(--ad-ink-faint)">New balance: {balance + parsed}</p>
          )}
        </div>
        <div>
          <label className={fieldLbl}>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin adjustment" style={FONT} className={inputCls} />
        </div>
        {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
        {ok && <div className="rounded-xl border border-(--ad-green)/20 bg-(--ad-green-tint) px-4 py-3 text-[13px] text-(--ad-green)">{ok}</div>}
        <div className="border-t border-(--ad-fill) pt-3">
          <button onClick={toggleHistory} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-(--ad-green) hover:underline">
            {showHistory ? 'Hide credit history' : 'Credit history'}
          </button>
          {showHistory && (
            <div className="mt-3">
              {historyErr ? (
                <p className="text-[12px] text-(--ad-clay)">{historyErr}</p>
              ) : history === null ? (
                <p className="text-[12px] text-(--ad-ink-faint)">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-[12px] text-(--ad-ink-faint)">No credit transactions yet.</p>
              ) : (
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-(--ad-ink-faint)">
                      <th className="py-1 pr-2 font-semibold">Date</th>
                      <th className="py-1 pr-2 font-semibold">Amount</th>
                      <th className="py-1 pr-2 font-semibold">Type</th>
                      <th className="py-1 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((t) => (
                      <tr key={t.id} className="border-t border-(--ad-fill)">
                        <td className="py-1.5 pr-2 whitespace-nowrap text-(--ad-ink-soft)">
                          {new Date(t.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </td>
                        <td className={`py-1.5 pr-2 font-semibold ${t.amount < 0 ? 'text-(--ad-clay)' : 'text-(--ad-green)'}`}>
                          {t.amount > 0 ? `+${t.amount}` : t.amount}
                        </td>
                        <td className="py-1.5 pr-2 text-(--ad-ink-soft)">{t.type}</td>
                        <td className="py-1.5 text-(--ad-ink-soft)">{t.description ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Close</button>
        <button onClick={submit} disabled={busy || !valid} className={primaryCls}>{busy ? 'Saving…' : 'Apply'}</button>
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
      <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
        <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Delete client</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-4">
          <p className="m-0 text-[14px] font-semibold text-(--ad-clay)">
            Permanently delete "{client.business_name}"?
          </p>
          <p className="m-0 mt-1.5 text-[13px] text-(--ad-clay)/80">
            This action cannot be undone. All data associated with this client will be permanently deleted.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">This will permanently delete:</p>
          {!counts ? (
            <div className="flex items-center gap-2 text-[13px] text-(--ad-ink-faint)">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-(--ad-line-strong) border-t-(--ad-clay)" />
              Counting affected records…
            </div>
          ) : blastItems.length === 0 ? (
            <p className="text-[13px] text-(--ad-ink-soft)">No associated records - the client row only.</p>
          ) : (
            <ul className="m-0 list-none p-0 flex flex-col gap-1">
              {blastItems.map((item) => (
                <li key={String(item)} className="flex items-center gap-2 text-[13px] text-(--ad-ink-soft)">
                  <X size={12} strokeWidth={2} className="shrink-0 text-(--ad-ink)" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          )}
          {client.has_profile && (
            <p className="mt-3 text-[12px] text-(--ad-ink-soft)">
              This client has a login account - it will also be deleted.
            </p>
          )}
        </div>

        {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
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

/* ── Sending Modal ─────────────────────────────────────────────────── */
// Read-only on purpose: no inputs, no save. It is a separate modal from EditClientModal so nothing
// here can ride along with the edit-client save path.
function SendingModal({ client, onClose }: { client: ClientListRow; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
        <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Sending · {client.business_name}</h2>
        <button onClick={onClose} aria-label="Close" className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <SendingCard clientId={client.id} />
      </div>
      <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end">
        <button onClick={onClose} className={ghostCls}>Close</button>
      </div>
    </ModalShell>
  );
}

/* ── Change Login Email Modal ──────────────────────────────────────── */
function ChangeLoginEmailModal({
  client, onClose, onChanged,
}: { client: ClientListRow; onClose: () => void; onChanged: () => void }) {
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function submit() {
    if (!newEmail.trim()) { setErr('Enter a new email address.'); return; }
    if (!isValidEmail(newEmail)) { setErr('Enter a valid email address.'); return; }
    setBusy(true); setErr(null);
    const { error } = await updateClientLoginEmail(client.id, newEmail.trim());
    setBusy(false);
    if (error) setErr(error); else onChanged();
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
        <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Change login email</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <p className="m-0 text-[13px] text-(--ad-ink-soft)">
          This changes the email <strong className="font-semibold">{client.business_name}</strong> uses to sign in to their dashboard. It's applied immediately - no confirmation email is sent to the new address.
        </p>
        <div>
          <label className={fieldLbl}>New login email<RequiredMark /></label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new-owner@example.com"
            style={FONT}
            className={inputCls}
          />
        </div>
        {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Cancel</button>
        <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Saving…' : 'Change email'}</button>
      </div>
    </ModalShell>
  );
}
