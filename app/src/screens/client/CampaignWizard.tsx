// Campaign Wizard (docs/CAMPAIGN_WIZARD_BUILD_PLAN.md), designed after Airbnb's host setup and
// Apple's onboarding guidance: full screen, one question per page, big type, nothing else on
// screen, and a fixed bar at the bottom with progress, Back and Next.
//
//   Step 1  Your business      website (read by AI), or a short description
//   Step 2  Check the details  about · services · customers · area · goal (one page each)
//   Step 3  Pick campaigns     1-5 AI ideas; each pick becomes a free draft
//
// Answers autosave to wizard_sessions. The last page of step 2 saves the client's profile
// (confirm_wizard_profile). AI calls go through the wizard-ai edge function.

import { Children, useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CalendarDays, Check, ChevronDown, FileText, Globe, Loader2, MessageCircle, Phone, Plus, RefreshCw, Sparkles, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LocationAreaInput } from '../../components/LocationAreaInput';
import { Button } from '../../components/ui/button';
import { BrandMark } from '../../components/BrandLockup';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { AITextLoading } from '../../components/ui/ai-text-loading';
import { queryClient } from '../../lib/queryClient';
import { cn } from '../../lib/utils';
import {
  COMPANY_SIZES, GOALS, MONTH_LABELS, addService, carryDescription, ideasFingerprint, mergeAnalysis,
  missingFields, missingMessage, normalizeWebsite, profileComplete, seasonLabel, toggleMonth,
  type WizardAnswers, type WizardEntry, type WizardGoal, type WizardService,
} from '../../lib/wizardSession';
import {
  STEP_NAMES, STEP_OF, confirmPage, firstPageOf, nextPage, pageHasGuesses, pageReady, prevPage, stepProgress,
  type WizardPage,
} from '../../lib/wizardPages';
import {
  confirmProfile, fetchOpenSession, fetchSavedProfile, saveSession, startSession, useAutosave, type WizardSessionRow,
} from '../../hooks/useWizardSession';
import {
  callWizardAi, costForIdeas, estimateProspects, wizardErrorMessage,
  type AnalyzeResult, type DraftsResult, type IdeasResult, type WizardIdea,
} from '../../hooks/useWizardAi';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const field = 'h-14 rounded-xl border-border bg-background px-4 text-[16px] shadow-none focus-visible:ring-2 focus-visible:ring-offset-0';
const quiet = 'h-auto p-0 text-[14px] font-semibold text-foreground underline underline-offset-4 hover:bg-transparent';
const GOAL_ICON: Record<WizardGoal, typeof FileText> = { quotes: FileText, meetings: CalendarDays, calls: Phone, replies: MessageCircle };
const FIT_LABEL: Record<WizardIdea['fit'], string> = {
  strong: 'Strong fit', seasonal: 'Seasonal', new_segment: 'New kind of customer', expansion: 'More of your services', own: 'Your idea',
};

// ── Frame: top bar, one centred question, bottom bar ───────────────────────────────────────
function Frame({ step, progress, onExit, onManual, children, footer, wide }: {
  step: number | null; progress: [number, number, number]; onExit: () => void; onManual?: () => void;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div style={FONT} className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] md:px-10">
        <span className="flex items-center gap-2 text-[14px] font-semibold">
          <BrandMark size={22} />
          New campaign
        </span>
        <span className="flex items-center gap-1.5">
          {onManual && <Button variant="ghost" className="h-9 rounded-full px-4 text-[13px] font-semibold" onClick={onManual}>Create manually</Button>}
          <Button variant="outline" className="h-9 rounded-full px-4 text-[13px] font-semibold" onClick={onExit}>Save &amp; exit</Button>
        </span>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className={cn('mx-auto w-full px-6 pb-16 pt-6 md:pt-14', wide ? 'max-w-[880px]' : 'max-w-[600px]')}>
          {step && <p className="m-0 mb-3 text-[13px] font-semibold text-muted-foreground">Step {step} of 3 · {STEP_NAMES[step as 1 | 2 | 3]}</p>}
          {children}
        </div>
      </main>
      {footer !== undefined && (
        <footer className="shrink-0 bg-background pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-3 gap-1.5" aria-hidden>
            {progress.map((v, i) => (
              <div key={i} className="h-1 overflow-hidden bg-border">
                <div className="h-full bg-foreground transition-[width] duration-500 ease-out" style={{ width: `${v * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex min-h-20 items-center justify-between gap-3 py-3 pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] md:px-10">
            {footer}
          </div>
        </footer>
      )}
    </div>
  );
}

function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-8 md:mb-10">
      <h1 className="m-0 text-[28px] font-semibold leading-[1.15] tracking-tight text-balance md:text-[34px]">{children}</h1>
      {sub && <p className="m-0 mt-3 text-[16px] leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  );
}

function NextButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  return <Button className="h-12 rounded-xl px-6 text-[15px] font-semibold" {...props}>{children}</Button>;
}

/** One quiet line instead of a tag on every field. */
function FromWebsite({ source }: { source: 'website' | 'description' }) {
  return (
    <p className="m-0 mb-6 flex items-center gap-2 rounded-xl bg-primary/5 px-4 py-3 text-[14px] text-foreground">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      {source === 'website' ? 'We filled this in from your website. Check it, then continue.' : 'We filled this in from your description. Check it, then continue.'}
    </p>
  );
}

const BRAND = '#7412ef';

/** While the AI works: a thinking orb and shimmering text saying what is happening. */
function Working({ title, lines, orb = 'working' }: { title: string; lines: string[]; orb?: OrbState }) {
  return (
    <div className="flex flex-col items-center py-14 text-center" aria-live="polite">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }}
        className="mb-6 flex items-center justify-center">
        {/* The orb's largest tuned size is 64px; it is shown at 104px, like the old circle around it. */}
        <ThinkingOrb state={orb} size={64} color={BRAND} dotSize={1.35} className="!h-[104px] !w-[104px]" aria-hidden />
      </motion.div>
      <h1 className="m-0 text-[26px] font-semibold tracking-tight md:text-[30px]">{title}</h1>
      <AITextLoading texts={lines} interval={2600} stopAtEnd className="mt-4 text-[16px] font-medium" />
    </div>
  );
}

/** Content arriving after the AI: children fade up one after another (still for reduced motion). */
function Rise({ children, className, itemClassName, gap = 0.06, ...aria }: { children: React.ReactNode; className?: string; itemClassName?: string; gap?: number; role?: string; 'aria-label'?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className} {...aria}>{Children.toArray(children).map((child, i) => <div key={i} className={itemClassName}>{child}</div>)}</div>;
  return (
    <motion.div className={className} {...aria} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: gap } } }}>
      {Children.toArray(children).map((child, i) => (
        <motion.div key={i} className={itemClassName} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

/** A list of short answers as removable pills, with one input to add more. */
function Pills({ id, values, onChange, placeholder, label }: {
  id: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; label: string;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    const next = [...values];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next); setText('');
  };
  return (
    <div className="flex flex-col gap-3">
      {values.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {values.map((v) => (
            <li key={v} className="flex items-center gap-1.5 rounded-full border border-border py-2 pl-4 pr-2 text-[15px]">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Label htmlFor={id} className="sr-only">{label}</Label>
        <Input id={id} className={field} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() && add()} />
        <Button type="submit" variant="outline" className="h-14 w-14 shrink-0 rounded-xl" disabled={!text.trim()} aria-label={`Add ${label.toLowerCase()}`}>
          <Plus className="h-5 w-5" aria-hidden />
        </Button>
      </form>
    </div>
  );
}

type Phase = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

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
  const [page, setPage] = useState<WizardPage>('website');
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<null | 'website' | 'describe'>(null);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [source, setSource] = useState<'website' | 'description'>('website');
  const [thin, setThin] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const autosave = useAutosave(session?.id ?? null, client);
  const campaignsPath = `${basePath}/campaigns`;

  const begin = useCallback(async (from: WizardEntry) => {
    setPhase({ kind: 'loading' });
    try {
      const saved = await fetchSavedProfile(clientId, client);
      // Returning users and "Find new campaigns" skip the website when the profile is complete.
      const first = from === 'find_new' || profileComplete(saved) ? 2 : 1;
      const s = await startSession(clientId, from, saved, first, client);
      setSession(s); setAnswers(s.answers); setPage(firstPageOf(s.screen));
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
          setPhase({ kind: 'error', message: "The campaign wizard isn't switched on for your account yet. Contact us if you'd like to try it." });
          return;
        }
        // "Continue" on the Campaigns page opens the unfinished setup (?resume=1). Anything else
        // starts fresh, prefilled from the saved business profile; there is no "welcome back" step.
        if (open && params.get('resume') === '1') {
          setSession(open); setAnswers(open.answers ?? {}); setPage(firstPageOf(open.screen)); setPhase({ kind: 'ready' });
        } else void begin(entry);
      })
      .catch((e) => !cancelled && setPhase({ kind: 'error', message: (e as Error).message }));
    return () => { cancelled = true; };
    // Runs once per visit; `entry` only matters for a brand-new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function update(next: WizardAnswers) {
    setErr(null);
    setAnswers(next);
    autosave.queue({ answers: next });
  }

  async function go(to: WizardPage, from: WizardAnswers = answers) {
    setErr(null);
    // The description from step 1 becomes "What you do" unless the user already wrote one.
    const a = to === 'about' ? carryDescription(from) : from;
    setAnswers(a);
    setPage(to);
    autosave.queue({ screen: STEP_OF[to], answers: a });
    await autosave.flush();
    document.querySelector('main')?.scrollTo({ top: 0 });
  }

  async function exit() {
    await autosave.flush();
    navigate(campaignsPath);
  }

  async function manual() {
    await autosave.flush();
    navigate(`${campaignsPath}?new=manual`);
  }

  /** Step 1: the AI reads the website or the description. */
  async function analyze() {
    const describe = answers.website?.mode === 'describe';
    setSiteError(null); setErr(null); setThin(false);
    let payload: Record<string, unknown>;
    if (describe) {
      payload = { name: answers.business?.name ?? '', description: answers.website?.description ?? '', area_text: answers.website?.area_text ?? '', best_customers: answers.website?.best_customers ?? '' };
    } else {
      const url = normalizeWebsite(answers.website?.url ?? '');
      if (!url) { setSiteError(wizardErrorMessage('bad_url')); return; }
      payload = { url };
    }
    setWorking(describe ? 'describe' : 'website');
    const r = await callWizardAi<AnalyzeResult>('analyze', payload, client);
    setWorking(null);
    if (!r.ok) {
      if (describe) {
        setErr(`${wizardErrorMessage(r.error)} We've kept what you typed.`);
        await go('about');
        return;
      }
      setSiteError(wizardErrorMessage(r.error));
      return;
    }
    const best = (answers.website?.best_customers ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const withBest = best.length ? { ...answers, audience: { ...answers.audience, business_types: [...(answers.audience?.business_types ?? []), ...best] } } : answers;
    setSource(r.data.source);
    setThin(r.data.thin);
    await go('about', mergeAnalysis(withBest, r.data.profile, r.data.source));
  }

  /** Next on a step-2 page: confirm what is shown; the last page saves the profile. */
  async function next() {
    const confirmed = confirmPage(page, answers);
    if (page === 'goal') {
      const missing = missingFields(confirmed);
      if (missing.length) { setErr(missingMessage(missing)); return; }
      if (!session) return;
      setBusy(true); setErr(null);
      setAnswers(confirmed);
      autosave.queue({ answers: confirmed });
      await autosave.flush();
      const r = await confirmProfile(session.id, client);
      setBusy(false);
      if (!r.ok) {
        setErr(r.error === 'missing_fields' && 'missing' in r ? missingMessage(r.missing) : `Couldn't save your details: ${r.error}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['client-icp', clientId] });
      await go('ideas', confirmed);
      return;
    }
    const to = nextPage(page);
    if (to) await go(to, confirmed);
  }

  // ── Before the wizard is ready ────────────────────────────────────────────────────────────
  if (phase.kind === 'loading') {
    return <Frame step={null} progress={[0, 0, 0]} onExit={() => navigate(campaignsPath)}><Working title="Getting things ready" lines={['Loading your details…']} orb="breathing" /></Frame>;
  }
  if (phase.kind === 'error') {
    return (
      <Frame step={null} progress={[0, 0, 0]} onExit={() => navigate(campaignsPath)}>
        <Title sub={phase.message}>We couldn't open the campaign wizard</Title>
        <NextButton onClick={() => navigate(campaignsPath)}>Back to campaigns</NextButton>
      </Frame>
    );
  }
  // ── Step 3 has its own footer ─────────────────────────────────────────────────────────────
  if (page === 'ideas' && session) {
    return (
      <IdeasStep clientId={clientId} client={client} session={session} answers={answers}
        onAnswers={(a) => { setAnswers(a); autosave.queue({ answers: a }); }}
        onBack={() => void go('goal')} onExit={() => void exit()} onManual={() => void manual()}
        onCreated={(ids) => navigate(`${campaignsPath}?drafts=${ids.join(',')}`)} />
    );
  }

  const describe = answers.website?.mode === 'describe';
  const websiteReady = describe ? !!answers.business?.name?.trim() && !!answers.website?.description?.trim() : !!normalizeWebsite(answers.website?.url ?? '');
  const ready = page === 'website' ? websiteReady : pageReady(page, answers);
  const back = prevPage(page);

  const footer = working ? null : (
    <>
      {back ? <Button variant="ghost" className={quiet} onClick={() => void go(back)}>Back</Button> : <span />}
      <NextButton disabled={!ready || busy} onClick={() => void (page === 'website' ? analyze() : next())}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : page === 'website' ? (describe ? 'Continue' : 'Read my website') : page === 'goal' ? 'Find campaigns' : 'Next'}
      </NextButton>
    </>
  );

  return (
    <Frame step={STEP_OF[page]} progress={stepProgress(page)} onExit={() => void exit()} onManual={() => void manual()} footer={footer}>
      {working ? (
        <Working title={working === 'website' ? 'Reading your website' : 'Reading your description'} orb="searching"
          lines={working === 'website'
            ? ['Opening your website…', 'Reading what you do…', 'Finding your services…', 'Working out who you sell to…', 'Almost there…']
            : ['Reading your description…', 'Listing your services…', 'Working out who you sell to…', 'Almost there…']} />
      ) : (
        <motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
          {page !== 'website' && pageHasGuesses(page, answers) && <FromWebsite source={source} />}
          {page === 'about' && thin && (
            <p className="m-0 mb-6 rounded-xl bg-muted px-4 py-3 text-[14px]">Your website didn't say much, so please fill in the gaps.</p>
          )}
          {page === 'website' && <WebsitePage answers={answers} update={update} siteError={siteError} onAnalyze={() => void analyze()} />}
          {page === 'about' && <AboutPage answers={answers} update={update} />}
          {page === 'services' && <ServicesPage answers={answers} update={update} />}
          {page === 'customers' && <CustomersPage answers={answers} update={update} />}
          {page === 'area' && <AreaPage answers={answers} update={update} />}
          {page === 'goal' && <GoalPage answers={answers} update={update} />}
          {err && <p role="alert" className="m-0 mt-6 rounded-xl bg-destructive/10 px-4 py-3 text-[14px] text-foreground">{err}</p>}
        </motion.div>
      )}
    </Frame>
  );
}

// ── Step 1 ──────────────────────────────────────────────────────────────────────────────────
function WebsitePage({ answers, update, siteError, onAnalyze }: {
  answers: WizardAnswers; update: (a: WizardAnswers) => void; siteError: string | null; onAnalyze: () => void;
}) {
  const mode = answers.website?.mode ?? 'website';
  const url = answers.website?.url ?? '';
  const setWebsite = (patch: Partial<NonNullable<WizardAnswers['website']>>) =>
    update({ ...answers, website: { mode, ...answers.website, ...patch } });

  if (mode === 'describe') {
    return (
      <>
        <Title sub="A few words is enough. We'll suggest campaigns from this.">Tell us about your business</Title>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="wiz-name" className="text-[15px] font-semibold">Company name</Label>
            <Input id="wiz-name" className={field} value={answers.business?.name ?? ''} onChange={(e) => update({ ...answers, business: { ...answers.business, name: e.target.value } })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wiz-desc" className="text-[15px] font-semibold">What do you do?</Label>
            <Textarea id="wiz-desc" rows={3} className="rounded-xl border-border px-4 py-3 text-[16px] shadow-none"
              placeholder="e.g. Lawn mowing, landscaping and snow removal for businesses around Bozeman."
              value={answers.website?.description ?? ''} onChange={(e) => setWebsite({ description: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wiz-where" className="text-[15px] font-semibold">Where do you work?</Label>
            <Input id="wiz-where" className={field} placeholder="e.g. Bozeman, Montana" value={answers.website?.area_text ?? ''} onChange={(e) => setWebsite({ area_text: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wiz-best" className="text-[15px] font-semibold">Who are your best customers? <span className="font-normal text-muted-foreground">Optional</span></Label>
            <Input id="wiz-best" className={field} placeholder="e.g. property managers, HOAs" value={answers.website?.best_customers ?? ''} onChange={(e) => setWebsite({ best_customers: e.target.value })} />
          </div>
          <Button variant="ghost" className={cn(quiet, 'self-start')} onClick={() => setWebsite({ mode: 'website' })}>I have a website</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Title sub="We'll read it and fill in the details for you. It takes about 20 seconds.">What's your website?</Title>
      <form onSubmit={(e) => { e.preventDefault(); onAnalyze(); }}>
        <Label htmlFor="wiz-url" className="sr-only">Company website</Label>
        <div className="relative">
          <Globe className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="wiz-url" className={cn(field, 'h-16 pl-12 text-[18px]')} placeholder="yourcompany.com" value={url} inputMode="url" autoComplete="url"
            autoFocus onChange={(e) => setWebsite({ url: e.target.value })} aria-invalid={!!siteError} />
        </div>
      </form>
      {url.trim() && !normalizeWebsite(url) && (
        <p className="m-0 mt-3 text-[14px] text-destructive">That doesn't look like a website address. Try something like yourcompany.com.</p>
      )}
      {siteError && (
        <div role="alert" className="mt-6 flex flex-col gap-3 rounded-2xl bg-muted px-5 py-4">
          <p className="m-0 text-[15px] font-semibold">{siteError}</p>
          <span className="flex flex-wrap gap-2">
            <Button className="h-10 rounded-xl px-4 font-semibold" onClick={() => setWebsite({ mode: 'describe' })}>Describe my business</Button>
            <Button variant="outline" className="h-10 rounded-xl px-4 font-semibold" onClick={onAnalyze}>Try again</Button>
          </span>
        </div>
      )}
      <p className="m-0 mt-8 text-[15px] text-muted-foreground">
        No website?{' '}
        <Button variant="ghost" className={quiet} onClick={() => setWebsite({ mode: 'describe' })}>Describe your business instead</Button>
      </p>
    </>
  );
}

// ── Step 2 pages ────────────────────────────────────────────────────────────────────────────
type PageProps = { answers: WizardAnswers; update: (a: WizardAnswers) => void };

function AboutPage({ answers, update }: PageProps) {
  const set = (k: 'name' | 'industry' | 'description', v: string) => update({ ...answers, business: { ...answers.business, [k]: v } });
  return (
    <>
      <Title sub="Change anything that isn't quite right.">Is this your business?</Title>
      <Rise className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="wiz-bname" className="text-[15px] font-semibold">Company name</Label>
          <Input id="wiz-bname" className={field} value={answers.business?.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wiz-industry" className="text-[15px] font-semibold">Industry</Label>
          <Input id="wiz-industry" className={field} placeholder="e.g. Landscaping" value={answers.business?.industry ?? ''} onChange={(e) => set('industry', e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wiz-bdesc" className="text-[15px] font-semibold">What you do, in a sentence</Label>
          <Textarea id="wiz-bdesc" rows={2} className="rounded-xl border-border px-4 py-3 text-[16px] shadow-none" value={answers.business?.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </div>
      </Rise>
    </>
  );
}

function ServicesPage({ answers, update }: PageProps) {
  const services = answers.services ?? [];
  const [text, setText] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const setServices = (list: WizardService[]) => update({ ...answers, services: list });
  return (
    <>
      <Title sub="Only what you sell to businesses. You can add or remove any.">What do you sell?</Title>
      <ul className="m-0 flex list-none flex-col p-0">
        {services.map((s, i) => (
          <li key={`${s.name}-${i}`} className="border-b border-border py-4 first:pt-0">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[17px] font-medium">{s.name}</span>
              <span className="flex items-center gap-1">
                <Button variant="ghost" className="h-9 rounded-full px-3 text-[13px] text-muted-foreground" aria-expanded={open === i}
                  onClick={() => setOpen(open === i ? null : i)}>
                  {seasonLabel(s.seasonal_months)} <ChevronDown className={cn('ml-1 h-3.5 w-3.5 transition-transform', open === i && 'rotate-180')} aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground" aria-label={`Remove ${s.name}`}
                  onClick={() => setServices(services.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </span>
            </div>
            {open === i && (
              <div className="mt-3">
                <p className="m-0 mb-2 text-[13px] text-muted-foreground">Only sold in some months? Pick them. Leave empty for all year.</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Months for ${s.name}`}>
                  {MONTH_LABELS.map((m, mi) => {
                    const on = (s.seasonal_months ?? []).includes(mi + 1);
                    return (
                      <button key={m} type="button" aria-pressed={on}
                        className={cn('h-9 min-w-12 cursor-pointer rounded-full border px-3 text-[13px] font-medium transition-colors',
                          on ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground hover:border-foreground')}
                        onClick={() => setServices(services.map((x, j) => (j === i ? { ...x, seasonal_months: toggleMonth(x.seasonal_months, mi + 1) } : x)))}>
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); setServices(addService(services, text)); setText(''); }}>
        <Label htmlFor="wiz-newsvc" className="sr-only">Add a service</Label>
        <Input id="wiz-newsvc" className={field} placeholder="Add a service, e.g. Snow removal" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="outline" className="h-14 w-14 shrink-0 rounded-xl" disabled={!text.trim()} aria-label="Add service">
          <Plus className="h-5 w-5" aria-hidden />
        </Button>
      </form>
    </>
  );
}

function CustomersPage({ answers, update }: PageProps) {
  const a = answers.audience ?? {};
  const [more, setMore] = useState(!!(a.roles?.length || a.exclusions?.length || a.company_size));
  const set = (patch: Partial<NonNullable<WizardAnswers['audience']>>) => update({ ...answers, audience: { ...answers.audience, ...patch } });
  return (
    <>
      <Title sub="Types of business, not people. We only run business-to-business campaigns.">Who buys from you?</Title>
      <Pills id="wiz-types" label="Type of business" placeholder="Add a type of business, e.g. office parks" values={a.business_types ?? []} onChange={(v) => set({ business_types: v })} />
      <div className="mt-10 border-t border-border pt-6">
        <button type="button" className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent p-0 text-left" aria-expanded={more} onClick={() => setMore(!more)}>
          <span>
            <span className="block text-[16px] font-semibold">More detail</span>
            <span className="block text-[14px] text-muted-foreground">Optional: who decides, company size, who to avoid</span>
          </span>
          <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', more && 'rotate-180')} aria-hidden />
        </button>
        {more && (
          <div className="mt-6 flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[15px] font-semibold">Who decides</p>
              <Pills id="wiz-roles" label="Role" placeholder="e.g. facilities manager" values={a.roles ?? []} onChange={(v) => set({ roles: v })} />
            </div>
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[15px] font-semibold">Company size</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Company size">
                {COMPANY_SIZES.map((s, i) => {
                  const on = (a.company_size || COMPANY_SIZES[0]) === s;
                  return (
                    <button key={s} type="button" role="radio" aria-checked={on}
                      className={cn('h-11 cursor-pointer rounded-full border px-4 text-[14px] font-medium transition-colors',
                        on ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:border-foreground')}
                      onClick={() => set({ company_size: i === 0 ? '' : s })}>{s}</button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[15px] font-semibold">Don't contact</p>
              <Pills id="wiz-excl" label="Exclusion" placeholder="e.g. residential homeowners" values={a.exclusions ?? []} onChange={(v) => set({ exclusions: v })} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AreaPage({ answers, update }: PageProps) {
  return (
    <>
      <Title sub="A city, a region, or a radius around where you're based.">Where do you work?</Title>
      <div className="[&_input]:h-14 [&_input]:rounded-xl [&_input]:text-[16px]">
        <LocationAreaInput label="Where you work" sentenceLabel values={answers.area?.areas ?? []}
          onChange={(v) => update({ ...answers, area: { areas: v } })} maxItems={3} capLabel="area" />
      </div>
    </>
  );
}

function GoalPage({ answers, update }: PageProps) {
  const goal = answers.goal?.goal;
  return (
    <>
      <Title sub="We'll write your emails to ask for this.">What should a new customer do?</Title>
      <Rise className="grid grid-cols-1 gap-3 sm:grid-cols-2" itemClassName="flex" gap={0.05} role="radiogroup" aria-label="Your goal">
        {GOALS.map((g) => {
          const on = goal === g.value;
          const Icon = GOAL_ICON[g.value];
          return (
            <button key={g.value} type="button" role="radio" aria-checked={on}
              onClick={() => update({ ...answers, goal: { ...answers.goal, goal: g.value } })}
              className={cn('flex w-full cursor-pointer flex-col items-start gap-3 rounded-2xl border bg-background p-5 text-left transition-[border-color,box-shadow]',
                on ? 'border-foreground shadow-[0_0_0_1px_var(--color-foreground)]' : 'border-border hover:border-foreground/40')}>
              <Icon className="h-6 w-6" aria-hidden />
              <span>
                <span className="block text-[16px] font-semibold">{g.label}</span>
                <span className="block text-[14px] text-muted-foreground">{g.hint}</span>
              </span>
            </button>
          );
        })}
      </Rise>
      <div className="mt-8 flex flex-col gap-2">
        <Label htmlFor="wiz-cta" className="text-[15px] font-semibold">In your own words <span className="font-normal text-muted-foreground">Optional</span></Label>
        <Input id="wiz-cta" className={field} placeholder="e.g. Reply for a free quote" value={answers.goal?.cta ?? ''}
          onChange={(e) => update({ ...answers, goal: { ...answers.goal, cta: e.target.value } })} />
      </div>
    </>
  );
}

// ── Step 3 ──────────────────────────────────────────────────────────────────────────────────
interface IdeasState { ideas: WizardIdea[]; duplicates: string[]; slotsLeft: number | null }

function IdeasStep({ clientId, client, session, answers, onAnswers, onBack, onExit, onManual, onCreated }: {
  clientId: string; client: SupabaseClient; session: WizardSessionRow; answers: WizardAnswers;
  onAnswers: (a: WizardAnswers) => void; onBack: () => void; onExit: () => void; onManual: () => void; onCreated: (campaignIds: string[]) => void;
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
  // The details changed since these ideas were made: offer to refresh them.
  const stale = !!answers.ideas_fp && answers.ideas_fp !== fp && state.ideas.some((i) => i.fit !== 'own');

  // One launch line per idea, in order (free launches left this month are used first).
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
    onCreated(r.data.created.map((c) => c.campaign_id));
  }

  const n = state.ideas.filter((i) => selected.has(i.id)).length;
  const toggle = (id: string) => setSelected((s) => { const nx = new Set(s); if (nx.has(id)) nx.delete(id); else nx.add(id); return nx; });

  const footer = loading || creating ? null : (
    <>
      <Button variant="ghost" className={quiet} onClick={onBack}>Back</Button>
      <span className="flex items-center gap-4">
        <span className="hidden text-[14px] text-muted-foreground sm:inline">{n === 0 ? 'Pick at least one' : `${n} selected · drafts are free`}</span>
        <NextButton disabled={n === 0} onClick={() => void create()}>{n <= 1 ? 'Create draft' : `Create ${n} drafts`}</NextButton>
      </span>
    </>
  );

  return (
    <Frame step={3} progress={[1, 1, 1]} onExit={onExit} onManual={onManual} footer={footer} wide>
      {creating ? (
        <Working title="Writing your emails" orb="composing" lines={['Writing the first email…', 'Writing three follow-ups…', 'Keeping your offer and tone…', 'Saving your drafts…']} />
      ) : loading ? (
        <Working title="Finding campaigns that fit" orb="connecting" lines={['Matching your services to buyers…', 'Checking your existing campaigns…', 'Estimating how many businesses we can find…', 'Almost there…']} />
      ) : (
        <>
          <Title sub="Each one becomes a draft you can edit. Nothing is sent or charged until you launch.">Pick your campaigns</Title>

          {stale && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-5 py-4">
              <span className="text-[14px]">You changed your details since these were suggested.</span>
              <Button variant="outline" className="h-10 rounded-xl font-semibold" onClick={() => void generate()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />Refresh ideas</Button>
            </div>
          )}
          {(err || loadErr) && <p role="alert" className="m-0 mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-[14px]">{err ?? loadErr}</p>}

          {state.ideas.length === 0 && !err && !loadErr ? (
            <div className="rounded-2xl bg-muted px-6 py-8">
              <p className="m-0 text-[18px] font-semibold">
                {state.slotsLeft === 0 ? "You've reached your campaign limit" : "We couldn't find a strong match"}
              </p>
              <p className="m-0 mt-2 text-[15px] text-muted-foreground">
                {state.slotsLeft === 0 ? 'Archive a campaign or contact us to raise your limit.' : 'Your services or customers may be too narrow. Go back and add more, add your own idea, or create a campaign yourself.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" className="h-11 rounded-xl font-semibold" onClick={onBack}>Edit details</Button>
                {state.slotsLeft !== 0 && <Button variant="outline" className="h-11 rounded-xl font-semibold" onClick={() => setShowOwn(true)}>Add my own idea</Button>}
                <Button className="h-11 rounded-xl font-semibold" onClick={onManual}>Create manually</Button>
              </div>
            </div>
          ) : (
            <Rise className="grid gap-4 md:grid-cols-2" itemClassName="flex" gap={0.08}>
              {state.ideas.map((idea, i) => {
                const on = selected.has(idea.id);
                const line = cost?.items?.[i];
                return (
                  <div key={idea.id} role="checkbox" aria-checked={on} tabIndex={0}
                    onClick={() => toggle(idea.id)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(idea.id); } }}
                    className={cn('flex w-full cursor-pointer flex-col rounded-2xl border bg-background p-6 transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'border-foreground shadow-[0_0_0_1px_var(--color-foreground)]' : 'border-border hover:border-foreground/40')}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[13px] font-medium text-muted-foreground">{FIT_LABEL[idea.fit]}{idea.suggested_start && ` · starts ${new Date(`${idea.suggested_start}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</span>
                      <span aria-hidden className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        on ? 'border-foreground bg-foreground text-background' : 'border-border')}>
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                    </div>
                    <h2 className="m-0 mt-2 text-[19px] font-semibold leading-snug tracking-tight">{idea.name}</h2>
                    <p className="m-0 mt-1 text-[15px] text-muted-foreground">{idea.target}</p>
                    {idea.fit !== 'own' && idea.reason && <p className="m-0 mt-3 text-[14px] leading-relaxed">{idea.reason}</p>}
                    {/* Pushes the numbers to the bottom so cards side by side line up. */}
                    <div className="min-h-5 flex-1" aria-hidden />
                    <dl className="m-0 grid grid-cols-3 gap-3 border-t border-border pt-4">
                      <div>
                        <dt className="text-[12px] text-muted-foreground">Businesses</dt>
                        <dd className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums">{idea.est_lo ?? '…'}–{idea.est_hi ?? '…'}</dd>
                      </div>
                      <div>
                        <dt className="text-[12px] text-muted-foreground">Hot leads</dt>
                        <dd className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums">{line ? `${line.hot_lo}–${line.hot_hi}` : '…'}</dd>
                      </div>
                      <div>
                        <dt className="text-[12px] text-muted-foreground">Launch</dt>
                        <dd className="m-0 mt-0.5 text-[15px] font-semibold">{line ? (line.launch === 'free' ? 'Free' : '1 credit') : '…'}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </Rise>
          )}

          {state.ideas.length > 0 && (
            <p className="m-0 mt-4 text-[13px] text-muted-foreground">
              Estimates, not promises. Every campaign varies.
              {cost && ` You have ${cost.free_launches_left} of ${cost.free_launches_per_month} free launches left this month, then each launch is 1 credit.`}
              {state.duplicates.length > 0 && ` Skipped ${state.duplicates.map((d) => `“${d}”`).join(', ')}: you already run ${state.duplicates.length === 1 ? 'it' : 'them'}.`}
            </p>
          )}

          {showOwn ? (
            <OwnIdeaForm services={(answers.services ?? []).map((s) => s.name)} onCancel={() => setShowOwn(false)} onAdd={(x) => void addOwn(x)} />
          ) : state.ideas.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">
              <Button variant="outline" className="h-11 rounded-full px-5 font-semibold" onClick={() => setShowOwn(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden />Add my own idea</Button>
              <Button variant="ghost" className="h-11 rounded-full px-5 font-semibold" onClick={() => void generate()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />Suggest different ideas</Button>
            </div>
          )}
        </>
      )}
    </Frame>
  );
}

function OwnIdeaForm({ services, onAdd, onCancel }: { services: string[]; onAdd: (x: { name: string; service: string; who: string }) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [service, setService] = useState(services[0] ?? '');
  const [who, setWho] = useState('');
  return (
    <form className="mt-8 flex flex-col gap-5 rounded-2xl border border-border p-6" onSubmit={(e) => { e.preventDefault(); if (name.trim() && who.trim()) onAdd({ name, service, who }); }}>
      <p className="m-0 text-[18px] font-semibold">Your own campaign idea</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="own-name" className="text-[15px] font-semibold">Name it</Label>
        <Input id="own-name" autoFocus className={field} placeholder="e.g. Office park grounds" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="own-who" className="text-[15px] font-semibold">Who should it reach?</Label>
        <Input id="own-who" className={field} placeholder="A type of business, e.g. office parks" value={who} onChange={(e) => setWho(e.target.value)} />
      </div>
      {services.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[15px] font-semibold">Which service?</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which service">
            {services.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={service === s} onClick={() => setService(s)}
                className={cn('h-11 cursor-pointer rounded-full border px-4 text-[14px] font-medium', service === s ? 'border-foreground bg-foreground text-background' : 'border-border bg-background')}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="h-11 rounded-xl px-5 font-semibold" disabled={!name.trim() || !who.trim()}>Add idea</Button>
        <Button type="button" variant="ghost" className="h-11 rounded-xl px-5 font-semibold" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
