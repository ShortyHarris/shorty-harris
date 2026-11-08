// Campaign editor (docs/CAMPAIGN_WIZARD_BUILD_PLAN.md, M4): one page per campaign, four tabs.
//   Targeting - name, business types, areas, maximum results, start date
//   Emails    - the four-email template, editable, with 3 free AI rewrites per campaign
//   Cadence   - today's follow-up rule, read-only
//   Launch    - what still needs fixing, the estimate, Launch; lifecycle actions once launched
// Works for wizard and manual campaigns alike. Launch goes through the existing WF0a gate.

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ThinkingOrb } from 'thinking-orbs';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarClock, Check, CircleAlert, Loader2, Rocket, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { TagInput } from '../../components/TagInput';
import { LocationAreaInput } from '../../components/LocationAreaInput';
import { LimitMessages } from '../../components/LimitCounter';
import { useToast, ToastHost } from '../../components/Toast';
import { queryClient } from '../../lib/queryClient';
import { confirmDiscard } from '../../lib/confirmDiscard';
import { cn } from '../../lib/utils';
import { buildAreaColumns, campaignAreas, type TargetArea } from '../../lib/targetAreas';
import { validateCampaignLimits } from '../../lib/campaignLimits';
import { useCampaignLimits } from '../../hooks/useClientIcp';
import { enqueueCampaign } from '../../lib/scrapeEnqueue';
import {
  CADENCE, EMAIL_LABELS, LIFECYCLE_LABEL, emailProblems, emailsFrom, hasLaunched, isLaunchable, lifecycleActions,
  startLabel, type Email, type LifecycleAction,
} from '../../lib/campaignEditor';
import {
  callWizardAi, costForCampaigns, launchLine, wizardErrorMessage, type CostEstimate, type RewriteResult,
} from '../../hooks/useWizardAi';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const STATUS_LABEL: Record<string, string> = {
  pending_review: 'In review', draft: 'Draft', scheduled: 'Scheduled', active: 'Active', paused: 'Paused', completed: 'Completed', archived: 'Archived',
};
const LANGUAGES = ['English', 'Czech', 'French', 'Spanish', 'Portuguese', 'German', 'Italian', 'Dutch', 'Polish', 'Slovak'];

interface CampaignRow {
  id: string; client_id: string; name: string; description: string | null; status: string; language: string; country: string | null;
  search_queries: string[]; target_locations: string[]; target_areas: TargetArea[] | null; max_results: number;
  origin: string; sequence: Email[] | null; start_date: string | null; rewrites_used: number;
  est_prospects_lo: number | null; est_prospects_hi: number | null; icp: Record<string, unknown> | null; prospect_count: number;
}
interface Form {
  name: string; description: string; language: string; search_queries: string[]; areas: TargetArea[]; max_results: number;
  start_date: string; emails: Email[] | null;
}
interface Problem { code: string; tab: string; message: string; step?: number }

const COLS = 'id, client_id, name, description, status, language, country, search_queries, target_locations, target_areas, max_results, origin, sequence, start_date, rewrites_used, est_prospects_lo, est_prospects_hi, icp, prospect_count';

function formFrom(c: CampaignRow): Form {
  return {
    name: c.name, description: c.description ?? '', language: c.language || 'English',
    search_queries: c.search_queries ?? [], areas: campaignAreas({ target_areas: c.target_areas, target_locations: c.target_locations ?? [] }),
    max_results: c.max_results, start_date: c.start_date ?? '', emails: c.sequence ? emailsFrom(c.sequence) : null,
  };
}

interface Loaded { campaign: CampaignRow; rewriteLimit: number }
interface Checks { problems: Problem[]; cost: CostEstimate | null }

export function CampaignEditor({ clientId, client = supabase, basePath = '/app' }: { clientId: string; client?: SupabaseClient; basePath?: string }) {
  const { campaignId = '' } = useParams();
  const [params] = useSearchParams();
  // ?tab=emails opens the emails straight away (the "Review emails" link after the wizard).
  const [tab, setTab] = useState(() => (['targeting', 'emails', 'cadence', 'launch'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'targeting'));
  const editor = useQuery({
    queryKey: ['campaign-editor', campaignId],
    queryFn: async (): Promise<Loaded> => {
      const [{ data, error }, { data: settings }] = await Promise.all([
        client.from('campaigns').select(COLS).eq('id', campaignId).maybeSingle(),
        client.from('wizard_settings').select('free_rewrites_per_campaign').eq('id', 1).maybeSingle(),
      ]);
      if (error || !data) throw new Error(error?.message ?? 'Campaign not found.');
      return { campaign: data as CampaignRow, rewriteLimit: settings?.free_rewrites_per_campaign ?? 3 };
    },
    refetchOnWindowFocus: false,
  });
  const checks = useQuery({
    queryKey: ['campaign-checks', campaignId, editor.dataUpdatedAt],
    queryFn: async (): Promise<Checks> => {
      const [{ data: check }, cost] = await Promise.all([
        client.rpc('campaign_launch_problems', { p_campaign_id: campaignId }),
        costForCampaigns([campaignId], client),
      ]);
      return { problems: (check?.problems ?? []) as Problem[], cost };
    },
    enabled: !!editor.data,
  });

  if (editor.error) {
    return (
      <div style={FONT} className="content flex flex-col items-start gap-3">
        <p className="m-0 text-[13px]">Couldn't open this campaign: {(editor.error as Error).message}</p>
        <Button asChild variant="outline"><Link to={`${basePath}/campaigns`}>Back to campaigns</Link></Button>
      </div>
    );
  }
  if (!editor.data) return <div style={FONT} className="content text-[13px] text-(--ad-ink-soft)">Loading campaign…</div>;
  // A fresh load (after a save, launch or lifecycle action) starts the form again from the saved campaign.
  return (
    <EditorBody key={editor.dataUpdatedAt} clientId={clientId} client={client} basePath={basePath}
      campaign={editor.data.campaign} rewriteLimit={editor.data.rewriteLimit}
      problems={checks.data?.problems ?? []} cost={checks.data?.cost ?? null}
      tab={tab} setTab={setTab} reload={async () => { await editor.refetch(); }} />
  );
}

function EditorBody({ clientId, client, basePath, campaign, rewriteLimit, problems: checkedProblems, cost, tab, setTab, reload }: {
  clientId: string; client: SupabaseClient; basePath: string; campaign: CampaignRow; rewriteLimit: number;
  problems: Problem[]; cost: CostEstimate | null; tab: string; setTab: (t: string) => void; reload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const { toasts, toast, dismiss } = useToast();
  const limits = useCampaignLimits(clientId, client);
  const [saved] = useState<Form>(() => formFrom(campaign));
  const [form, setForm] = useState<Form>(saved);
  const [rewritesUsed, setRewritesUsed] = useState(campaign.rewrites_used);
  const [launchProblems, setLaunchProblems] = useState<Problem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [rewriting, setRewriting] = useState<number | 'all' | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const problems = launchProblems ?? checkedProblems;

  const campaignsPath = `${basePath}/campaigns`;
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const limitCheck = validateCampaignLimits({ searchQueries: form.search_queries, locationCount: form.areas.length, maxResults: form.max_results }, limits);
  const localEmailProblems = form.emails ? emailProblems(form.emails) : [];
  const rewritesLeft = Math.max(rewriteLimit - rewritesUsed, 0);
  const launched = hasLaunched(campaign.status);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setEmail = (i: number, patch: Partial<Email>) =>
    setForm((f) => (f.emails ? { ...f, emails: f.emails.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : f));

  function leave() {
    if (dirty && !confirmDiscard(true)) return;
    navigate(campaignsPath);
  }

  async function save(): Promise<boolean> {
    if (!form.name.trim()) { toast('Give the campaign a name.', 'error'); setTab('targeting'); return false; }
    if (!limitCheck.valid) { toast(limitCheck.errors.map((e) => e.message).join(' '), 'error'); setTab('targeting'); return false; }
    setSaving(true);
    const { error } = await client.from('campaigns').update({
      name: form.name.trim(),
      description: form.description.trim() || null,
      language: form.language,
      search_queries: form.search_queries,
      ...buildAreaColumns(form.areas),
      max_results: form.max_results,
      start_date: form.start_date || null,
      sequence: form.emails,
      updated_at: new Date().toISOString(),
    }).eq('id', campaign.id);
    setSaving(false);
    if (error) { toast(`Couldn't save: ${error.message}`, 'error'); return false; }
    toast(launched ? 'Saved. The changes apply to emails not written yet.' : 'Saved.');
    queryClient.invalidateQueries({ queryKey: ['my-campaigns', clientId] });
    await reload();
    return true;
  }

  async function rewrite(step: number | null) {
    if (!form.emails) return;
    setRewriting(step === null ? 'all' : step);
    const r = await callWizardAi<RewriteResult>('rewrite', { campaign_id: campaign.id, step, emails: form.emails }, client);
    setRewriting(null);
    if (!r.ok) { toast(wizardErrorMessage(r.error), 'error'); return; }
    const next = [...form.emails];
    if (step === null) r.data.emails.forEach((e, i) => { next[i] = e; });
    else next[step] = r.data.emails[0];
    set({ emails: next });
    setRewritesUsed(rewriteLimit - r.data.left);
    toast(`Rewritten. ${r.data.left} free rewrite${r.data.left === 1 ? '' : 's'} left. Save to keep it.`);
  }

  async function launch() {
    if (dirty && !(await save())) return;
    setLaunching(true); setLaunchResult(null);
    const { data: prep, error } = await client.rpc('prepare_campaign_launch', { p_campaign_id: campaign.id });
    if (error || !prep?.ok) { setLaunching(false); setLaunchResult({ tone: 'error', text: `Couldn't launch: ${error?.message ?? prep?.error}` }); return; }
    if (prep.result === 'problems') { setLaunching(false); setLaunchProblems(prep.problems); return; }
    if (prep.result === 'scheduled') {
      setLaunching(false);
      setLaunchResult({ tone: 'ok', text: `Scheduled. We'll start finding businesses on ${new Date(`${prep.start_date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Nothing is charged until then.` });
      await reload();
      return;
    }
    const r = await enqueueCampaign(campaign.id);
    setLaunching(false);
    if (r.kind === 'queued' || r.kind === 'already_queued') {
      setLaunchResult({ tone: 'ok', text: 'Launched. We are finding businesses now. Their first emails will appear in Approvals for you to check before anything is sent.' });
    } else if (r.kind === 'launch_limit_reached' || r.kind === 'limit_reached') {
      setLaunchResult({ tone: 'warn', text: r.message });
    } else {
      setLaunchResult({ tone: 'error', text: `Couldn't launch: ${r.message}` });
    }
    queryClient.invalidateQueries({ queryKey: ['my-campaigns', clientId] });
    await reload();
  }

  async function lifecycle(action: LifecycleAction | 'clone') {
    if (action === 'clone') {
      const { data } = await client.rpc('clone_campaign', { p_campaign_id: campaign.id });
      if (!data?.ok) { toast(data?.error === 'campaign_limit' ? "You've reached your campaign limit." : "Couldn't copy the campaign.", 'error'); return; }
      toast('Copied as a new draft.');
      queryClient.invalidateQueries({ queryKey: ['my-campaigns', clientId] });
      navigate(`${campaignsPath}/${data.campaign_id}/edit`);
      return;
    }
    const { data } = await client.rpc('set_campaign_lifecycle', { p_campaign_id: campaign.id, p_action: action });
    if (!data?.ok) { toast(`Couldn't ${LIFECYCLE_LABEL[action].toLowerCase()} this campaign.`, 'error'); return; }
    toast(`${LIFECYCLE_LABEL[action]}: done.`);
    queryClient.invalidateQueries({ queryKey: ['my-campaigns', clientId] });
    await reload();
  }

  const line = cost?.items?.[0];
  const allProblems: Problem[] = [
    ...problems.filter((p) => !(form.emails && p.code === 'blank_email')),
    ...localEmailProblems.map((p) => ({ code: 'email', tab: 'emails', message: p.message, step: p.step })),
  ];
  const starts = startLabel(form.start_date || null);

  return (
    <div style={FONT} className="content flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <button onClick={leave} className="cursor-pointer self-start border-0 bg-transparent p-0 text-[12px] font-semibold text-(--ad-green)">← Campaigns</button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-[22px] font-extrabold tracking-tight text-(--ad-ink)">{campaign.name}</h1>
          <Badge variant="secondary">{STATUS_LABEL[campaign.status] ?? campaign.status}</Badge>
          {campaign.origin !== 'manual' && <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" aria-hidden />Campaign wizard</Badge>}
          {campaign.status === 'scheduled' && starts && <Badge variant="outline" className="gap-1"><CalendarClock className="h-3 w-3" aria-hidden />{starts}</Badge>}
        </div>
        <p className="m-0 text-[13px] text-(--ad-ink-soft)">
          {launched ? 'This campaign is running. Changes apply to emails not written yet; emails already sent never change.' : 'Check the targeting and emails, then launch. Nothing is sent or charged until you launch.'}
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-(--ad-surface-2)">
          <TabsTrigger value="targeting">Targeting</TabsTrigger>
          <TabsTrigger value="emails">Emails{localEmailProblems.length > 0 && <CircleAlert className="ml-1.5 h-3.5 w-3.5 text-(--ad-clay)" aria-label="needs attention" />}</TabsTrigger>
          <TabsTrigger value="cadence">Cadence</TabsTrigger>
          <TabsTrigger value="launch">{launched ? 'Status' : 'Launch'}</TabsTrigger>
        </TabsList>

        {/* ── Targeting ── */}
        <TabsContent value="targeting" className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-name">Campaign name</Label>
                <Input id="ed-name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-desc">Notes <span className="text-[11px] font-normal text-(--ad-ink-faint)">Optional</span></Label>
                <Input id="ed-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} />
              </div>
              {campaign.icp && typeof campaign.icp.target === 'string' && (
                <p className="m-0 text-[12.5px] text-(--ad-ink-soft)"><b className="font-semibold text-(--ad-ink)">Who it reaches:</b> {campaign.icp.target}</p>
              )}
              <TagInput sentenceLabel label="Types of business to search for" required placeholder="e.g. property management company"
                helper="What we search for on maps. Businesses, not job titles." values={form.search_queries} onChange={(v) => set({ search_queries: v })} splitOn="," maxItems={limits.maxSearchTerms} capLabel="search term" />
              <LocationAreaInput sentenceLabel label="Areas" required helper="A city, a region, or a radius around a point."
                values={form.areas} onChange={(v) => set({ areas: v })} maxItems={limits.maxLocations} capLabel="area" />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ed-max">Maximum businesses</Label>
                  <Input id="ed-max" type="number" min={1} max={limits.maxResults} value={form.max_results}
                    onChange={(e) => set({ max_results: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ed-lang">Email language</Label>
                  <select id="ed-lang" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.language} onChange={(e) => set({ language: e.target.value })}>
                    {[...new Set([form.language, ...LANGUAGES])].map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ed-start">Start date <span className="text-[11px] font-normal text-(--ad-ink-faint)">Optional</span></Label>
                  <Input id="ed-start" type="date" value={form.start_date} disabled={launched} onChange={(e) => set({ start_date: e.target.value })} />
                </div>
              </div>
              <p className="m-0 text-[12px] text-(--ad-ink-faint)">With a future start date, launching schedules the campaign: nothing is found, sent or charged before that day.</p>
              <LimitMessages errors={limitCheck.errors} fields={['search_queries', 'target_locations', 'pairs', 'max_results']} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Emails ── */}
        <TabsContent value="emails" className="flex flex-col gap-4">
          {!form.emails ? (
            <Alert>
              <AlertTitle>This campaign has no email template</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span>We write each email from scratch for every business it finds. Add a template to set the message yourself; we still personalise it for each business.</span>
                <Button size="sm" className="self-start" onClick={() => set({ emails: emailsFrom(null) })}>Add an email template</Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn('text-[13px] font-semibold', rewritesLeft > 0 ? 'text-(--ad-green)' : 'text-(--ad-ink-soft)')}>
                  {rewritesLeft} of {rewriteLimit} free AI rewrites left
                </span>
                <Button variant="outline" size="sm" disabled={rewritesLeft === 0 || rewriting !== null} onClick={() => void rewrite(null)}>
                  {rewriting === 'all' ? <ThinkingOrb state="composing" size={20} color="#7412ef" className="mr-1.5" aria-hidden /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                  Rewrite all four (uses 1)
                </Button>
              </div>
              {rewritesLeft === 0 && <p className="m-0 text-[12px] text-(--ad-ink-soft)">You've used this campaign's free AI rewrites. Editing the emails yourself is always free.</p>}
              <p className="m-0 text-[12px] text-(--ad-ink-faint)">
                Placeholders: {'{{first_name}}'}, {'{{company_name}}'}, {'{{sender_name}}'}. We personalise each email for every business, and add your unsubscribe line and address.
              </p>
              {form.emails.map((e, i) => {
                const probs = localEmailProblems.filter((p) => p.step === i);
                return (
                  <Card key={i} className={cn(probs.length > 0 && 'border-(--ad-clay-line)')}>
                    <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
                      <div>
                        <CardTitle className="text-[14px] font-bold">{EMAIL_LABELS[i]}</CardTitle>
                        <CardDescription className="text-[12px]">{CADENCE[i].when}</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" disabled={rewritesLeft === 0 || rewriting !== null} onClick={() => void rewrite(i)}>
                        {rewriting === i ? <ThinkingOrb state="composing" size={20} color="#7412ef" className="mr-1.5" aria-hidden /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />}Rewrite
                      </Button>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`ed-subj-${i}`}>Subject</Label>
                        <Input id={`ed-subj-${i}`} value={e.subject} onChange={(ev) => setEmail(i, { subject: ev.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`ed-body-${i}`}>Body</Label>
                        <Textarea id={`ed-body-${i}`} rows={7} value={e.body} onChange={(ev) => setEmail(i, { body: ev.target.value })} />
                      </div>
                      {probs.map((p) => <p key={p.message} className="m-0 text-[12px] text-(--ad-clay)">{p.message}</p>)}
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </TabsContent>

        {/* ── Cadence ── */}
        <TabsContent value="cadence">
          <Card>
            <CardHeader><CardTitle className="text-[14px] font-bold">When each email goes out</CardTitle>
              <CardDescription>The same rule for every campaign. Weekends and public holidays are skipped.</CardDescription></CardHeader>
            <CardContent>
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {CADENCE.map((c, i) => (
                  <li key={c.label} className="flex items-start gap-3 rounded-lg border border-(--ad-line) px-3 py-2.5 text-[13px]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--ad-green-tint) text-[12px] font-bold text-(--ad-green)">{i + 1}</span>
                    <span><b className="font-semibold text-(--ad-ink)">{c.label}</b><br /><span className="text-(--ad-ink-soft)">{c.when}</span></span>
                  </li>
                ))}
              </ol>
              <p className="m-0 mt-3 text-[12px] text-(--ad-ink-soft)">Follow-ups stop as soon as a business replies, unsubscribes or the email bounces.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Launch / status ── */}
        <TabsContent value="launch" className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle className="text-[14px] font-bold">Estimate</CardTitle>
              <CardDescription>Estimates, not promises. The real number of businesses is known only after we search.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-[13px]">
              <span><b className="font-semibold">Est. prospects:</b> {line ? `${line.prospects_lo}–${line.prospects_hi} businesses` : '…'}</span>
              <span className="flex flex-wrap items-center gap-1.5"><b className="font-semibold">Est. hot leads:</b> {line ? `${line.hot_lo}–${line.hot_hi}` : '…'}
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase tracking-wider">Every campaign varies</Badge></span>
              {!launched && <span><b className="font-semibold">Launch:</b> {line ? launchLine(line, cost) : '…'}</span>}
              {cost && <span className="text-(--ad-ink-soft)">Your balance: {cost.balance} credit{cost.balance === 1 ? '' : 's'}. Each hot lead we send you uses 1 credit.</span>}
            </CardContent>
          </Card>

          {isLaunchable(campaign.status) && (
            <Card>
              <CardHeader><CardTitle className="text-[14px] font-bold">Before you launch</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                {allProblems.length === 0 ? (
                  <p className="m-0 flex items-center gap-2 text-[13px] text-(--ad-green)"><Check className="h-4 w-4" aria-hidden />Everything is ready.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {allProblems.map((p) => (
                      <li key={`${p.code}-${p.message}`} className="flex flex-wrap items-center gap-2 text-[13px] text-(--ad-ink)">
                        <CircleAlert className="h-4 w-4 text-(--ad-clay)" aria-hidden />{p.message}
                        {p.tab !== 'launch' && <Button variant="link" className="h-auto p-0 text-[12.5px]" onClick={() => setTab(p.tab === 'emails' ? 'emails' : 'targeting')}>Fix</Button>}
                        {p.code === 'no_mailbox' && <Button asChild variant="link" className="h-auto p-0 text-[12.5px]"><Link to={`${basePath}/settings`}>Connect Gmail</Link></Button>}
                      </li>
                    ))}
                  </ul>
                )}
                {launchResult && (
                  <Alert variant={launchResult.tone === 'error' ? 'destructive' : 'default'}><AlertDescription>
                    {launchResult.text}
                    {launchResult.tone === 'warn' && <> <Link className="font-semibold text-(--ad-green)" to={`${basePath}/billing`}>Add credits</Link></>}
                  </AlertDescription></Alert>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {campaign.status !== 'scheduled' && (
                    <Button disabled={launching || allProblems.length > 0 || saving} onClick={() => void launch()}>
                      {launching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="mr-1.5 h-4 w-4" aria-hidden />}
                      {starts ? 'Schedule campaign' : 'Launch campaign'}
                    </Button>
                  )}
                  {dirty && <span className="text-[12px] text-(--ad-ink-soft)">Your changes are saved first.</span>}
                </div>
              </CardContent>
            </Card>
          )}

          {launchResult && !isLaunchable(campaign.status) && (
            <Alert variant={launchResult.tone === 'error' ? 'destructive' : 'default'}><AlertDescription>{launchResult.text}</AlertDescription></Alert>
          )}

          <Card>
            <CardHeader><CardTitle className="text-[14px] font-bold">Campaign actions</CardTitle>
              <CardDescription>Pausing, resuming and restoring are free. A copy is a new campaign with its own launch.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {lifecycleActions(campaign.status).map((a) => (
                <Button key={a} variant="outline" onClick={() => void lifecycle(a)}>{LIFECYCLE_LABEL[a]}</Button>
              ))}
              <Button variant="outline" onClick={() => void lifecycle('clone')}>Make a copy</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-(--ad-line) bg-background py-3 max-md:bottom-[calc(72px+env(safe-area-inset-bottom,0px))]">
        <span className="text-[12px] text-(--ad-ink-soft)" aria-live="polite">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!dirty || saving} onClick={() => { if (confirmDiscard(true)) setForm(saved); }}>Discard</Button>
          <Button disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
