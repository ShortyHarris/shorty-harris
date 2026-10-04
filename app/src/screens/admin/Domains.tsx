import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Lock, ShieldAlert } from 'lucide-react';
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

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const HELP: HelpContent = {
  title: 'Blocked domains',
  body: [
    { type: 'p', text: "Addresses at a blocked domain are never scraped into outreach. A GLOBAL row blocks that domain for every client; a client's own row only blocks it for them." },
    { type: 'p', text: "Use Remove matching prospects to clean up prospects that were already in the pipeline before a domain was blocked - it always runs a dry run first." },
  ],
};

const ghostCls   = 'cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#3c7a5b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:opacity-50';
const dangerCls  = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#a8533a] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#8a3f2b] disabled:opacity-50';

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
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]">
            <ShieldAlert className="w-8 h-8 mr-1" style={{ color: '#a8533a' }} />
            Blocked domains
          </h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">{rows.length} row{rows.length !== 1 ? 's' : ''} in this view</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <button onClick={() => setShowFreeProviders(true)} className={ghostCls}>Block free email providers</button>
          <button onClick={() => setPurgeOpen(true)} className={ghostCls}>Remove matching prospects</button>
          <button onClick={() => setShowAdd(true)} className={primaryCls}>+ Add domain</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#ece8df] bg-white p-3">
        <span className="text-[12px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">Scope</span>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger style={FONT} className="h-9 w-[220px] rounded-lg border-[#ece8df] bg-white text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
            <SelectItem value="all">All rows</SelectItem>
            <SelectItem value="global">Global only</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={10} cols={5} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">Nothing blocked in this view.</strong>
          <span className="text-[13px] text-[#62655c] max-w-[440px]">
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
                    <td className="min-w-0 font-semibold text-[#20211c]">
                      <div className="truncate" title={r.domain}>{r.domain}</div>
                    </td>
                    <td>
                      {isGlobal ? (
                        <span className="atbl-pill inline-flex items-center gap-1" style={{ background: '#f6e8e2', color: '#a8533a' }}>
                          <Lock size={10} /> Global
                        </span>
                      ) : (
                        <span className="atbl-pill inline-flex items-center gap-1" style={{ background: '#edf4ef', color: '#3c7a5b' }}>
                          <Globe size={10} /> Client
                        </span>
                      )}
                    </td>
                    <td className="min-w-0 text-[#62655c]">
                      <div className="truncate" title={r.reason ?? undefined}>{r.reason ?? '-'}</div>
                    </td>
                    <td className="min-w-0 text-[#62655c]">
                      <div className="truncate">{r.client?.business_name ?? (isGlobal ? 'All clients' : clientNameById.get(r.client_id ?? '') ?? '-')}</div>
                    </td>
                    <td className="text-[12px] text-[#9a9d92] whitespace-nowrap">{formatDate(r.created_at)}</td>
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

  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
  const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

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
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[480px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Add blocked domain</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <label className={fieldLbl}>Scope</label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                <SelectItem value="global">Global - every client</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {scope === 'global' && (
              <p className="mt-1.5 text-[11px] text-[#a8533a]">This blocks the domain for every client on the platform.</p>
            )}
          </div>
          <div>
            <label className={fieldLbl}>Domain</label>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" style={FONT} className={inputCls} />
            <p className="mt-1 text-[11px] text-[#9a9d92]">A domain, a website address, or an email address all work.</p>
          </div>
          <div>
            <label className={fieldLbl}>Reason <span className="normal-case font-normal">(optional)</span></label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Competitor domain" style={FONT} className={inputCls} />
          </div>
          {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
        </div>
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
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
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[480px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Block free email providers</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <p className="m-0 text-[13px] leading-relaxed text-[#62655c]">
            Adds these 8 domains as GLOBAL blocks, platform-wide: {FREE_EMAIL_PROVIDERS.join(', ')}.
          </p>
          <div className="rounded-xl border border-[#e8d5a8] bg-[#f8efdb] px-4 py-3.5">
            {counts === null ? (
              <p className="m-0 text-[13px] text-[#8a6417]">Checking how many existing prospects this would affect…</p>
            ) : (
              <p className="m-0 text-[13px] leading-relaxed text-[#8a6417]">
                <strong className="font-bold">This currently affects {counts.matching} of {counts.total}</strong> existing prospects -
                it's not a trivial toggle. Those prospects are not deleted by this action; use{' '}
                <strong className="font-bold">Remove matching prospects</strong> separately if you also want to clean them up.
              </p>
            )}
          </div>
          <p className="m-0 text-[11px] text-[#9a9d92]">Reversible: delete any of these rows individually afterward if needed.</p>
        </div>
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
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

  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[520px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Remove matching prospects</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <p className="m-0 text-[13px] leading-relaxed text-[#62655c]">
            Deletes existing prospects whose email domain is on a blocked-domains list. Always starts with a dry run -
            nothing is deleted until you explicitly confirm.
          </p>

          {!dryRun && !result && (
            <div>
              <label className={fieldLbl}>Scope</label>
              <Select value={targetClientId} onValueChange={setTargetClientId}>
                <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                  <SelectItem value="all">All clients</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {dryRun && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-[#ece8df] bg-[#fbf9f5] px-4 py-3.5">
                <p className="m-0 text-[13px] text-[#20211c]">
                  <strong className="font-bold text-[17px]">{dryRun.would_delete}</strong> prospect{dryRun.would_delete !== 1 ? 's' : ''} would be deleted.
                </p>
              </div>
              {dryRun.of_which_already_emailed > 0 && (
                <div className="rounded-xl border border-[#e6cbc0] bg-[#f6e8e2] px-4 py-3.5">
                  <p className="m-0 text-[13px] font-bold text-[#a8533a]">
                    ⚠ {dryRun.of_which_already_emailed} of those were already emailed.
                  </p>
                  <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-[#a8533a]">
                    Deleting them loses the record that we contacted them - which is exactly what stops us
                    contacting them again if they're re-scraped later.
                  </p>
                </div>
              )}
              {dryRun.sample.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">Sample</p>
                  <div className="overflow-hidden rounded-xl border border-[#ece8df]">
                    {dryRun.sample.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 border-b border-[#f5f2ec] px-3.5 py-2 text-[12.5px] last:border-0">
                        <span className="truncate font-semibold text-[#20211c]">{p.business_name}</span>
                        <span className="truncate text-[#9a9d92]">{p.email ?? '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-[#c5e3d4] bg-[#edf4ef] px-4 py-3.5">
              <p className="m-0 text-[13px] text-[#3c7a5b]">
                Deleted <strong className="font-bold">{result.deleted}</strong> prospect{result.deleted !== 1 ? 's' : ''}
                {result.of_which_had_been_emailed > 0 && ` (${result.of_which_had_been_emailed} had been emailed).`}
              </p>
            </div>
          )}

          {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
        </div>
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
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
