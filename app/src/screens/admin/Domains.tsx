import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Globe, Lock, ShieldAlert } from 'lucide-react';
import { useClientsList } from '../../hooks/useAdminData';
import {
  useAdminBlacklist, purgeBlacklistedProspects, countFreeProviderMatches, FREE_EMAIL_PROVIDERS,
} from '../../hooks/useBlacklistedDomains';
import type { AdminBlacklistedDomainRow, PurgeDryRunResult, PurgeConfirmResult } from '../../hooks/useBlacklistedDomains';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { SkeletonTable } from '../../components/Skeleton';
import { RowMenu } from '../../components/RowMenu';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { RequiredMark } from '../../components/RequiredMark';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const HELP: HelpContent = {
  title: 'Blocked domains',
  body: [
    { type: 'p', text: "Addresses at a blocked domain are never scraped into outreach. A GLOBAL row blocks that domain for every client; a client's own row only blocks it for them." },
    { type: 'p', text: "Use Remove matching prospects to clean up prospects that were already in the pipeline before a domain was blocked - it always runs a dry run first." },
  ],
};

const ghostCls   = 'cursor-pointer whitespace-nowrap rounded-xl border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-line-strong) hover:bg-(--ad-surface-2)';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-green) px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-(--ad-green-hover) disabled:opacity-50';
const dangerCls  = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-clay) px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-(--ad-clay-hover) disabled:opacity-50';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Domains() {
  const clients = useClientsList();
  const { toasts, toast, dismiss } = useToast();
  const [scopeFilter, setScopeFilter] = useState<string>('all'); // 'all' | 'global' | clientId
  const { rows, loading, error, addDomain, addGlobalDomains, deleteDomain, reload } =
    useAdminBlacklist(scopeFilter === 'all' ? null : scopeFilter === 'global' ? 'global' : scopeFilter);

  const [showAdd, setShowAdd] = useState(false);
  const [showFreeProviders, setShowFreeProviders] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.business_name])),
    [clients],
  );

  async function handleDelete(row: AdminBlacklistedDomainRow) {
    const { error } = await deleteDomain(row.id);
    if (error) toast(error, 'error'); else toast(`Removed ${row.domain}.`);
  }

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="page-header page-header--stack flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-(--ad-ink)">
            <ShieldAlert className="w-8 h-8 mr-1" style={{ color: 'var(--ad-clay)' }} />
            Blocked domains
          </h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">{rows.length} row{rows.length !== 1 ? 's' : ''} in this view</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <button onClick={() => setShowFreeProviders(true)} className={ghostCls}>Block free email providers</button>
          <button onClick={() => setPurgeOpen(true)} className={ghostCls}>Remove matching prospects</button>
          <button onClick={() => setShowAdd(true)} className={primaryCls}>+ Add domain</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-(--ad-line) bg-(--ad-surface) p-3">
        <span className="text-[12px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">Scope</span>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger style={FONT} className="h-9 w-[220px] rounded-lg border-(--ad-line) bg-(--ad-surface) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)">
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
            <SelectItem value="all">All rows</SelectItem>
            <SelectItem value="global">Global only</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={10} cols={5} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-semibold text-(--ad-ink)">Nothing blocked in this view.</strong>
          <span className="text-[13px] text-(--ad-ink-soft) max-w-[440px]">
            Blocked domains stop prospects at that domain from ever being scraped or emailed - either platform-wide
            (a GLOBAL row) or for one client only.
          </span>
        </div>
      ) : (
        <div className="atbl">
          <table className="table-fixed">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[16%]" />
              <col className="w-[26%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr>
                {['Domain', 'Scope', 'Reason', 'Added', '', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isGlobal = r.client_id === null;
                return (
                  <tr key={r.id}>
                    <td className="min-w-0 font-semibold text-(--ad-ink)">
                      <div className="truncate" title={r.domain}>{r.domain}</div>
                    </td>
                    <td>
                      {isGlobal ? (
                        <span className="atbl-pill inline-flex items-center gap-1" style={{ background: 'var(--ad-clay-tint)', color: 'var(--ad-clay)' }}>
                          <Lock size={10} /> Global
                        </span>
                      ) : (
                        <span className="atbl-pill inline-flex items-center gap-1" style={{ background: 'var(--ad-green-tint)', color: 'var(--ad-green)' }}>
                          <Globe size={10} /> Client
                        </span>
                      )}
                    </td>
                    <td className="min-w-0 text-(--ad-ink-soft)">
                      <div className="truncate" title={r.reason ?? undefined}>{r.reason ?? '-'}</div>
                    </td>
                    <td className="min-w-0 text-(--ad-ink-soft)">
                      <div className="truncate">{r.client?.business_name ?? (isGlobal ? 'All clients' : clientNameById.get(r.client_id ?? '') ?? '-')}</div>
                    </td>
                    <td className="text-[12px] text-(--ad-ink-faint) whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-3 text-right">
                      <RowMenu items={[
                        { type: 'action', label: 'Delete', destructive: true, onClick: () => handleDelete(r) },
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <AddDomainModal
            key="add-domain"
            clients={clients}
            onClose={() => setShowAdd(false)}
            onAdd={addDomain}
            onAdded={() => { setShowAdd(false); reload(); toast('Domain added.'); }}
          />
        )}
        {showFreeProviders && (
          <FreeProvidersModal
            key="free-providers"
            onClose={() => setShowFreeProviders(false)}
            onAdd={addGlobalDomains}
            onDone={(added, skipped) => {
              setShowFreeProviders(false);
              reload();
              toast(skipped > 0 ? `Added ${added}, ${skipped} already existed.` : `Added ${added} free email providers as global blocks.`);
            }}
          />
        )}
        {purgeOpen && (
          <PurgeModal
            key="purge"
            clients={clients}
            onClose={() => setPurgeOpen(false)}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/* ── Add domain modal ─────────────────────────────────────────────── */
function AddDomainModal({
  clients, onClose, onAdd, onAdded,
}: {
  clients: { id: string; business_name: string }[];
  onClose: () => void;
  onAdd: (domain: string, reason: string, clientId: string | null) => Promise<{ error: string | null }>;
  onAdded: () => void;
}) {
  const [scope, setScope] = useState<'global' | string>('global');
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fieldLbl = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)';
  const inputCls = 'w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)';

  async function submit() {
    if (!domain.trim()) { setErr('Enter a domain, website, or email address.'); return; }
    setBusy(true); setErr(null);
    const { error } = await onAdd(domain.trim(), reason, scope === 'global' ? null : scope);
    setBusy(false);
    if (error) { setErr(error); return; }
    onAdded();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[480px] md:rounded-md md:border md:border-(--ad-line)"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Add blocked domain</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <label className={fieldLbl}>Scope</label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                <SelectItem value="global">Global - every client</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {scope === 'global' && (
              <p className="mt-1.5 text-[11px] text-(--ad-clay)">This blocks the domain for every client on the platform.</p>
            )}
          </div>
          <div>
            <label className={fieldLbl}>Domain<RequiredMark /></label>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" style={FONT} className={inputCls} />
            <p className="mt-1 text-[11px] text-(--ad-ink-faint)">A domain, a website address, or an email address all work.</p>
          </div>
          <div>
            <label className={fieldLbl}>Reason <span className="normal-case font-normal">(optional)</span></label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Competitor domain" style={FONT} className={inputCls} />
          </div>
          {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
        </div>
        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Adding…' : 'Add domain'}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Block free email providers - pre-count, then one-click bulk insert ── */
function FreeProvidersModal({
  onClose, onAdd, onDone,
}: {
  onClose: () => void;
  onAdd: (domains: string[], reason: string) => Promise<{ added: number; skipped: number }>;
  onDone: (added: number, skipped: number) => void;
}) {
  const [counts, setCounts] = useState<{ matching: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    countFreeProviderMatches().then(setCounts);
  }, []);

  async function confirm() {
    setBusy(true);
    const { added, skipped } = await onAdd(FREE_EMAIL_PROVIDERS, 'Free email provider');
    setBusy(false);
    onDone(added, skipped);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[480px] md:rounded-md md:border md:border-(--ad-line)"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Block free email providers</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <p className="m-0 text-[13px] leading-relaxed text-(--ad-ink-soft)">
            Adds these 8 domains as GLOBAL blocks, platform-wide: {FREE_EMAIL_PROVIDERS.join(', ')}.
          </p>
          <div className="rounded-xl border border-(--ad-amber-line) bg-(--ad-amber-tint) px-4 py-3.5">
            {counts === null ? (
              <p className="m-0 text-[13px] text-(--ad-amber-ink)">Checking how many existing prospects this would affect…</p>
            ) : (
              <p className="m-0 text-[13px] leading-relaxed text-(--ad-amber-ink)">
                <strong className="font-semibold">This currently affects {counts.matching} of {counts.total}</strong> existing prospects -
                it's not a trivial toggle. Those prospects are not deleted by this action; use{' '}
                <strong className="font-semibold">Remove matching prospects</strong> separately if you also want to clean them up.
              </p>
            )}
          </div>
          <p className="m-0 text-[11px] text-(--ad-ink-faint)">Reversible: delete any of these rows individually afterward if needed.</p>
        </div>
        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={confirm} disabled={busy || counts === null} className={primaryCls}>
            {busy ? 'Adding…' : 'Block all 8'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Purge flow - dry run, then explicit confirm ──────────────────── */
export function PurgeModal({
  clients, onClose,
}: {
  clients: { id: string; business_name: string }[];
  onClose: () => void;
}) {
  const [targetClientId, setTargetClientId] = useState<string>('all');
  const [dryRun, setDryRun] = useState<PurgeDryRunResult | null>(null);
  const [result, setResult] = useState<PurgeConfirmResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runDryRun() {
    setBusy(true); setErr(null); setDryRun(null); setResult(null);
    const { data, error } = await purgeBlacklistedProspects(targetClientId === 'all' ? null : targetClientId, false);
    setBusy(false);
    if (error) { setErr(error); return; }
    setDryRun(data as PurgeDryRunResult);
  }

  async function confirmPurge() {
    setBusy(true); setErr(null);
    const { data, error } = await purgeBlacklistedProspects(targetClientId === 'all' ? null : targetClientId, true);
    setBusy(false);
    if (error) { setErr(error); return; }
    setResult(data as PurgeConfirmResult);
    setDryRun(null);
  }

  const fieldLbl = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[520px] md:rounded-md md:border md:border-(--ad-line)"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Remove matching prospects</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <p className="m-0 text-[13px] leading-relaxed text-(--ad-ink-soft)">
            Deletes existing prospects whose email domain is on a blocked-domains list. Always starts with a dry run -
            nothing is deleted until you explicitly confirm.
          </p>

          {!dryRun && !result && (
            <div>
              <label className={fieldLbl}>Scope</label>
              <Select value={targetClientId} onValueChange={setTargetClientId}>
                <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                  <SelectItem value="all">All clients</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {dryRun && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-(--ad-line) bg-(--ad-surface-2) px-4 py-3.5">
                <p className="m-0 text-[13px] text-(--ad-ink)">
                  <strong className="font-semibold text-[17px]">{dryRun.would_delete}</strong> prospect{dryRun.would_delete !== 1 ? 's' : ''} would be deleted.
                </p>
              </div>
              {dryRun.of_which_already_emailed > 0 && (
                <div className="rounded-xl border border-(--ad-clay-line) bg-(--ad-clay-tint) px-4 py-3.5">
                  <p className="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-(--ad-clay)">
                    <AlertCircle size={14} strokeWidth={2} aria-hidden />
                    {dryRun.of_which_already_emailed} of those were already emailed.
                  </p>
                  <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-(--ad-clay)">
                    Deleting them loses the record that we contacted them - which is exactly what stops us
                    contacting them again if they're re-scraped later.
                  </p>
                </div>
              )}
              {dryRun.sample.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">Sample</p>
                  <div className="overflow-hidden rounded-xl border border-(--ad-line)">
                    {dryRun.sample.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 border-b border-(--ad-fill) px-3.5 py-2 text-[12.5px] last:border-0">
                        <span className="truncate font-semibold text-(--ad-ink)">{p.business_name}</span>
                        <span className="truncate text-(--ad-ink-faint)">{p.email ?? '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-(--ad-green-line) bg-(--ad-green-tint) px-4 py-3.5">
              <p className="m-0 text-[13px] text-(--ad-green)">
                Deleted <strong className="font-semibold">{result.deleted}</strong> prospect{result.deleted !== 1 ? 's' : ''}
                {result.of_which_had_been_emailed > 0 && ` (${result.of_which_had_been_emailed} had been emailed).`}
              </p>
            </div>
          )}

          {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
        </div>
        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
          {result ? (
            <button onClick={onClose} className={primaryCls}>Done</button>
          ) : dryRun ? (
            <>
              <button onClick={() => setDryRun(null)} className={ghostCls}>Back</button>
              <button onClick={confirmPurge} disabled={busy || dryRun.would_delete === 0} className={dangerCls}>
                {busy ? 'Deleting…' : `Delete ${dryRun.would_delete} prospect${dryRun.would_delete !== 1 ? 's' : ''}`}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className={ghostCls}>Cancel</button>
              <button onClick={runDryRun} disabled={busy} className={primaryCls}>{busy ? 'Checking…' : 'Run dry run'}</button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
