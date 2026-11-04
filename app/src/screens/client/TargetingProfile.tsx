import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ChevronDown, Users, Megaphone, Search, Globe, type LucideIcon } from 'lucide-react';
import { useClientProfile } from '../../hooks/useClientProfile';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  useClientIcp, saveClientIcp, buildClientIcp, useClientTargetingPerformance,
  type ClientIcpPatch,
} from '../../hooks/useClientIcp';
import { TagInput, CHIP_TONE, type ChipTone } from '../../components/TagInput';
import { useToast, ToastHost } from '../../components/Toast';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { summarizeRebuild, type RebuildSummary } from '../../lib/rebuildSummary';
import { btn } from '../../lib/clientButtons';
import { WhatsWorking } from './Results';

const HELP: HelpContent = {
  title: 'Targeting profile',
  body: [
    { type: 'p', text: "This is what we know about who you target - built from your website and, over time, from which replies actually turn positive." },
    { type: 'p', text: "Anything you edit here is kept exactly as you wrote it - refreshing from your website never overwrites a field you've touched." },
  ],
};

type ArrayKey = keyof Omit<ClientIcpPatch, 'notes'>;
type FieldKey = ArrayKey | 'notes';

interface FieldDef {
  key: ArrayKey;
  label: string;
  placeholder: string;
  splitOn: string;
  // Each group gets its own chip style so the sections read apart within the brand palette.
  tone: ChipTone;
  emptyHint?: string;
}

const WHO_FIELDS: FieldDef[] = [
  { key: 'target_business_types', label: 'Business types', placeholder: 'e.g. Dental practice, Gym', splitOn: ',', tone: 'brand' },
  { key: 'target_locations', label: 'Locations', placeholder: 'e.g. Bloomington, IL', splitOn: ';', tone: 'brand' },
  {
    key: 'decision_maker_roles', label: 'Decision-makers', placeholder: 'e.g. Owner, Office manager', splitOn: ',', tone: 'brand',
    emptyHint: "We don't fill this in for you yet. Add the roles who'd actually say yes.",
  },
];

const PITCH_FIELDS: FieldDef[] = [
  { key: 'value_props', label: 'What you offer', placeholder: 'e.g. Office cleaning, Window cleaning', splitOn: ',', tone: 'ink' },
  { key: 'pain_points', label: 'Problems you solve', placeholder: 'e.g. Needs frequent hygienic cleaning', splitOn: ',', tone: 'ink' },
];

const SEARCH_FIELD: FieldDef = {
  key: 'suggested_search_terms', label: 'Suggested search terms', placeholder: 'e.g. Dental Practice', splitOn: ',', tone: 'outline',
};

const ALL_FIELDS = [...WHO_FIELDS, ...PITCH_FIELDS, SEARCH_FIELD];

export function TargetingProfile({ clientId, client = supabase, readOnly = false, basePath = '/app', settingsAvailable = true }: {
  clientId: string; client?: SupabaseClient; readOnly?: boolean; basePath?: string;
  /** False in admin "View as client", which has no Settings page to link to. */
  settingsAvailable?: boolean;
}) {
  const { icp, loading, error, reload } = useClientIcp(clientId, client);
  // The profile is built from the website saved in Settings. Without one, Refresh
  // can only fail, so say so up front and link straight to the field.
  const { profile, loading: profileLoading } = useClientProfile(clientId);
  const website = (profile?.website_url ?? '').trim();
  const noWebsite = !profileLoading && !!profile && !website;
  const websiteSettingsHref = `${basePath}/settings?open=website`;
  const { rows: perf, loading: perfLoading } = useClientTargetingPerformance(clientId, client);
  const { toasts, toast, dismiss } = useToast();
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<FieldKey | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rebuildSummary, setRebuildSummary] = useState<RebuildSummary | null>(null);

  const fieldLabel = (key: string) => ALL_FIELDS.find((f) => f.key === key)?.label ?? key;

  function valuesFor(key: ArrayKey): string[] {
    return draft[key] ?? icp[key] ?? [];
  }

  // Saving is shown next to the field rather than as a toast: a toast per tag was noise.
  async function commitArray(key: ArrayKey, values: string[]) {
    setDraft((prev) => ({ ...prev, [key]: values }));
    setSavingField(key);
    setSavedField(null);
    setErr(null);
    const { error } = await saveClientIcp(clientId, { [key]: values } as ClientIcpPatch);
    setSavingField(null);
    if (error) { setErr(error); toast(error, 'error'); return; }
    await reload();
    setDraft((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setSavedField(key);
  }

  async function commitNotes() {
    if (notesDraft === null) return;
    setSavingField('notes');
    setSavedField(null);
    setErr(null);
    const { error } = await saveClientIcp(clientId, { notes: notesDraft });
    setSavingField(null);
    if (error) { setErr(error); toast(error, 'error'); return; }
    await reload();
    setNotesDraft(null);
    setSavedField('notes');
  }

  async function handleRebuild() {
    if (rebuilding) return;
    setRebuilding(true); setErr(null); setRebuildSummary(null);
    const before = icp;
    const { ok, error, limitedData } = await buildClientIcp(clientId);
    if (!ok) {
      setRebuilding(false);
      setErr(error);
      toast(error ?? "Couldn't refresh your targeting profile - please try again.", 'error');
      return;
    }
    const after = await reload();
    setRebuilding(false);
    const summary = after ? summarizeRebuild(before, after, ALL_FIELDS.map((f) => f.key)) : null;
    setRebuildSummary(summary);
    toast('Refreshed from your website.' + (limitedData ? ' We could only read limited information from it.' : ''));
  }

  function fieldStatus(key: FieldKey): string | null {
    if (savingField === key) return 'Saving…';
    if (savedField === key) return 'Saved';
    if (icp.edited_fields.includes(key)) return 'Edited by you';
    return null;
  }

  function renderArrayField(f: FieldDef) {
    const values = valuesFor(f.key);
    const edited = icp.edited_fields.includes(f.key);
    return (
      <Field key={f.key} label={f.label} status={fieldStatus(f.key)}>
        {readOnly ? (
          <div className="flex flex-wrap gap-1.5">
            {values.length === 0 ? (
              <span className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>-</span>
            ) : values.map((v) => (
              <span key={v} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${CHIP_TONE[f.tone].chip}`}>{v}</span>
            ))}
          </div>
        ) : (
          <TagInput label="" placeholder={f.placeholder} values={values} onChange={(v) => commitArray(f.key, v)} splitOn={f.splitOn} tone={f.tone} />
        )}
        {!readOnly && values.length === 0 && (edited ? (
          <Hint>Refreshing skips this field because you edited it. Add a value to fill it.</Hint>
        ) : f.emptyHint && <Hint>{f.emptyHint}</Hint>)}
      </Field>
    );
  }

  return (
    <main className="content flex flex-col gap-6">
      <div className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>Targeting profile</h1>
          <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            Who we look for on your behalf, and how we pitch you.
          </p>
        </div>
        <HelpButton content={HELP} />
      </div>

      {noWebsite && (
        <section className="flex flex-col gap-3 rounded-[10px] border px-4 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--leaf)', background: 'var(--leaf-tint)' }}>
          <div className="flex min-w-0 gap-3">
            <Globe size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--leaf)' }} aria-hidden />
            <div className="min-w-0">
              <h2 className="m-0 text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>Add your website to build this profile</h2>
              <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                We read your website to work out who to look for and how to pitch you, then fill in the fields below.
                {readOnly || !settingsAvailable ? ' The client can add it in their Settings.' : ' You can also fill them in by hand.'}
              </p>
            </div>
          </div>
          {!readOnly && settingsAvailable && (
            <Link to={websiteSettingsHref} className={`${btn('primary', 'md')} shrink-0 self-start no-underline sm:self-center`}>
              Add your website
            </Link>
          )}
        </section>
      )}

      {(error || err) && (
        <div className="rounded-xl border px-4 py-3.5 text-[13.5px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: 'var(--line)' }}>
          {error ? `Couldn't load your targeting profile: ${error}` : err}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse rounded-[10px] border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="mb-3 h-4 w-40 rounded" style={{ background: 'var(--line)' }} />
          <div className="h-9 w-full rounded-lg" style={{ background: 'var(--line)' }} />
        </div>
      ) : (
        <>
          <Section icon={Users} title="Who we look for" description="The businesses we find and email for you.">
            {WHO_FIELDS.map(renderArrayField)}
          </Section>

          <Section icon={Megaphone} title="How we pitch you" description="What you offer and the problems you solve for them.">
            {PITCH_FIELDS.map(renderArrayField)}
            <Field label="Anything else we should know" status={fieldStatus('notes')}>
              {readOnly ? (
                <p className="m-0 text-[13px]" style={{ color: 'var(--ink-soft)' }}>{icp.notes || '-'}</p>
              ) : (
                <textarea
                  value={notesDraft ?? icp.notes ?? ''}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={commitNotes}
                  rows={3}
                  aria-label="Anything else we should know"
                  placeholder="Anything else about who you're trying to reach."
                  className="w-full resize-y rounded-lg border px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-(--leaf)"
                  style={{ borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink)' }}
                />
              )}
            </Field>
          </Section>

          <details className="group overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3">
              <IconBadge icon={Search} subtle />
              <span>
                <span className="block text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>Advanced</span>
                <span className="block text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                  Search terms ({valuesFor(SEARCH_FIELD.key).length})
                </span>
              </span>
              </span>
              <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" style={{ color: 'var(--ink-soft)' }} aria-hidden />
            </summary>
            <div className="border-t" style={{ borderColor: 'var(--line)' }}>{renderArrayField(SEARCH_FIELD)}</div>
          </details>
        </>
      )}

      {perfLoading ? (
        <div className="animate-pulse rounded-[10px] border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="h-9 w-full rounded-lg" style={{ background: 'var(--line)' }} />
        </div>
      ) : perf.length === 0 ? (
        <Section title="What's working" description="No results yet. This fills in once your first campaign has been sent." />
      ) : (
        <WhatsWorking rows={perf} />
      )}

      {!readOnly && (
        <section className="flex flex-col gap-3 rounded-[10px] border px-4 py-4 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="min-w-0">
            <h2 className="m-0 text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>Refresh from your website</h2>
            <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
              Re-reads your website and updates the fields above, except any you've edited yourself.
            </p>
            <p className="m-0 mt-1 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
              {website ? (
                <>Reads <strong className="break-all font-semibold" style={{ color: 'var(--ink)' }}>{website}</strong>{settingsAvailable && <> · <Link to={websiteSettingsHref} className="font-semibold" style={{ color: 'var(--leaf)' }}>Change</Link></>}</>
              ) : noWebsite ? (
                settingsAvailable
                  ? <>No website saved yet. <Link to={websiteSettingsHref} className="font-semibold" style={{ color: 'var(--leaf)' }}>Add it in Settings</Link> first.</>
                  : <>No website saved yet. The client can add it in their Settings.</>
              ) : null}
            </p>
            {rebuilding && (
              <p className="m-0 mt-1.5 text-[12.5px] font-semibold" style={{ color: 'var(--leaf)' }} role="status">
                Reading your website. This can take up to a minute, so please keep this page open.
              </p>
            )}
            {rebuildSummary && !rebuilding && (
              <div className="mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }} role="status">
                <div><strong>Filled:</strong> {rebuildSummary.filled.length ? rebuildSummary.filled.map(fieldLabel).join(', ') : 'nothing new'}</div>
                {rebuildSummary.skippedEdited.length > 0 && (
                  <div><strong>Kept your edits:</strong> {rebuildSummary.skippedEdited.map(fieldLabel).join(', ')}</div>
                )}
                {rebuildSummary.stillEmpty.length > 0 && (
                  <div><strong>Still empty:</strong> {rebuildSummary.stillEmpty.map(fieldLabel).join(', ')}</div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleRebuild}
            disabled={rebuilding || noWebsite}
            title={noWebsite ? 'Add your website in Settings first' : undefined}
            className={`${btn('secondary', 'md')} shrink-0 self-start`}
          >
            <RefreshCw size={14} className={rebuilding ? 'animate-spin' : ''} aria-hidden />
            {rebuilding ? 'Refreshing…' : 'Refresh'}
          </button>
        </section>
      )}

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}

function IconBadge({ icon: Icon, subtle = false }: { icon: LucideIcon; subtle?: boolean }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={subtle ? { background: 'var(--leaf-tint)', color: 'var(--leaf)' } : { background: 'var(--leaf)', color: 'var(--ad-surface)' }}
    >
      <Icon size={15} strokeWidth={2.2} aria-hidden />
    </span>
  );
}

function Section({ icon, title, description, children }: { icon?: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ ...(icon ? { background: 'var(--leaf-tint)' } : {}), ...(children ? { borderBottom: '1px solid var(--line)' } : {}) }}
      >
        {icon && <IconBadge icon={icon} />}
        <div className="min-w-0">
          <h2 className="m-0 text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2>
          <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>{description}</p>
        </div>
      </div>
      {children && <div className="divide-y divide-(--line)">{children}</div>}
    </section>
  );
}

function Field({ label, status, children }: { label: string; status: string | null; children: ReactNode }) {
  return (
    <div className="px-4 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{label}</span>
        {status && (
          <span
            className="shrink-0 text-[11.5px]"
            style={{ color: status === 'Saved' ? 'var(--leaf)' : 'var(--ink-soft)' }}
            title={status === 'Edited by you' ? "Refreshing from your website won't overwrite this" : undefined}
            role={status === 'Edited by you' ? undefined : 'status'}
          >
            {status}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>{children}</p>;
}
