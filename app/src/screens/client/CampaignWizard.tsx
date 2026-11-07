// Campaign Wizard (docs/CAMPAIGN_WIZARD_BUILD_PLAN.md): three screens.
//   1. Your website  - a URL (read by AI), or "I don't have a website" and a short description
//   2. Check what we found - business, services, who you sell to, area, goal (all editable)
//   3. Pick your campaigns - 1-5 AI ideas with estimates; each pick becomes a free draft
// Answers autosave to wizard_sessions. Screen 2's Continue saves them to the client's profile
// (confirm_wizard_profile). AI calls go through the wizard-ai edge function.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check, Globe, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TagInput } from '../../components/TagInput';
import { LocationAreaInput } from '../../components/LocationAreaInput';
import { RequiredMark } from '../../components/RequiredMark';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Progress } from '../../components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { queryClient } from '../../lib/queryClient';
import { cn } from '../../lib/utils';
import {
  COMPANY_SIZES, GOALS, MONTH_LABELS, addService, carryDescription, ideasFingerprint, markConfirmed, mergeAnalysis,
  missingFields, missingMessage, needsCheck, normalizeWebsite, profileComplete, seasonLabel, toggleMonth,
  type WizardAnswers, type WizardEntry, type WizardGoal, type WizardScreen, type WizardService,
} from '../../lib/wizardSession';
import {
  confirmProfile, fetchOpenSession, fetchSavedProfile, saveSession, startSession, useAutosave, type WizardSessionRow,
} from '../../hooks/useWizardSession';
import {
  callWizardAi, costForIdeas, estimateProspects, launchLine, wizardErrorMessage,
  type AnalyzeResult, type DraftsResult, type IdeasResult, type WizardIdea,
} from '../../hooks/useWizardAi';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const STEPS = ['Your website', 'Check what we found', 'Pick your campaigns'];
const ANALYZE_LINES = ['Reading your website', 'Finding your services', 'Working out who you sell to'];
const DESCRIBE_LINES = ['Reading your description', 'Listing your services', 'Working out who you sell to'];
const IDEA_LINES = ['Matching your services to buyers', 'Checking your existing campaigns', 'Estimating how many businesses we can find'];
const FIT_LABEL: Record<WizardIdea['fit'], string> = {
  strong: 'Strong fit', seasonal: 'Seasonal', new_segment: 'New segment', expansion: 'Service expansion', own: 'Your idea',
};
const linkBtn = 'h-auto p-0 text-[13px] font-semibold underline underline-offset-4';

function CheckTag() {
  return (
    <Badge variant="outline" className="border-(--ad-amber-line) bg-(--ad-amber-tint) px-1.5 py-0 text-[10.5px] uppercase tracking-wider text-(--ad-amber-ink)">
      Please check
    </Badge>
  );
}

/** Honest progress while the AI works: one line at a time, each ticked as time passes. */
function Working({ lines, title }: { lines: string[]; title: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, lines.length - 1)), 5000);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <Card aria-live="polite">
      <CardContent className="flex flex-col gap-3 pt-6">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-(--ad-ink)"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{title}</span>
        <Progress value={((step + 1) / (lines.length + 1)) * 100} className="h-1.5" />
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
          {lines.map((l, i) => (
            <li key={l} className={cn('flex items-center gap-2', i <= step ? 'text-(--ad-ink)' : 'text-(--ad-ink-faint)')}>
              {i < step ? <Check className="h-3.5 w-3.5 text-(--ad-green)" aria-hidden /> : i === step ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <span className="inline-block h-3.5 w-3.5" />}
              {l}…
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
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
  const [working, setWorking] = useState<null | 'analyze' | 'describe'>(null);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [thinNote, setThinNote] = useState(false);
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

  async function goTo(s: WizardScreen, from: WizardAnswers = answers) {
    setErr(null);
    // Screen 1's description becomes screen 2's "What you do" unless the user already wrote one.
    const a = s === 2 ? carryDescription(from) : from;
    setAnswers(a);
    setScreen(s);
    autosave.queue({ screen: s, answers: a });
    await autosave.flush();
    window.scrollTo({ top: 0 });
  }

  /** Screen 1: AI reads the website or the description, then screen 2 shows the result. */
  async function analyze() {
    const describe = answers.website?.mode === 'describe';
    setSiteError(null); setErr(null); setThinNote(false);
    let payload: Record<string, unknown>;
    if (describe) {
      payload = { name: answers.business?.name ?? '', description: answers.website?.description ?? '', area_text: answers.website?.area_text ?? '', best_customers: answers.website?.best_customers ?? '' };
    } else {
      const url = normalizeWebsite(answers.website?.url ?? '');
      if (!url) { setSiteError(wizardErrorMessage('bad_url')); return; }
      payload = { url };
    }
    setWorking(describe ? 'describe' : 'analyze');
    const r = await callWizardAi<AnalyzeResult>('analyze', payload, client);
    setWorking(null);
    if (!r.ok) {
      if (describe) {
        // The AI is optional: carry on with what was typed.
        setErr(`${wizardErrorMessage(r.error)} We've kept what you typed.`);
        await goTo(2);
        return;
      }
      setSiteError(wizardErrorMessage(r.error));
      return;
    }
    const best = (answers.website?.best_customers ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const withBest = best.length ? { ...answers, audience: { ...answers.audience, business_types: [...(answers.audience?.business_types ?? []), ...best] } } : answers;
    const merged = mergeAnalysis(withBest, r.data.profile, r.data.source);
    setThinNote(r.data.thin);
    await goTo(2, merged);
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
      <div style={FONT} className="content flex flex-col items-start gap-3">
        <p className="m-0 text-[13px] text-(--ad-ink)">Couldn't open the campaign wizard: {phase.message}</p>
        <Button asChild variant="outline"><Link to={campaignsPath}>Back to campaigns</Link></Button>
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
          <Button onClick={() => resume(s)}>Continue</Button>
          <Button variant="outline" onClick={() => void begin(entry)}>Start again</Button>
        </div>
      </div>
    );
  }

  const describe = answers.website?.mode === 'describe';
  const screen1Ready = describe ? !!answers.business?.name?.trim() && !!answers.website?.description?.trim() : !!normalizeWebsite(answers.website?.url ?? '');

  return (
    <div style={FONT} className="content flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-(--ad-green)">Campaign wizard · step {screen} of 3</span>
          <span className="text-[11.5px] text-(--ad-ink-faint)" aria-live="polite">
            {autosave.state === 'saving' ? 'Saving…' : autosave.state === 'error' ? "Couldn't save - we'll retry" : 'All changes saved'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" aria-hidden>
          {STEPS.map((_, i) => <div key={i} className="h-1 rounded-full" style={{ background: i < screen ? 'var(--ad-green)' : 'var(--ad-line)' }} />)}
        </div>
      </header>

      {screen === 1 && (working
        ? <Working title={working === 'analyze' ? 'Reading your website' : 'Building your profile'} lines={working === 'analyze' ? ANALYZE_LINES : DESCRIBE_LINES} />
        : <WebsiteStep answers={answers} update={update} siteError={siteError} onAnalyze={() => void analyze()}
            onDescribe={() => { setSiteError(null); update({ ...answers, website: { ...answers.website, mode: 'describe' } }); }} />)}
      {screen === 2 && <ProfileStep answers={answers} update={update} entry={session?.entry_point ?? entry} thin={thinNote}
        onReread={answers.website?.url && !describe ? () => void goTo(1) : undefined} />}
      {screen === 3 && session && (
        <IdeasStep clientId={clientId} client={client} session={session} answers={answers}
          onAnswers={(a) => { setAnswers(a); autosave.queue({ answers: a }); }}
          onBack={() => void goTo(2)} onManual={() => void skipToManual()}
          onCreated={(n) => navigate(`${campaignsPath}?drafts=${n}`)} />
      )}

      {err && <Alert variant="destructive" role="alert"><AlertDescription>{err}</AlertDescription></Alert>}

      {screen !== 3 && !working && (
        <footer className="flex flex-col-reverse gap-3 border-t border-(--ad-line) pt-4 md:flex-row md:items-center md:justify-between">
          <Button variant="link" className={cn(linkBtn, 'self-start')} onClick={() => void skipToManual()}>Skip wizard &amp; create manually</Button>
          <div className="flex gap-2">
            {screen === 1 && <Button asChild variant="outline"><Link to={campaignsPath}>Cancel</Link></Button>}
            {screen === 2 && <Button variant="outline" onClick={() => void goTo(1)}>← Back</Button>}
            {screen === 1 && (
              <Button disabled={!screen1Ready} onClick={() => void analyze()}>
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />{describe ? 'Continue' : 'Analyze my website'}
              </Button>
            )}
            {screen === 2 && (
              <Button disabled={busy} onClick={() => void continueFromProfile()}
                title={missingFields(answers).length ? missingMessage(missingFields(answers)) : undefined}>
                {busy ? 'Saving…' : 'Find campaigns →'}
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

// ── Screen 1 ────────────────────────────────────────────────────────────────────────────────
function WebsiteStep({ answers, update, siteError, onAnalyze, onDescribe }: {
  answers: WizardAnswers; update: (a: WizardAnswers, f?: string) => void; siteError: string | null; onAnalyze: () => void; onDescribe: () => void;
}) {
  const mode = answers.website?.mode ?? 'website';
  const url = answers.website?.url ?? '';
  const setWebsite = (patch: Partial<NonNullable<WizardAnswers['website']>>) =>
    update({ ...answers, website: { mode, ...answers.website, ...patch } });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-[22px] font-extrabold tracking-tight text-(--ad-ink)">Tell us about your business</h1>
        <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">We read your website and suggest B2B campaigns. You can change everything on the next screen.</p>
      </div>
      {mode === 'website' ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wiz-url" className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" aria-hidden /> Company website</Label>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onAnalyze(); }}>
                <Input id="wiz-url" placeholder="yourcompany.com" value={url} inputMode="url" autoComplete="url"
                  onChange={(e) => setWebsite({ url: e.target.value })} aria-invalid={!!siteError} />
              </form>
              {url.trim() && !normalizeWebsite(url) && (
                <p className="m-0 text-[12px] text-(--ad-clay)">That doesn't look like a website address. Try something like yourcompany.com.</p>
              )}
              <p className="m-0 text-[12px] text-(--ad-ink-faint)">We read only your public website. It takes about 20 seconds.</p>
            </div>
            {siteError && (
              <Alert variant="destructive">
                <AlertTitle>We couldn't use that website</AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  <span>{siteError}</span>
                  <span className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={onDescribe}>Describe my business</Button>
                    <Button size="sm" variant="outline" onClick={onAnalyze}>Try again</Button>
                  </span>
                </AlertDescription>
              </Alert>
            )}
            <Button variant="link" className={cn(linkBtn, 'self-start')} onClick={onDescribe}>I don't have a website</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wiz-name">Company name <RequiredMark /></Label>
              <Input id="wiz-name" value={answers.business?.name ?? ''} onChange={(e) => update({ ...answers, business: { ...answers.business, name: e.target.value } })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wiz-desc">What do you do? <RequiredMark /></Label>
              <Textarea id="wiz-desc" rows={3} placeholder="e.g. Lawn mowing, landscaping and snow removal for businesses around Bozeman."
                value={answers.website?.description ?? ''} onChange={(e) => setWebsite({ description: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wiz-where">Where do you work?</Label>
              <Input id="wiz-where" placeholder="e.g. Bozeman, Montana and 50 miles around" value={answers.website?.area_text ?? ''} onChange={(e) => setWebsite({ area_text: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wiz-best">Who are your best customers? <span className="text-[11px] font-normal text-(--ad-ink-faint)">Optional</span></Label>
              <Input id="wiz-best" placeholder="e.g. property managers, HOAs" value={answers.website?.best_customers ?? ''} onChange={(e) => setWebsite({ best_customers: e.target.value })} />
            </div>
            <Button variant="link" className={cn(linkBtn, 'self-start')} onClick={() => setWebsite({ mode: 'website' })}>I do have a website</Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

// ── Screen 2 ────────────────────────────────────────────────────────────────────────────────
function Section({ title, children, required, check }: { title: string; children: React.ReactNode; required?: boolean; check?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[14px] font-bold">{title}{required && <RequiredMark />}{check && <CheckTag />}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function ProfileStep({ answers, update, entry, thin, onReread }: {
  answers: WizardAnswers; update: (a: WizardAnswers, f?: string) => void; entry: WizardEntry; thin: boolean; onReread?: () => void;
}) {
  const [newService, setNewService] = useState('');
  const [showMore, setShowMore] = useState(
    !!(answers.audience?.roles?.length || answers.audience?.exclusions?.length || answers.audience?.company_size),
  );
  const services = answers.services ?? [];
  const missing = useMemo(() => missingFields(answers), [answers]);
  const anyGuesses = (answers.unconfirmed ?? []).length > 0;

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
      {thin && (
        <Alert><AlertTitle>We found very little on your website</AlertTitle>
          <AlertDescription>Please fill in the gaps. Anything marked “Please check” is our guess.</AlertDescription></Alert>
      )}
      {anyGuesses && !thin && (
        <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">Anything marked <CheckTag /> is our guess. It clears when you change or confirm it.</p>
      )}
      {onReread && <Button variant="link" className={cn(linkBtn, 'self-start text-[12.5px]')} onClick={onReread}>Re-read my website</Button>}

      <Section title="Business">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wiz-bname" className="flex items-center gap-2">Company name <RequiredMark />{needsCheck(answers, 'business.name') && <CheckTag />}</Label>
            <Input id="wiz-bname" value={answers.business?.name ?? ''} onChange={(e) => setBusiness('name', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wiz-industry" className="flex items-center gap-2">Industry {needsCheck(answers, 'business.industry') && <CheckTag />}</Label>
            <Input id="wiz-industry" placeholder="e.g. Landscaping" value={answers.business?.industry ?? ''} onChange={(e) => setBusiness('industry', e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-bdesc" className="flex items-center gap-2">What you do, in a sentence {needsCheck(answers, 'business.description') && <CheckTag />}</Label>
          <Input id="wiz-bdesc" value={answers.business?.description ?? ''} onChange={(e) => setBusiness('description', e.target.value)} />
        </div>
      </Section>

      <Section title="Services" required check={needsCheck(answers, 'services')}>
        {services.length === 0 && <p className="m-0 text-[12.5px] text-(--ad-ink-faint)">Add at least one service you sell to businesses.</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {services.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex flex-col gap-2 rounded-lg border border-(--ad-line) px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-(--ad-ink)">{s.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[11.5px] text-(--ad-ink-faint)">{seasonLabel(s.seasonal_months)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${s.name}`} onClick={() => setServices(services.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </span>
              </div>
              <details>
                <summary className="cursor-pointer text-[12px] text-(--ad-ink-soft)">Seasonal? Pick the months you sell it</summary>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Months for ${s.name}`}>
                  {MONTH_LABELS.map((m, mi) => {
                    const on = (s.seasonal_months ?? []).includes(mi + 1);
                    return (
                      <Button key={m} size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on} className="h-7 px-2 text-[11.5px]"
                        onClick={() => setServices(services.map((x, j) => (j === i ? { ...x, seasonal_months: toggleMonth(x.seasonal_months, mi + 1) } : x)))}>
                        {m}
                      </Button>
                    );
                  })}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setServices(addService(services, newService)); setNewService(''); }}>
          <Label htmlFor="wiz-newsvc" className="sr-only">New service</Label>
          <Input id="wiz-newsvc" placeholder="e.g. Snow removal" value={newService} onChange={(e) => setNewService(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!newService.trim()}><Plus className="mr-1 h-4 w-4" aria-hidden />Add service</Button>
        </form>
      </Section>

      <Section title="Who you sell to" check={needsCheck(answers, 'audience.business_types')}>
        <TagInput sentenceLabel label="Types of business to reach" required placeholder="e.g. property managers, office parks"
          helper="Businesses, not people. We only run business-to-business campaigns."
          values={answers.audience?.business_types ?? []} onChange={(v) => setAudience({ business_types: v }, 'audience.business_types')} splitOn="," />
        {!showMore ? (
          <Button variant="link" className={cn(linkBtn, 'self-start text-[12.5px] no-underline')} onClick={() => setShowMore(true)}>
            + Roles, company size and exclusions (optional)
          </Button>
        ) : (
          <>
            <TagInput sentenceLabel label="Who decides (roles)" placeholder="e.g. facilities manager, owner" helper="Shapes the wording of your emails."
              values={answers.audience?.roles ?? []} onChange={(v) => setAudience({ roles: v }, 'audience.roles')} splitOn="," />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wiz-size">Company size</Label>
              <select id="wiz-size" className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={answers.audience?.company_size || COMPANY_SIZES[0]}
                onChange={(e) => setAudience({ company_size: e.target.value === COMPANY_SIZES[0] ? '' : e.target.value }, 'audience.company_size')}>
                {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <TagInput sentenceLabel label="Don't contact" placeholder="e.g. residential homeowners, competitors"
              values={answers.audience?.exclusions ?? []} onChange={(v) => setAudience({ exclusions: v }, 'audience.exclusions')} splitOn="," />
          </>
        )}
      </Section>

      <Section title="Area" check={needsCheck(answers, 'area')}>
        {answers.website?.area_text && !(answers.area?.areas ?? []).length && (
          <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">{answers.website.mode === 'describe' ? 'You said' : 'Your website says'}: “{answers.website.area_text}”. Add it below as a place or a radius.</p>
        )}
        <LocationAreaInput sentenceLabel label="Where you work" required helper="A city, a region, or a radius around a point."
          values={answers.area?.areas ?? []} onChange={(v) => update({ ...answers, area: { areas: v } }, 'area')} maxItems={3} capLabel="area" />
      </Section>

      <Section title="Your goal" required check={needsCheck(answers, 'goal')}>
        <RadioGroup className="grid gap-2 md:grid-cols-2" aria-label="Your goal" value={answers.goal?.goal ?? ''}
          onValueChange={(v) => update({ ...answers, goal: { ...answers.goal, goal: v as WizardGoal } }, 'goal')}>
          {GOALS.map((g) => (
            <Label key={g.value} htmlFor={`goal-${g.value}`}
              className={cn('flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 font-normal',
                answers.goal?.goal === g.value ? 'border-(--ad-green) bg-(--ad-green-tint)' : 'border-(--ad-line)')}>
              <RadioGroupItem id={`goal-${g.value}`} value={g.value} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-(--ad-ink)">{g.label}</span>
                <span className="text-[11.5px] text-(--ad-ink-soft)">{g.hint}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wiz-cta">What should they do? <span className="text-[11px] font-normal text-(--ad-ink-faint)">Optional</span></Label>
          <Input id="wiz-cta" placeholder="e.g. Reply for a free quote" value={answers.goal?.cta ?? ''}
            onChange={(e) => update({ ...answers, goal: { ...answers.goal, cta: e.target.value } }, 'goal')} />
        </div>
      </Section>

      {missing.length > 0 && <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">{missingMessage(missing)}</p>}
    </section>
  );
}

// ── Screen 3 ────────────────────────────────────────────────────────────────────────────────
interface IdeasState { ideas: WizardIdea[]; duplicates: string[]; slotsLeft: number | null }

function IdeasStep({ clientId, client, session, answers, onAnswers, onBack, onManual, onCreated }: {
  clientId: string; client: SupabaseClient; session: WizardSessionRow; answers: WizardAnswers;
  onAnswers: (a: WizardAnswers) => void; onBack: () => void; onManual: () => void; onCreated: (n: number) => void;
}) {
  const fp = ideasFingerprint(answers);
  const [savedIdeas] = useState(() => (session.ideas ?? []) as WizardIdea[]);
  const [override, setOverride] = useState<IdeasState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(session.selected ?? []));
  const [regenerating, setRegenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showOwn, setShowOwn] = useState(false);

  // First visit: suggest ideas. Coming back: show the ones already suggested.
  const initial = useQuery({
    queryKey: ['wizard-ideas', session.id],
    queryFn: async (): Promise<IdeasState> => {
      if (savedIdeas.length > 0) return { ideas: savedIdeas, duplicates: [], slotsLeft: null };
      const r = await callWizardAi<IdeasResult>('ideas', { session_id: session.id }, client);
      if (!r.ok) throw new Error(r.error);
      onAnswers({ ...answers, ideas_fp: fp });
      return { ideas: r.data.ideas, duplicates: r.data.duplicates, slotsLeft: r.data.slots_left };
    },
    staleTime: Infinity, gcTime: 0, retry: false, refetchOnWindowFocus: false,
  });
  const state: IdeasState = override ?? initial.data ?? { ideas: [], duplicates: [], slotsLeft: null };
  const loading = initial.isLoading || regenerating;
  const loadErr = initial.error ? wizardErrorMessage((initial.error as Error).message) : null;
  // Screen 2 changed since these ideas were made: offer to refresh them.
  const stale = !!answers.ideas_fp && answers.ideas_fp !== fp && state.ideas.some((i) => i.fit !== 'own');

  // One credit line per idea, in order (free launches left this month are used first).
  const items = state.ideas.map((i) => ({ lo: i.est_lo ?? 0, hi: i.est_hi ?? i.max_results }));
  const { data: cost = null } = useQuery({
    queryKey: ['wizard-cost', clientId, items],
    queryFn: () => costForIdeas(clientId, items, client),
    enabled: items.length > 0,
  });

  const generate = useCallback(async () => {
    setRegenerating(true); setErr(null);
    const r = await callWizardAi<IdeasResult>('ideas', { session_id: session.id }, client);
    setRegenerating(false);
    if (!r.ok) { setErr(wizardErrorMessage(r.error)); return; }
    const own = state.ideas.filter((i) => i.fit === 'own');
    const ideas = [...r.data.ideas, ...own];
    setOverride({ ideas, duplicates: r.data.duplicates, slotsLeft: r.data.slots_left });
    setSelected((sel) => new Set([...sel].filter((id) => ideas.some((i) => i.id === id))));
    onAnswers({ ...answers, ideas_fp: fp });
  }, [session.id, client, state.ideas, answers, fp, onAnswers]);

  async function addOwn(idea: { name: string; service: string; who: string }) {
    const areas = (answers.area?.areas ?? []).slice(0, 3);
    const est = await estimateProspects(clientId, 1, areas.length || 1, 200, client);
    const own: WizardIdea = {
      id: `own-${Date.now().toString(36)}`, name: idea.name.trim(), service: idea.service, target: idea.who.trim(),
      reason: 'Your idea', fit: 'own', business_types: [idea.who.trim()], roles: answers.audience?.roles ?? [],
      search_queries: [idea.who.trim()], target_areas: areas, max_results: 200, suggested_start: null, language: 'English',
      est_lo: est.lo, est_hi: est.hi,
    };
    const ideas = [...state.ideas, own];
    await saveSession(session.id, { ideas }, client);
    setOverride({ ...state, ideas });
    setSelected((sel) => new Set(sel).add(own.id));
    setShowOwn(false);
  }

  async function create() {
    const ids = state.ideas.filter((i) => selected.has(i.id)).map((i) => i.id);
    if (ids.length === 0) return;
    setCreating(true); setErr(null);
    const r = await callWizardAi<DraftsResult>('create_drafts', { session_id: session.id, idea_ids: ids }, client);
    setCreating(false);
    if (!r.ok) { setErr(wizardErrorMessage(r.error)); return; }
    queryClient.invalidateQueries({ queryKey: ['my-campaigns', clientId] });
    onCreated(r.data.created.length);
  }

  const n = state.ideas.filter((i) => selected.has(i.id)).length;
  const costFor = (i: number) => cost?.items?.[i];

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-[22px] font-extrabold tracking-tight text-(--ad-ink)">Pick your campaigns</h1>
        <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">Each one you pick becomes its own draft. Drafts are free and nothing is sent until you launch. Every number is an estimate.</p>
      </div>

      {stale && !loading && (
        <Alert>
          <AlertTitle>Your changes affect these ideas</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>You changed your business details since these were suggested.</span>
            <Button size="sm" className="self-start" onClick={() => void generate()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />Refresh ideas</Button>
          </AlertDescription>
        </Alert>
      )}
      {loading && <Working title="Finding campaigns that fit" lines={IDEA_LINES} />}
      {(err || loadErr) && <Alert variant="destructive" role="alert"><AlertDescription>{err ?? loadErr}</AlertDescription></Alert>}

      {!loading && state.duplicates.length > 0 && (
        <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">
          {state.duplicates.length} idea{state.duplicates.length === 1 ? '' : 's'} skipped: you already run {state.duplicates.map((d) => `“${d}”`).join(', ')}.
        </p>
      )}
      {!loading && state.slotsLeft !== null && state.slotsLeft < 5 && state.slotsLeft > 0 && (
        <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">You have room for {state.slotsLeft} more campaign{state.slotsLeft === 1 ? '' : 's'} on your plan.</p>
      )}

      {!loading && state.ideas.length === 0 && !err && !loadErr && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 pt-6">
            <strong className="text-[14px] text-(--ad-ink)">
              {state.slotsLeft === 0 ? "You've reached your campaign limit." : "We couldn't find a strong B2B campaign from this profile."}
            </strong>
            <span className="text-[13px] text-(--ad-ink-soft)">
              {state.slotsLeft === 0 ? 'Archive a campaign or contact us to raise your limit.' : 'That usually means the services or customers are too narrow. Here is what you can do.'}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onBack}>← Edit business info</Button>
              {state.slotsLeft !== 0 && <Button variant="outline" onClick={() => setShowOwn(true)}><Plus className="mr-1 h-4 w-4" aria-hidden />Add my own idea</Button>}
              <Button onClick={onManual}>Create manually</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && state.ideas.length > 0 && (
        <>
          {state.ideas.length < 3 && state.ideas.some((i) => i.fit !== 'own') && (
            <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">Only {state.ideas.length} idea{state.ideas.length === 1 ? '' : 's'} fit well. We don't pad the list; add more services on the previous screen to see more.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {state.ideas.map((idea, i) => {
              const on = selected.has(idea.id);
              const line = costFor(i);
              const toggle = () => setSelected((s) => { const nx = new Set(s); if (nx.has(idea.id)) nx.delete(idea.id); else nx.add(idea.id); return nx; });
              return (
                <Card key={idea.id} role="checkbox" aria-checked={on} tabIndex={0}
                  onClick={toggle} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}
                  className={cn('cursor-pointer transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on && 'border-(--ad-green) shadow-[0_0_0_1px_var(--ad-green)]')}>
                  <CardContent className="flex flex-col gap-2.5 pt-5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={idea.fit === 'seasonal' ? 'outline' : 'secondary'}
                        className={cn('text-[10.5px] uppercase tracking-wider', idea.fit === 'seasonal' && 'border-(--ad-amber-line) bg-(--ad-amber-tint) text-(--ad-amber-ink)')}>
                        {FIT_LABEL[idea.fit]}
                      </Badge>
                      <Checkbox checked={on} tabIndex={-1} aria-hidden onClick={(e) => e.stopPropagation()} onCheckedChange={toggle} />
                    </div>
                    <strong className="text-[14.5px] text-(--ad-ink)">{idea.name}</strong>
                    <span className="text-[12.5px] text-(--ad-ink-soft)"><b className="font-semibold text-(--ad-ink)">Target:</b> {idea.target}</span>
                    {idea.reason && idea.fit !== 'own' && <span className="text-[12.5px] text-(--ad-ink-soft)">{idea.reason}</span>}
                    {idea.service && <span className="text-[10.5px] font-semibold uppercase tracking-wider text-(--ad-ink-faint)">{idea.service}</span>}
                    <div className="flex flex-col gap-1 rounded-md bg-(--ad-surface-2) px-3 py-2 text-[12.5px] text-(--ad-ink)">
                      <span><b className="font-semibold">Est. prospects:</b> {idea.est_lo ?? '…'}–{idea.est_hi ?? '…'} businesses</span>
                      <span className="flex flex-wrap items-center gap-1.5"><b className="font-semibold">Est. hot leads:</b> {line ? `${line.hot_lo}–${line.hot_hi}` : '…'}
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase tracking-wider">Every campaign varies</Badge></span>
                      <span><b className="font-semibold">Launch:</b> {line ? launchLine(line, cost) : '…'}</span>
                      {idea.suggested_start && <span><b className="font-semibold">Suggested start:</b> {new Date(`${idea.suggested_start}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (seasonal)</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {showOwn && <OwnIdeaForm services={(answers.services ?? []).map((s) => s.name)} onCancel={() => setShowOwn(false)} onAdd={(x) => void addOwn(x)} />}

      {!loading && (
        <footer className="flex flex-col gap-3 border-t border-(--ad-line) pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <strong className="text-[13px] text-(--ad-ink)">{n} selected</strong>
              <span className="text-[12px] text-(--ad-ink-soft)">
                Every selected campaign becomes its own draft. Drafts are free.
                {cost && cost.short_by > 0 && n > 0 && ` Launching all of them later would need ${cost.credits_needed} credit${cost.credits_needed === 1 ? '' : 's'}.`}
              </span>
            </div>
            <Button disabled={n === 0 || creating} onClick={() => void create()}>
              {creating ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />Writing your emails…</> : `Create ${n} draft${n === 1 ? '' : 's'} →`}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onBack}>← Edit business info</Button>
            {state.ideas.length > 0 && <Button variant="ghost" onClick={() => void generate()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />Regenerate ideas</Button>}
            {state.ideas.length > 0 && !showOwn && <Button variant="ghost" onClick={() => setShowOwn(true)}><Plus className="mr-1 h-4 w-4" aria-hidden />Add my own idea</Button>}
            <Button variant="link" className={cn(linkBtn, 'ml-auto')} onClick={onManual}>Skip wizard &amp; create manually</Button>
          </div>
        </footer>
      )}
    </section>
  );
}

function OwnIdeaForm({ services, onAdd, onCancel }: { services: string[]; onAdd: (x: { name: string; service: string; who: string }) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [service, setService] = useState(services[0] ?? '');
  const [who, setWho] = useState('');
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-[14px] font-bold">Add your own campaign idea</CardTitle></CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim() && who.trim()) onAdd({ name, service, who }); }}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="own-name">Campaign name</Label>
            <Input id="own-name" autoFocus placeholder="e.g. Office park grounds" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="own-service">Service</Label>
            <select id="own-service" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={service} onChange={(e) => setService(e.target.value)}>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="own-who">Type of business to reach</Label>
            <Input id="own-who" placeholder="e.g. office parks" value={who} onChange={(e) => setWho(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!name.trim() || !who.trim()}>Add idea</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
