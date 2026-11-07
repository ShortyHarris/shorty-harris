// Campaign Wizard (docs/CAMPAIGN_WIZARD_BUILD_PLAN.md): three screens.
//   1. Your website  - a URL, or "I don't have a website" and a short description
//   2. Check what we found - business, services, who you sell to, area, goal
//   3. Pick your campaigns - campaign ideas (milestone 3)
// Answers autosave to wizard_sessions. Screen 2's Continue saves them to the client's profile
// through confirm_wizard_profile(). Reading the website with AI arrives in milestone 2; until
// then the user fills screen 2 in themselves.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check, Globe, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { btn } from '../../lib/clientButtons';
import { TagInput } from '../../components/TagInput';
import { LocationAreaInput } from '../../components/LocationAreaInput';
import { RequiredMark } from '../../components/RequiredMark';
import { queryClient } from '../../lib/queryClient';
import {
  COMPANY_SIZES, GOALS, MONTH_LABELS, addService, carryDescription, markConfirmed, missingFields, missingMessage,
  needsCheck, normalizeWebsite, profileComplete, seasonLabel, toggleMonth,
  type WizardAnswers, type WizardEntry, type WizardScreen, type WizardService,
} from '../../lib/wizardSession';
import {
  confirmProfile, fetchOpenSession, fetchSavedProfile, startSession, useAutosave, type WizardSessionRow,
} from '../../hooks/useWizardSession';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const STEPS = ['Your website', 'Check what we found', 'Pick your campaigns'];
const fieldLbl = 'mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-(--ad-ink)';
const inputCls = 'w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)';
const panelCls = 'flex flex-col gap-4 rounded-2xl border border-(--ad-line) bg-(--ad-surface) p-5';

function CheckTag() {
  return (
    <span className="rounded-md border border-(--ad-amber-line) bg-(--ad-amber-tint) px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-(--ad-amber-ink)">
      Please check
    </span>
  );
}

type Phase = { kind: 'loading' } | { kind: 'resume'; session: WizardSessionRow } | { kind: 'ready' } | { kind: 'error'; message: string };

export function CampaignWizard({
  clientId, client = supabase, basePath = '/app',
}: { clientId: string; client?: SupabaseClient; basePath?: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const entry: WizardEntry = params.get('entry') === 'find_new' ? 'find_new'
    : params.get('entry') === 'onboarding' ? 'onboarding' : 'new_campaign';

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [session, setSession] = useState<WizardSessionRow | null>(null);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [screen, setScreen] = useState<WizardScreen>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const autosave = useAutosave(session?.id ?? null, client);

  const campaignsPath = `${basePath}/campaigns`;

  const begin = useCallback(async (from: WizardEntry) => {
    setPhase({ kind: 'loading' });
    try {
      const saved = await fetchSavedProfile(clientId, client);
      // Returning users and "Find new campaigns" skip the website step when the profile is complete.
      const first: WizardScreen = from === 'find_new' || profileComplete(saved) ? 2 : 1;
      const s = await startSession(clientId, from, saved, first, client);
      setSession(s); setAnswers(s.answers); setScreen(s.screen);
      setPhase({ kind: 'ready' });
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  }, [clientId, client]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      client.from('clients').select('wizard_enabled').eq('id', clientId).single(),
      fetchOpenSession(clientId, client),
    ])
      .then(([flag, open]) => {
        if (cancelled) return;
        if (flag.data?.wizard_enabled !== true) {
          setPhase({ kind: 'error', message: "it isn't switched on for your account yet. Contact us if you'd like to try it." });
          return;
        }
        if (open) setPhase({ kind: 'resume', session: open });
        else void begin(entry);
      })
      .catch((e) => !cancelled && setPhase({ kind: 'error', message: (e as Error).message }));
    return () => { cancelled = true; };
    // Runs once per visit; `entry` only matters for a brand-new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function resume(s: WizardSessionRow) {
    setSession(s); setAnswers(s.answers ?? {}); setScreen(s.screen);
    setPhase({ kind: 'ready' });
  }

  function update(next: WizardAnswers, confirmField?: string) {
    const a = confirmField ? markConfirmed(next, confirmField) : next;
    setErr(null);
    setAnswers(a);
    autosave.queue({ answers: a });
  }

  async function goTo(s: WizardScreen) {
    setErr(null);
    // Screen 1's description becomes screen 2's "What you do" unless the user already wrote one.
    const a = s === 2 ? carryDescription(answers) : answers;
    if (a !== answers) setAnswers(a);
    setScreen(s);
    autosave.queue({ screen: s, answers: a });
    await autosave.flush();
    window.scrollTo({ top: 0 });
  }

  async function continueFromProfile() {
    const missing = missingFields(answers);
    if (missing.length) { setErr(missingMessage(missing)); return; }
    if (!session) return;
    setBusy(true); setErr(null);
    autosave.queue({ answers });
    await autosave.flush();
    const r = await confirmProfile(session.id, client);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error === 'missing_fields' && 'missing' in r ? missingMessage(r.missing) : `Couldn't save your profile: ${r.error}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['client-icp', clientId] });
    await goTo(3);
  }

  async function skipToManual() {
    await autosave.flush();
    navigate(`${campaignsPath}?new=manual`);
  }

  if (phase.kind === 'loading') {
    return <div style={FONT} className="content text-[13px] text-(--ad-ink-soft)">Loading the campaign wizard…</div>;
  }
  if (phase.kind === 'error') {
    return (
      <div style={FONT} className="content flex flex-col gap-3">
        <p className="m-0 text-[13px] text-(--ad-ink)">Couldn't open the campaign wizard: {phase.message}</p>
        <Link to={campaignsPath} className={btn('secondary', 'lg')}>Back to campaigns</Link>
      </div>
    );
  }
  if (phase.kind === 'resume') {
    const s = phase.session;
    const when = new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return (
      <div style={FONT} className="content flex max-w-[560px] flex-col gap-4">
        <h1 className="m-0 text-[22px] font-extrabold tracking-tight text-(--ad-ink)">Continue where you left off?</h1>
        <p className="m-0 text-[13px] text-(--ad-ink-soft)">
          You started the campaign wizard on {when} and got to step {s.screen} of 3, “{STEPS[s.screen - 1]}”. Your answers are saved.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className={btn('primary', 'lg')} onClick={() => resume(s)}>Continue</button>
          <button className={btn('secondary', 'lg')} onClick={() => void begin(entry)}>Start again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={FONT} className="content flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-(--ad-green)">
            Campaign wizard · step {screen} of 3
          </span>
          <span className="text-[11.5px] text-(--ad-ink-faint)" aria-live="polite">
            {autosave.state === 'saving' ? 'Saving…' : autosave.state === 'error' ? "Couldn't save - we'll retry" : 'All changes saved'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 rounded-full" style={{ background: i < screen ? 'var(--ad-green)' : 'var(--ad-line)' }} />
          ))}
        </div>
      </header>

      {screen === 1 && <WebsiteStep answers={answers} update={update} />}
      {screen === 2 && <ProfileStep answers={answers} update={update} entry={session?.entry_point ?? entry} />}
      {screen === 3 && <IdeasStep campaignsPath={campaignsPath} onBack={() => void goTo(2)} onManual={() => void skipToManual()} />}

      {err && (
        <div role="alert" className="rounded-xl border border-(--ad-clay-line) bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-ink)">{err}</div>
      )}

      {screen !== 3 && (
        <footer className="flex flex-col-reverse gap-3 border-t border-(--ad-line) pt-4 md:flex-row md:items-center md:justify-between">
          <button className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-(--ad-green) underline underline-offset-4" onClick={() => void skipToManual()}>
            Skip wizard &amp; create manually
          </button>
          <div className="flex gap-2">
            {screen === 1 && <Link to={campaignsPath} className={btn('secondary', 'lg')}>Cancel</Link>}
            {screen === 2 && <button className={btn('secondary', 'lg')} onClick={() => void goTo(1)}>← Back</button>}
            {screen === 1 && (
              <button className={btn('primary', 'lg')} disabled={!websiteStepReady(answers)} onClick={() => void goTo(2)}>
                Continue →
              </button>
            )}
            {screen === 2 && (
              <button className={btn('primary', 'lg')} disabled={busy} onClick={() => void continueFromProfile()}
                title={missingFields(answers).length ? missingMessage(missingFields(answers)) : undefined}>
                {busy ? 'Saving…' : 'Find campaigns →'}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function websiteStepReady(a: WizardAnswers): boolean {
  if (a.website?.mode === 'describe') return !!a.business?.name?.trim() && !!a.website.description?.trim();
  return !!normalizeWebsite(a.website?.url ?? '');
}

// ── Screen 1 ────────────────────────────────────────────────────────────────────────────
function WebsiteStep({ answers, update }: { answers: WizardAnswers; update: (a: WizardAnswers, f?: string) => void }) {
  const mode = answers.website?.mode ?? 'website';
  const url = answers.website?.url ?? '';
  const normalized = normalizeWebsite(url);
  const setWebsite = (patch: Partial<NonNullable<WizardAnswers['website']>>) =>
    update({ ...answers, website: { mode, ...answers.website, ...patch } });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-[22px] font-extrabold tracking-tight text-(--ad-ink)">Tell us about your business</h1>
        <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">We use this to suggest B2B campaigns. You can change everything on the next screen.</p>
      </div>
      {mode === 'website' ? (
        <div className={panelCls}>
          <div>
            <label htmlFor="wiz-url" className={fieldLbl}><Globe size={14} aria-hidden /> Company website</label>
            <input id="wiz-url" className={inputCls} placeholder="yourcompany.com" value={url} inputMode="url" autoComplete="url"
              onChange={(e) => setWebsite({ url: e.target.value })} />
            {url.trim() && !normalized && (
              <p className="m-0 mt-1.5 text-[12px] text-(--ad-clay)">That doesn't look like a website address. Try something like yourcompany.com.</p>
            )}
            <p className="m-0 mt-1.5 text-[12px] text-(--ad-ink-faint)">
              Reading your website automatically is coming soon. For now, continue and fill in the details on the next screen.
            </p>
          </div>
          <button className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-(--ad-green) underline underline-offset-4"
            onClick={() => setWebsite({ mode: 'describe' })}>
            I don't have a website
          </button>
        </div>
      ) : (
        <div className={panelCls}>
          <div>
            <label htmlFor="wiz-name" className={fieldLbl}>Company name <RequiredMark /></label>
            <input id="wiz-name" className={inputCls} value={answers.business?.name ?? ''}
              onChange={(e) => update({ ...answers, business: { ...answers.business, name: e.target.value } })} />
          </div>
          <div>
            <label htmlFor="wiz-desc" className={fieldLbl}>What do you do? <RequiredMark /></label>
            <textarea id="wiz-desc" rows={3} className={inputCls} placeholder="e.g. Lawn mowing, landscaping and snow removal for businesses around Bozeman."
              value={answers.website?.description ?? ''} onChange={(e) => setWebsite({ description: e.target.value })} />
          </div>
          <div>
            <label htmlFor="wiz-where" className={fieldLbl}>Where do you work?</label>
            <input id="wiz-where" className={inputCls} placeholder="e.g. Bozeman, Montana and 50 miles around"
              value={answers.website?.area_text ?? ''} onChange={(e) => setWebsite({ area_text: e.target.value })} />
          </div>
          <div>
            <label htmlFor="wiz-best" className={fieldLbl}>Who are your best customers? <span className="text-[11px] font-normal text-(--ad-ink-faint)">Optional</span></label>
            <input id="wiz-best" className={inputCls} placeholder="e.g. property managers, HOAs"
              value={answers.website?.best_customers ?? ''} onChange={(e) => setWebsite({ best_customers: e.target.value })} />
          </div>
          <button className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-(--ad-green) underline underline-offset-4"
            onClick={() => setWebsite({ mode: 'website' })}>
            I do have a website
          </button>
        </div>
      )}
    </section>
  );
}

// ── Screen 2 ────────────────────────────────────────────────────────────────────────────
function ProfileStep({ answers, update, entry }: { answers: WizardAnswers; update: (a: WizardAnswers, f?: string) => void; entry: WizardEntry }) {
  const [newService, setNewService] = useState('');
  const [showMore, setShowMore] = useState(
    !!(answers.audience?.roles?.length || answers.audience?.exclusions?.length || answers.audience?.company_size),
  );
  const services = answers.services ?? [];
  const missing = useMemo(() => new Set(missingFields(answers)), [answers]);

  const setBusiness = (k: 'name' | 'industry' | 'description', v: string) =>
    update({ ...answers, business: { ...answers.business, [k]: v } }, `business.${k}`);
  const setAudience = (patch: Partial<NonNullable<WizardAnswers['audience']>>, field: string) =>
    update({ ...answers, audience: { ...answers.audience, ...patch } }, field);
  const setServices = (list: WizardService[]) => update({ ...answers, services: list }, 'services');

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-[22px] font-extrabold tracking-tight text-(--ad-ink)">Check what we found</h1>
        <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">
          {entry === 'find_new'
            ? 'This is the profile you saved before. Change anything that is new, then find more campaigns.'
            : 'Everything here is editable. We use it to suggest campaigns that fit your business.'}
        </p>
      </div>

      <div className={panelCls}>
        <h2 className="m-0 text-[14px] font-bold text-(--ad-ink)">Business</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="wiz-bname" className={fieldLbl}>Company name <RequiredMark />{needsCheck(answers, 'business.name') && <CheckTag />}</label>
            <input id="wiz-bname" className={inputCls} value={answers.business?.name ?? ''} onChange={(e) => setBusiness('name', e.target.value)} />
          </div>
          <div>
            <label htmlFor="wiz-industry" className={fieldLbl}>Industry {needsCheck(answers, 'business.industry') && <CheckTag />}</label>
            <input id="wiz-industry" className={inputCls} placeholder="e.g. Landscaping" value={answers.business?.industry ?? ''} onChange={(e) => setBusiness('industry', e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="wiz-bdesc" className={fieldLbl}>What you do, in a sentence {needsCheck(answers, 'business.description') && <CheckTag />}</label>
          <input id="wiz-bdesc" className={inputCls} value={answers.business?.description ?? ''} onChange={(e) => setBusiness('description', e.target.value)} />
        </div>
      </div>

      <div className={panelCls}>
        <h2 className="m-0 flex items-center gap-2 text-[14px] font-bold text-(--ad-ink)">Services <RequiredMark />{needsCheck(answers, 'services') && <CheckTag />}</h2>
        {services.length === 0 && <p className="m-0 text-[12.5px] text-(--ad-ink-faint)">Add at least one service you sell to businesses.</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {services.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex flex-col gap-2 rounded-xl border border-(--ad-line) px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-(--ad-ink)">{s.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[11.5px] text-(--ad-ink-faint)">{seasonLabel(s.seasonal_months)}</span>
                  <button aria-label={`Remove ${s.name}`} className={btn('quiet', 'sm')} onClick={() => setServices(services.filter((_, j) => j !== i))}>
                    <Trash2 size={13} aria-hidden />
                  </button>
                </span>
              </div>
              <details>
                <summary className="cursor-pointer text-[12px] text-(--ad-ink-soft)">Seasonal? Pick the months you sell it</summary>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Months for ${s.name}`}>
                  {MONTH_LABELS.map((m, mi) => {
                    const on = (s.seasonal_months ?? []).includes(mi + 1);
                    return (
                      <button key={m} aria-pressed={on}
                        className={`cursor-pointer rounded-md border px-2 py-1 text-[11.5px] ${on ? 'border-(--ad-green) bg-(--ad-green-tint) text-(--ad-green)' : 'border-(--ad-line) bg-transparent text-(--ad-ink-soft)'}`}
                        onClick={() => setServices(services.map((x, j) => j === i ? { ...x, seasonal_months: toggleMonth(x.seasonal_months, mi + 1) } : x))}>
                        {m}
                      </button>
                    );
                  })}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setServices(addService(services, newService)); setNewService(''); }}>
          <label htmlFor="wiz-newsvc" className="sr-only">New service</label>
          <input id="wiz-newsvc" className={inputCls} placeholder="e.g. Snow removal" value={newService} onChange={(e) => setNewService(e.target.value)} />
          <button type="submit" className={btn('secondary', 'lg')} disabled={!newService.trim()}>Add service</button>
        </form>
      </div>

      <div className={panelCls}>
        <h2 className="m-0 text-[14px] font-bold text-(--ad-ink)">Who you sell to</h2>
        <TagInput sentenceLabel label="Types of business to reach" required placeholder="e.g. property managers, office parks"
          helper="Businesses, not people. We only run business-to-business campaigns."
          values={answers.audience?.business_types ?? []} onChange={(v) => setAudience({ business_types: v }, 'audience.business_types')} splitOn="," />
        {needsCheck(answers, 'audience.business_types') && <CheckTag />}
        {!showMore ? (
          <button className="cursor-pointer self-start border-0 bg-transparent p-0 text-[12.5px] font-semibold text-(--ad-green)" onClick={() => setShowMore(true)}>
            + Roles, company size and exclusions (optional)
          </button>
        ) : (
          <>
            <TagInput sentenceLabel label="Who decides (roles)" placeholder="e.g. facilities manager, owner"
              helper="Shapes the wording of your emails."
              values={answers.audience?.roles ?? []} onChange={(v) => setAudience({ roles: v }, 'audience.roles')} splitOn="," />
            <div>
              <label htmlFor="wiz-size" className={fieldLbl}>Company size</label>
              <select id="wiz-size" className={inputCls} value={answers.audience?.company_size || COMPANY_SIZES[0]}
                onChange={(e) => setAudience({ company_size: e.target.value === COMPANY_SIZES[0] ? '' : e.target.value }, 'audience.company_size')}>
                {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <TagInput sentenceLabel label="Don't contact" placeholder="e.g. residential homeowners, competitors"
              values={answers.audience?.exclusions ?? []} onChange={(v) => setAudience({ exclusions: v }, 'audience.exclusions')} splitOn="," />
          </>
        )}
      </div>

      <div className={panelCls}>
        <h2 className="m-0 text-[14px] font-bold text-(--ad-ink)">Area</h2>
        {answers.website?.mode === 'describe' && answers.website.area_text && !(answers.area?.areas ?? []).length && (
          <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">You said: “{answers.website.area_text}”. Add it below as a place or a radius.</p>
        )}
        <LocationAreaInput sentenceLabel label="Where you work" required helper="A city, a region, or a radius around a point."
          values={answers.area?.areas ?? []} onChange={(v) => update({ ...answers, area: { areas: v } }, 'area')} maxItems={3} capLabel="area" />
      </div>

      <div className={panelCls}>
        <h2 className="m-0 flex items-center gap-2 text-[14px] font-bold text-(--ad-ink)">Your goal <RequiredMark /></h2>
        <div className="grid gap-2 md:grid-cols-2" role="radiogroup" aria-label="Your goal">
          {GOALS.map((g) => {
            const on = answers.goal?.goal === g.value;
            return (
              <button key={g.value} role="radio" aria-checked={on}
                className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2.5 text-left ${on ? 'border-(--ad-green) bg-(--ad-green-tint)' : 'border-(--ad-line) bg-transparent'}`}
                onClick={() => update({ ...answers, goal: { ...answers.goal, goal: g.value } }, 'goal')}>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-(--ad-ink)">{on && <Check size={13} aria-hidden />}{g.label}</span>
                <span className="text-[11.5px] text-(--ad-ink-soft)">{g.hint}</span>
              </button>
            );
          })}
        </div>
        <div>
          <label htmlFor="wiz-cta" className={fieldLbl}>What should they do? <span className="text-[11px] font-normal text-(--ad-ink-faint)">Optional</span></label>
          <input id="wiz-cta" className={inputCls} placeholder="e.g. Reply for a free quote" value={answers.goal?.cta ?? ''}
            onChange={(e) => update({ ...answers, goal: { ...answers.goal, cta: e.target.value } }, 'goal')} />
        </div>
      </div>

      {missing.size > 0 && (
        <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">{missingMessage([...missing])}</p>
      )}
    </section>
  );
}

// ── Screen 3 (campaign ideas arrive in milestone 3) ─────────────────────────────────────
function IdeasStep({ campaignsPath, onBack, onManual }: { campaignsPath: string; onBack: () => void; onManual: () => void }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-[22px] font-extrabold tracking-tight text-(--ad-ink)">Pick your campaigns</h1>
        <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">Your business profile is saved.</p>
      </div>
      <div className={`${panelCls} items-start`}>
        <span className="flex items-center gap-2 text-[14px] font-bold text-(--ad-ink)"><Sparkles size={16} className="text-(--ad-green)" aria-hidden /> Campaign suggestions are on the way</span>
        <p className="m-0 text-[13px] text-(--ad-ink-soft)">
          Soon this screen will suggest one to five campaigns that fit your profile. Until then you can create a campaign yourself; it uses the same targeting tools.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className={btn('primary', 'lg')} onClick={onManual}>Create a campaign</button>
          <button className={btn('secondary', 'lg')} onClick={onBack}>← Edit business info</button>
          <Link to={campaignsPath} className={btn('quiet', 'lg')}>Back to campaigns</Link>
        </div>
      </div>
    </section>
  );
}
