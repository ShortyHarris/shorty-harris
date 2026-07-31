import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, TriangleAlert, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import {
  useClientCampaignList, createClientCampaign, updateClientCampaign,
  getClientCampaignDeleteCounts, deleteClientCampaign, useClientCampaignProspects, useClientUsage,
} from '../../hooks/useClientCampaigns';
import type { ClientCampaignRow, ClientCampaignDeleteCounts } from '../../hooks/useClientCampaigns';
import { queryClient } from '../../lib/queryClient';
import { looksLikeMultipleLocationsJoined } from '../../lib/validation';
import { SkeletonTable } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { TagInput } from '../../components/TagInput';
import { useToast, ToastHost } from '../../components/Toast';

const HELP: HelpContent = {
  title: 'Campaigns',
  body: [
    { type: 'p', text: "A campaign tells us who to target and how — the search terms and locations we use to find new prospects for you." },
    { type: 'p', text: "New campaigns start as Draft. Our team reviews the setup and activates it shortly after." },
    { type: 'ul', items: [
      "Draft — waiting for our team to review and activate",
      "Active — outreach is running",
      "Paused — temporarily on hold",
      "Completed — all prospects processed",
    ]},
  ],
};

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const CAMP_PILL: Record<string, { bg: string; text: string; border?: string }> = {
  draft:     { bg: '#f5f2ec', text: '#62655c', border: '1px solid #ece8df' },
  active:    { bg: '#edf4ef', text: '#3c7a5b' },
  paused:    { bg: '#f8efdb', text: '#b9831f' },
  completed: { bg: '#e7f0f7', text: '#2f6690' },
};

const PROSPECT_STATUS_LABEL: Record<string, string> = {
  new: 'New', contacted: 'Contacted', replied: 'Replied', hot_lead: 'Hot lead',
  won: 'Won', lost: 'Lost', generation_failed: 'Gen. failed', message_pending: 'Msg. pending',
};

const PROSPECT_STATUS_PILL: Record<string, { bg: string; text: string; border?: string }> = {
  new:                { bg: '#edf4ef', text: '#3c7a5b' },
  contacted:          { bg: '#f8efdb', text: '#b9831f' },
  replied:            { bg: '#f8efdb', text: '#b9831f' },
  hot_lead:           { bg: '#3c7a5b', text: '#fff' },
  won:                { bg: '#3c7a5b', text: '#fff' },
  lost:               { bg: 'transparent', text: '#9a9d92', border: '1px solid #ddd8cb' },
  generation_failed:  { bg: '#f6e8e2', text: '#a8533a', border: '1px solid rgba(168,83,58,0.2)' },
  message_pending:    { bg: '#f0ecf8', text: '#6b4fa0', border: '1px solid rgba(107,79,160,0.2)' },
};

const LANGUAGE_OPTIONS = [
  'English', 'Czech', 'French', 'Spanish', 'Portuguese', 'German', 'Italian',
  'Dutch', 'Polish', 'Slovak', 'Arabic', 'Chinese', 'Swahili', 'Bemba', 'Nyanja',
];

const ghostCls   = 'cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#3c7a5b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:opacity-50';

export function Campaigns({ clientId }: { clientId: string }) {
  const { rows, loading, error, reload } = useClientCampaignList(clientId);
  const { usage } = useClientUsage(clientId);
  const { toasts, toast, dismiss } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [openCampaign, setOpenCampaign] = useState<ClientCampaignRow | null>(null);

  // Existing campaigns over the limit (e.g. the limit was lowered after they
  // were created) are never touched here — this only gates creating new ones.
  const atLimit = usage !== null && usage.campaigns_remaining <= 0;
  const limitTitle = usage ? `You've used ${usage.campaign_count} of ${usage.max_campaigns} campaign slots. Contact us to increase your limit.` : undefined;

  return (
    <div style={FONT} className="flex flex-col gap-6 content">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]">
            <img src="https://cdn-icons-png.flaticon.com/128/6745/6745021.png" alt="Campaigns" className="w-10 h-10" />
            Campaigns
          </h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">{rows.length} campaign{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
          <HelpButton content={HELP} />
          <button onClick={reload} className={ghostCls}>Refresh</button>
          <button
            onClick={() => setShowNew(true)}
            disabled={atLimit}
            title={atLimit ? limitTitle : undefined}
            className={`${primaryCls} hidden md:inline-flex`}
            data-tour="new-campaign-btn"
          >
            + New campaign
          </button>
        </div>
      </header>

      {atLimit && (
        <div className="flex items-start gap-3 rounded-xl border border-[#e8d5a8] bg-[#f8efdb] px-4 py-3.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0dfb8]">
            <TriangleAlert size={15} strokeWidth={2.2} className="text-[#8a6417]" />
          </span>
          <p className="m-0 pt-0.5 text-[13px] leading-snug text-[#8a6417]">
            <strong className="font-bold">Campaign limit reached</strong> — you've used {usage!.campaign_count} of {usage!.max_campaigns} slots. Contact us to increase it before creating another one.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">Couldn't load your campaigns: {error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">No campaigns yet.</strong>
          <span className="text-[13px] text-[#62655c]">Create your first campaign to tell us who to target.</span>
          <button
            onClick={() => setShowNew(true)}
            disabled={atLimit}
            title={atLimit ? limitTitle : undefined}
            className={`${primaryCls} mt-2`}
          >
            + New campaign
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[20%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr>
                  {['Campaign', 'Status', 'Language', 'Prospects', 'Created', ''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const pill = CAMP_PILL[c.status] ?? CAMP_PILL.draft;
                  return (
                    <tr key={c.id} onClick={() => setOpenCampaign(c)} className="cursor-pointer">
                      <td className="min-w-0">
                        <div className="truncate font-bold text-[#20211c]" title={c.name}>{c.name}</div>
                      </td>
                      <td>
                        <span className="atbl-pill" style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}>
                          {c.status}
                        </span>
                      </td>
                      <td className="min-w-0 text-[#62655c]">
                        <div className="truncate" title={c.language}>{c.language}</div>
                      </td>
                      <td className="text-[#62655c]">{c.prospectCount}</td>
                      <td className="text-[12px] text-[#9a9d92] whitespace-nowrap">
                        {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-3 text-right">
                        <ChevronRight size={15} className="text-[#c4bfb5]" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            {rows.map((c) => {
              const pill = CAMP_PILL[c.status] ?? CAMP_PILL.draft;
              return (
                <button
                  key={c.id}
                  onClick={() => setOpenCampaign(c)}
                  className="cursor-pointer rounded-xl border border-[#ece8df] bg-white p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-bold text-[#20211c] text-[14px]" title={c.name}>{c.name}</span>
                    <span style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
                      className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]">
                      {c.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] text-[#62655c]">{c.language}</p>
                  <p className="mt-0.5 text-[12px] text-[#9a9d92]">{c.prospectCount} prospects</p>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Mobile FAB */}
      <button
        onClick={() => setShowNew(true)}
        disabled={atLimit}
        title={atLimit ? limitTitle : undefined}
        className="fixed bottom-24 right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-[#3c7a5b] text-white shadow-[0_6px_24px_rgba(60,122,91,0.4)] transition-colors hover:bg-[#2d5e46] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="New campaign"
        data-tour="new-campaign-btn"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      <AnimatePresence>
        {showNew && (
          <NewCampaignModal
            key="new-campaign-modal"
            clientId={clientId}
            onClose={() => setShowNew(false)}
            onCreated={(autoApproved) => {
              setShowNew(false); reload();
              toast(
                autoApproved
                  ? "Campaign created and running — we're finding businesses now."
                  : "Campaign created — it'll be reviewed and activated shortly."
              );
              queryClient.invalidateQueries({ queryKey: ['client-usage', clientId] });
            }}
          />
        )}
        {openCampaign && (
          <CampaignDetailModal
            key={`detail-${openCampaign.id}`}
            campaign={openCampaign}
            onClose={() => setOpenCampaign(null)}
            onUpdated={() => {
              reload();
              toast('Campaign updated.');
            }}
            onDeleted={() => {
              setOpenCampaign(null);
              reload();
              toast('Campaign deleted.');
              queryClient.invalidateQueries({ queryKey: ['client-usage', clientId] });
            }}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}


/* ── New Campaign Modal — 4-step wizard ──────────────────────────────
   Splitting one 6-field form into steps so a client isn't hit with
   everything (incl. two TagInputs with different separator rules) at
   once — each step validates only what's on screen before advancing. */
const STEP_LABELS = ['Basics', 'Who to target', 'Details', 'Review'];

function NewCampaignModal({
  clientId, onClose, onCreated,
}: { clientId: string; onClose: () => void; onCreated: (autoApproved: boolean) => void }) {
  const { profile } = useAuth();
  const [step, setStep]             = useState(0);
  const [name, setName]             = useState('');
  const [description, setDescription] = useState('');
  const [queries, setQueries]       = useState<string[]>([]);
  const [locations, setLocations]   = useState<string[]>([]);
  const [maxResults, setMaxResults] = useState(50);
  const [language, setLanguage]     = useState('English');
  const [busy, setBusy]             = useState(false);
  const [err, setErr]               = useState<string | null>(null);

  function validateStep(n: number): string | null {
    if (n === 0 && !name.trim()) return 'Campaign name is required.';
    if (n === 1) {
      if (queries.length === 0) return 'Add at least one search term.';
      if (locations.length === 0) return 'Add at least one target location.';
      if (looksLikeMultipleLocationsJoined(locations)) {
        return `"${locations[0]}" looks like more than one location joined together — press Enter (or use a semicolon) after each city so they save as separate entries.`;
      }
    }
    if (n === 2 && !language.trim()) return 'Outreach language is required.';
    return null;
  }

  function goNext() {
    const problem = validateStep(step);
    if (problem) { setErr(problem); return; }
    setErr(null);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function goBack() {
    setErr(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setBusy(true); setErr(null);
    const { autoApproved, error } = await createClientCampaign({
      client_id: clientId,
      created_by: profile?.id ?? null,
      name: name.trim(),
      description: description.trim(),
      language: language.trim(),
      search_queries: queries,
      target_locations: locations,
      max_results: maxResults,
    });
    setBusy(false);
    if (error) setErr(error.message); else onCreated(autoApproved);
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
        {/* Header + step indicator */}
        <div className="shrink-0 border-b border-[#ece8df] px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[18px] font-bold text-[#20211c]">New campaign</h2>
            <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-colors"
                style={{ background: i <= step ? '#3c7a5b' : '#ece8df' }}
              />
            ))}
          </div>
          <p className="m-0 mt-2 text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">
            Step {step + 1} of {STEP_LABELS.length} — {STEP_LABELS[step]}
          </p>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {step === 0 && (
            <>
              <div>
                <label className={fieldLbl}>Campaign name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prague Restaurants Outreach" style={FONT} className={inputCls} />
              </div>
              <div>
                <label className={fieldLbl}>Description <span className="normal-case font-normal">(optional)</span></label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of who you're targeting and why"
                  rows={3}
                  style={FONT}
                  className={`${inputCls} resize-y`}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <TagInput
                label="Search terms"
                placeholder="Type a search term and press Enter (e.g. restaurants, cafes, hotels)"
                helper="Separate several with commas, or add them one at a time and press Enter."
                values={queries}
                onChange={setQueries}
                splitOn=","
              />
              <TagInput
                label="Target locations"
                placeholder="Type a location and press Enter (e.g. Prague, Czech Republic)"
                helper="One city per entry — press Enter after each one. Use City, Country format. To add several at once, separate them with semicolons (not commas); don't put more than one city in a single entry."
                values={locations}
                onChange={setLocations}
                splitOn=";"
              />
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className={fieldLbl}>Max results</label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={maxResults}
                  onChange={(e) => setMaxResults(Math.min(500, Math.max(10, Number(e.target.value))))}
                  style={FONT}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-[#9a9d92]">Maximum number of businesses to find per search term per location.</p>
              </div>
              <div>
                <label className={fieldLbl}>Outreach language</label>
                <input
                  list="client-new-campaign-languages"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="English"
                  style={FONT}
                  className={inputCls}
                />
                <datalist id="client-new-campaign-languages">
                  {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l} />)}
                </datalist>
                <p className="mt-1 text-[11px] text-[#9a9d92]">Messages and follow-ups will be written in this language.</p>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <ReviewRow label="Campaign name" value={name} />
              {description.trim() && <ReviewRow label="Description" value={description} />}
              <ReviewRow label="Search terms" tags={queries} />
              <ReviewRow label="Target locations" tags={locations} />
              <ReviewRow label="Max results" value={String(maxResults)} />
              <ReviewRow label="Outreach language" value={language} />
              <p className="m-0 text-[12px] text-[#9a9d92]">
                Double-check everything above, then create your campaign. You can't edit these details once it's running.
              </p>
            </div>
          )}

          {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
          {step === 0 ? (
            <button onClick={onClose} className={ghostCls}>Cancel</button>
          ) : (
            <button onClick={goBack} className={ghostCls}>Back</button>
          )}
          {step < STEP_LABELS.length - 1 ? (
            <button onClick={goNext} className={primaryCls}>Next</button>
          ) : (
            <button onClick={submit} disabled={busy} className={primaryCls}>
              {busy ? 'Creating…' : 'Create Campaign'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Read-only row for the wizard's final review step. */
function ReviewRow({ label, value, tags }: { label: string; value?: string; tags?: string[] }) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">{label}</div>
      {tags ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-[#fbf9f5] border border-[#ece8df] px-2.5 py-1 text-[12px] text-[#62655c]">{t}</span>
          ))}
        </div>
      ) : (
        <p className="m-0 text-[13.5px] text-[#20211c]">{value}</p>
      )}
    </div>
  );
}

/* ── Campaign Detail Modal ─────────────────────────────────────────── */
function CampaignDetailModal({
  campaign, onClose, onUpdated, onDeleted,
}: { campaign: ClientCampaignRow; onClose: () => void; onUpdated: () => void; onDeleted: () => void }) {
  const { rows: prospects, loading } = useClientCampaignProspects(campaign.id);

  const [editing, setEditing]       = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [name, setName]             = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [queries, setQueries]       = useState<string[]>(campaign.search_queries);
  const [locations, setLocations]   = useState<string[]>(campaign.target_locations);
  const [maxResults, setMaxResults] = useState(campaign.max_results);
  const [language, setLanguage]     = useState(campaign.language);
  const [busy, setBusy]             = useState(false);
  const [err, setErr]               = useState<string | null>(null);

  const pill = CAMP_PILL[campaign.status] ?? CAMP_PILL.draft;

  const contacted = prospects.filter((p) => p.pipeline_status === 'contacted').length;
  const replied   = prospects.filter((p) => p.pipeline_status === 'replied').length;
  const hotLeads  = prospects.filter((p) => p.pipeline_status === 'hot_lead').length;
  const pendingApproval = prospects.filter((p) => p.pipeline_status === 'message_pending').length;

  function startEdit() {
    setErr(null);
    setEditing(true);
  }

  function cancelEdit() {
    setName(campaign.name);
    setDescription(campaign.description ?? '');
    setQueries(campaign.search_queries);
    setLocations(campaign.target_locations);
    setMaxResults(campaign.max_results);
    setLanguage(campaign.language);
    setErr(null);
    setEditing(false);
  }

  async function saveEdit() {
    if (!name.trim()) { setErr('Campaign name is required.'); return; }
    if (queries.length === 0) { setErr('Add at least one search term.'); return; }
    if (locations.length === 0) { setErr('Add at least one target location.'); return; }
    if (looksLikeMultipleLocationsJoined(locations)) {
      setErr(`"${locations[0]}" looks like more than one location joined together — press Enter (or use a semicolon) after each city so they save as separate entries.`);
      return;
    }
    if (!language.trim()) { setErr('Outreach language is required.'); return; }

    setBusy(true); setErr(null);
    const { error } = await updateClientCampaign(campaign.id, {
      name: name.trim(),
      description: description.trim(),
      language: language.trim(),
      search_queries: queries,
      target_locations: locations,
      max_results: maxResults,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setEditing(false);
    onUpdated();
  }

  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
  const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

  return (
    <>
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
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[18px] font-bold text-[#20211c]">{name}</h2>
            <span style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
              className="mt-1.5 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]">
              {campaign.status}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!editing && (
              <>
                <button
                  onClick={startEdit}
                  aria-label="Edit campaign"
                  title="Edit campaign"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#9a9d92] transition-colors hover:bg-[#f5f2ec] hover:text-[#3c7a5b]"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setDeleting(true)}
                  aria-label="Delete campaign"
                  title="Delete campaign"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#9a9d92] transition-colors hover:bg-[#fdf0ec] hover:text-[#a8533a]"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
          </div>
        </div>

        {/* Scrollable body */}
        {editing ? (
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <label className={fieldLbl}>Campaign name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={FONT} className={inputCls} />
          </div>

          <div>
            <label className={fieldLbl}>Description <span className="normal-case font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={FONT}
              className={`${inputCls} resize-y`}
            />
          </div>

          <TagInput
            label="Search terms"
            placeholder="Type a search term and press Enter (e.g. restaurants, cafes, hotels)"
            helper="Separate several with commas, or add them one at a time and press Enter."
            values={queries}
            onChange={setQueries}
            splitOn=","
          />

          <TagInput
            label="Target locations"
            placeholder="Type a location and press Enter (e.g. Prague, Czech Republic)"
            helper="One city per entry — press Enter after each one. Use City, Country format. To add several at once, separate them with semicolons (not commas); don't put more than one city in a single entry."
            values={locations}
            onChange={setLocations}
            splitOn=";"
          />

          <div>
            <label className={fieldLbl}>Max results</label>
            <input
              type="number"
              min={10}
              max={500}
              value={maxResults}
              onChange={(e) => setMaxResults(Math.min(500, Math.max(10, Number(e.target.value))))}
              style={FONT}
              className={inputCls}
            />
          </div>

          <div>
            <label className={fieldLbl}>Outreach language</label>
            <input
              list="client-edit-campaign-languages"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={FONT}
              className={inputCls}
            />
            <datalist id="client-edit-campaign-languages">
              {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l} />)}
            </datalist>
          </div>

          {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
        </div>
        ) : (
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          {description && (
            <p className="m-0 text-[13px] leading-relaxed text-[#62655c]">{description}</p>
          )}

          {!loading && campaign.prospectCount === 0 && (
            <div className="rounded-xl border border-[#ece8df] bg-[#fbf9f5] px-4 py-3.5">
              <p className="m-0 text-[13px] font-bold text-[#20211c]">What happens next</p>
              <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-[#62655c]">
                We'll find matching businesses, write personalized outreach for each one, and
                {' '}{campaign.status === 'active' ? "get them approved and sent" : "have them ready once your campaign is approved"}.
                This can take a little while — check back here, or we'll flag it once there's something for you to review.
              </p>
            </div>
          )}

          {pendingApproval > 0 && (
            <Link
              to="/app/approvals"
              className="flex items-center gap-3 rounded-xl border border-[#d8cdf0] bg-[#f0ecf8] px-4 py-3.5 no-underline transition-colors hover:bg-[#e9e2f5]"
            >
              <span className="flex-1 text-[13px] leading-snug text-[#6b4fa0]">
                <strong className="font-bold">{pendingApproval} message{pendingApproval !== 1 ? 's' : ''} ready</strong> for your review.
              </span>
              <ChevronRight size={16} className="shrink-0 text-[#6b4fa0]" />
            </Link>
          )}

          <div>
            <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">Search terms</div>
            <div className="flex flex-wrap gap-1.5">
              {queries.map((q) => (
                <span key={q} className="rounded-full bg-[#fbf9f5] border border-[#ece8df] px-2.5 py-1 text-[12px] text-[#62655c]">{q}</span>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">Target locations</div>
            <div className="flex flex-wrap gap-1.5">
              {locations.map((l) => (
                <span key={l} className="rounded-full bg-[#fbf9f5] border border-[#ece8df] px-2.5 py-1 text-[12px] text-[#62655c]">{l}</span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="rounded-xl border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-3">
              <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">Max results</div>
              <div className="mt-0.5 font-bold text-[#20211c]">{maxResults}</div>
            </div>
            <div className="rounded-xl border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-3">
              <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">Language</div>
              <div className="mt-0.5 font-bold text-[#20211c]">{language}</div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">Prospects — {campaign.prospectCount} total</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-[#ece8df] bg-white px-2 py-2.5">
                <div className="text-[18px] font-extrabold text-[#20211c]">{contacted}</div>
                <div className="mt-0.5 text-[10.5px] text-[#9a9d92]">Contacted</div>
              </div>
              <div className="rounded-xl border border-[#ece8df] bg-white px-2 py-2.5">
                <div className="text-[18px] font-extrabold text-[#20211c]">{replied}</div>
                <div className="mt-0.5 text-[10.5px] text-[#9a9d92]">Replied</div>
              </div>
              <div className="rounded-xl border border-[#ece8df] bg-white px-2 py-2.5">
                <div className="text-[18px] font-extrabold text-[#3c7a5b]">{hotLeads}</div>
                <div className="mt-0.5 text-[10.5px] text-[#9a9d92]">Hot leads</div>
              </div>
            </div>
          </div>

          {loading ? (
            <SkeletonTable rows={4} cols={2} />
          ) : prospects.length > 0 && (
            <div>
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">Prospect list</div>
              <div className="rounded-xl border border-[#ece8df] overflow-hidden">
                <div className="divide-y divide-[#f5f2ec]">
                  {prospects.map((p) => {
                    const spill = PROSPECT_STATUS_PILL[p.pipeline_status] ?? PROSPECT_STATUS_PILL.new;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-[#20211c]" title={p.business_name}>{p.business_name}</div>
                          {(p.category || p.location) && (
                            <div className="truncate text-[11px] text-[#9a9d92]">
                              {[p.category, p.location].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                        <span style={{ background: spill.bg, color: spill.text, border: spill.border ?? 'none' }}
                          className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em]">
                          {PROSPECT_STATUS_LABEL[p.pipeline_status] ?? p.pipeline_status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Footer — only shown while editing; view mode has no footer actions */}
        {editing && (
          <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
            <button onClick={cancelEdit} className={ghostCls}>Cancel</button>
            <button onClick={saveEdit} disabled={busy} className={primaryCls}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>

    <AnimatePresence>
      {deleting && (
        <DeleteCampaignModal
          key="delete-campaign"
          campaign={campaign}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
    </AnimatePresence>
    </>
  );
}

/* ── Delete Campaign confirmation ─────────────────────────────────────
   Same "show what gets deleted first" pattern as the admin's own delete
   flow (getCampaignDeleteCounts/deleteCampaign in useAdminData.ts) — a
   client can't undo this, so they should see the blast radius up front. */
function DeleteCampaignModal({
  campaign, onClose, onDeleted,
}: { campaign: ClientCampaignRow; onClose: () => void; onDeleted: () => void }) {
  const [counts, setCounts] = useState<ClientCampaignDeleteCounts | null>(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  useEffect(() => {
    getClientCampaignDeleteCounts(campaign.id).then(setCounts);
  }, [campaign.id]);

  async function confirm() {
    setBusy(true); setErr(null);
    const { error } = await deleteClientCampaign(campaign.id);
    setBusy(false);
    if (error) setErr(error); else onDeleted();
  }

  const blastItems = counts
    ? [
        counts.prospects > 0 && `${counts.prospects} prospect${counts.prospects !== 1 ? 's' : ''}`,
        counts.messages  > 0 && `${counts.messages} message${counts.messages !== 1 ? 's' : ''}`,
      ].filter(Boolean)
    : [];

  return (
    <motion.div
      className="fixed inset-0 z-60 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[80vh] md:max-w-[460px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Delete campaign</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div className="rounded-xl border border-[#a8533a]/20 bg-[#fdf0ec] px-4 py-4">
            <p className="m-0 text-[14px] font-bold text-[#a8533a]">
              Permanently delete "{campaign.name}"?
            </p>
            <p className="m-0 mt-1.5 text-[13px] text-[#a8533a]/80">
              This cannot be undone. All prospects, messages, and replies tied to this campaign will be deleted.
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
              <p className="text-[13px] text-[#62655c]">No associated records — the campaign row only.</p>
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
          {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
        </div>
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button
            onClick={confirm}
            disabled={busy || !counts}
            className="cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#a8533a] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#8a3f2b] disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete campaign'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
