// Campaign window (docs/CAMPAIGN_WIZARD_BUILD_PLAN.md, M4): one calm pop-up per campaign, opened
// from the Campaigns page (?open=<id>&tab=emails). Same principles as the campaign wizard: big
// title, one sentence saying what to do next, one primary button, everything else tucked away.
//   Emails       - the four-email template, editable, with free AI rewrites; when each one goes
//   Who & where  - name, types of business, areas; more settings behind a disclosure
//   Launch       - the estimate, what still needs fixing, Launch (Status once it is running)
// Pause / resume / archive / copy / delete live in the "⋯" menu. Launch uses the existing WF0a gate.

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ThinkingOrb } from 'thinking-orbs';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check, ChevronDown, CircleAlert, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ModalClose } from '../../components/ModalClose';
import { RowMenu, type MenuItem } from '../../components/RowMenu';
import { TagInput } from '../../components/TagInput';
import { LocationAreaInput } from '../../components/LocationAreaInput';
import { LimitMessages } from '../../components/LimitCounter';
import { useToast, ToastHost } from '../../components/Toast';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { queryClient } from '../../lib/queryClient';
import { confirmDiscard } from '../../lib/confirmDiscard';
import { cn } from '../../lib/utils';
import { buildAreaColumns, campaignAreas, type TargetArea } from '../../lib/targetAreas';
import { validateCampaignLimits } from '../../lib/campaignLimits';
import { useCampaignLimits } from '../../hooks/useClientIcp';
import { enqueueCampaign } from '../../lib/scrapeEnqueue';
import {
  LIFECYCLE_LABEL, editorTab, emailProblems, emailsFrom, hasLaunched, isLaunchable, lifecycleActions, nextStepHint,
  startLabel, type EditorTab, type Email, type LifecycleAction,
} from '../../lib/campaignEditor';
import {
  callWizardAi, costForCampaigns, launchLine, wizardErrorMessage, type CostEstimate, type RewriteResult,
} from '../../hooks/useWizardAi';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const BRAND = '#7412ef';
const STATUS_LABEL: Record<string, string> = {
  pending_review: 'Draft', draft: 'Draft', scheduled: 'Scheduled', active: 'Running', paused: 'Paused', completed: 'Finished', archived: 'Archived',
};
const LANGUAGES = ['English', 'Czech', 'French', 'Spanish', 'Portuguese', 'German', 'Italian', 'Dutch', 'Polish', 'Slovak'];
const EMAIL_TITLES = ['Email 1', 'Email 2', 'Email 3', 'Email 4'];
const EMAIL_WHEN = ['Sent first', '3 business days later', '5 business days later', '7 business days later'];

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

/** The old /campaigns/:id/edit address now opens the campaign window on the Campaigns page. */
export function CampaignEditor({ basePath = '/app' }: { clientId?: string; basePath?: string }) {
  const { campaignId = '' } = useParams();
  const [params] = useSearchParams();
  const tab = params.get('tab');
  return <Navigate replace to={`${basePath}/campaigns?open=${campaignId}${tab ? `&tab=${tab}` : ''}`} />;
}

export interface CampaignDialogProps {
  campaignId: string;
  initialTab: string | null;
  clientId: string;
  client?: SupabaseClient;
  basePath?: string;
  canDelete?: boolean;
  onClose: () => void;
  /** Open another campaign in the window (after "Make a copy"). */
  onOpenCampaign: (id: string) => void;
  /** Ask the page to confirm and delete (it shows the "what gets deleted" dialog on top). */
  onDelete?: (c: { id: string; name: string }) => void;
}

export default function CampaignDialog(props: CampaignDialogProps) {
  const { campaignId, client = supabase } = props;
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

  if (!editor.data) {
    return (
      <Shell label="Campaign" onClose={props.onClose}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
          {editor.error ? (
            <>
              <p className="m-0 text-[16px] font-semibold">We couldn't open this campaign</p>
              <p className="m-0 text-[14px] text-muted-foreground">{(editor.error as Error).message}</p>
              <Button variant="outline" onClick={props.onClose}>Close</Button>
            </>
          ) : (
            <>
              <ThinkingOrb state="breathing" size={64} color={BRAND} aria-hidden />
              <p className="m-0 text-[14px] text-muted-foreground">Opening campaign…</p>
            </>
          )}
        </div>
      </Shell>
    );
  }
  // A fresh load (after a save, launch or lifecycle action) starts the form again from the saved campaign.
  return (
    <DialogBody key={editor.dataUpdatedAt} {...props} client={client}
      campaign={editor.data.campaign} rewriteLimit={editor.data.rewriteLimit}
      checked={checks.data ?? null} reload={async () => { await editor.refetch(); }} />
  );
}

/** The window itself: a centred card on desktop, full screen on a phone. */
function Shell({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-[rgba(14,8,34,0.45)] md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose, { escape: true })}
    >
      <motion.div
        style={FONT} role="dialog" aria-modal="true" aria-label={label}
        className="flex h-full w-full flex-col overflow-hidden bg-card text-foreground md:h-[min(880px,calc(100vh-48px))] md:max-w-[760px] md:rounded-2xl md:border md:border-border"
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function DialogBody({ clientId, client, basePath = '/app', canDelete = true, campaign, rewriteLimit, checked, initialTab, onClose, onOpenCampaign, onDelete, reload }:
  CampaignDialogProps & { client: SupabaseClient; campaign: CampaignRow; rewriteLimit: number; checked: Checks | null; reload: () => Promise<void> }) {
  const { toasts, toast, dismiss } = useToast();
  const limits = useCampaignLimits(clientId, client);
  const [saved] = useState<Form>(() => formFrom(campaign));
  const [form, setForm] = useState<Form>(saved);
  const [tab, setTab] = useState<EditorTab>(() => editorTab(initialTab, campaign.status));
  const [rewritesUsed, setRewritesUsed] = useState(campaign.rewrites_used);
  const [launchProblems, setLaunchProblems] = useState<Problem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [rewriting, setRewriting] = useState<number | 'all' | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
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
  const launchable = isLaunchable(campaign.status);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setEmail = (i: number, patch: Partial<Email>) =>
    setForm((f) => (f.emails ? { ...f, emails: f.emails.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : f));

  const problems = launchProblems ?? checked?.problems ?? [];
  // Email problems are checked live from the form, so the saved check's are dropped.
  const allProblems: Problem[] = [
    ...problems.filter((p) => !(form.emails && (p.code === 'blank_email' || p.tab === 'emails'))),
    ...localEmailProblems.map((p) => ({ code: 'email', tab: 'emails', message: p.message, step: p.step })),
  ];
  const whoProblems = allProblems.filter((p) => p.tab === 'targeting').length + (limitCheck.valid ? 0 : 1);
  const starts = startLabel(form.start_date || null);
  const line = checked?.cost?.items?.[0];

  function close() {
    if (dirty && !confirmDiscard(true)) return;
    onClose();
  }

  async function save(): Promise<boolean> {
    if (!form.name.trim()) { toast('Give the campaign a name.', 'error'); setTab('who'); return false; }
    if (!limitCheck.valid) { toast(limitCheck.errors.map((e) => e.message).join(' '), 'error'); setTab('who'); return false; }
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
    // Anything left to fix is shown on the Launch tab rather than behind a disabled button.
    if (allProblems.length > 0) { setTab('launch'); return; }
    if (dirty && !(await save())) return;
    setTab('launch');
    setLaunching(true); setLaunchResult(null);
    const { data: prep, error } = await client.rpc('prepare_campaign_launch', { p_campaign_id: campaign.id });
    if (error || !prep?.ok) { setLaunching(false); setLaunchResult({ tone: 'error', text: `Couldn't launch: ${error?.message ?? prep?.error}` }); return; }
    if (prep.result === 'problems') { setLaunching(false); setLaunchProblems(prep.problems); return; }
    if (prep.result === 'scheduled') {
      setLaunching(false);
      toast(`Scheduled for ${new Date(`${prep.start_date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Nothing is charged until then.`);
      queryClient.invalidateQueries({ queryKey: ['my-campaigns', clientId] });
      await reload();
      return;
    }
    const r = await enqueueCampaign(campaign.id);
    setLaunching(false);
    if (r.kind === 'queued' || r.kind === 'already_queued') {
      toast('Launched. The first emails will appear in Approvals for you to check before anything is sent.');
    } else if (r.kind === 'launch_limit_reached' || r.kind === 'limit_reached') {
      setLaunchResult({ tone: 'warn', text: r.message });
    } else {
      setLaunchResult({ tone: 'error', text: `Couldn't launch: ${r.message}` });
    }
    queryClient.invalidateQueries({ queryKey: ['my-campaigns', clientId] });
    await reload();
  }

  async function lifecycle(action: LifecycleAction | 'clone') {
    if (dirty && !confirmDiscard(true)) return;
    if (action === 'clone') {
      const { data } = await client.rpc('clone_campaign', { p_campaign_id: campaign.id });
      if (!data?.ok) { toast(data?.error === 'campaign_limit' ? "You've reached your campaign limit." : "Couldn't copy the campaign.", 'error'); return; }
      queryClient.invalidateQueries({ queryKey: ['my-campaigns', clientId] });
      onOpenCampaign(data.campaign_id);
      return;
    }
    const { data } = await client.rpc('set_campaign_lifecycle', { p_campaign_id: campaign.id, p_action: action });
    if (!data?.ok) { toast(`Couldn't ${LIFECYCLE_LABEL[action].toLowerCase()} this campaign.`, 'error'); return; }
    toast(`${LIFECYCLE_LABEL[action]}: done.`);
    queryClient.invalidateQueries({ queryKey: ['my-campaigns', clientId] });
    await reload();
  }

  const menu: MenuItem[] = [
    ...lifecycleActions(campaign.status).map((a): MenuItem => ({ type: 'action', label: LIFECYCLE_LABEL[a], onClick: () => void lifecycle(a) })),
    { type: 'action', label: 'Make a copy', onClick: () => void lifecycle('clone') },
    ...(canDelete && onDelete ? [{ type: 'separator' } as MenuItem, {
      type: 'action', label: 'Delete campaign', destructive: true,
      onClick: () => { if (!dirty || confirmDiscard(true)) onDelete({ id: campaign.id, name: campaign.name }); },
    } as MenuItem] : []),
  ];

  const tabCls = 'relative h-11 rounded-none border-0 bg-transparent px-0 text-[14px] font-semibold text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-foreground';
  const fieldCls = 'h-12 rounded-xl text-[15px]';
  const dot = <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-(--ad-clay)" aria-label="needs attention" />;

  return (
    <Shell label={campaign.name} onClose={close}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as EditorTab)} className="flex min-h-0 flex-1 flex-col">
        {/* Header: what this is and what to do now */}
        <div className="shrink-0 px-6 pt-5 md:px-10 md:pt-7">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-muted-foreground">
              {STATUS_LABEL[campaign.status] ?? campaign.status}
              {campaign.status === 'scheduled' && starts && <> · {starts}</>}
              {campaign.origin !== 'manual' && <> · From the campaign wizard</>}
            </span>
            <div className="flex items-center gap-1.5">
              <RowMenu items={menu} label="Campaign actions" className="h-9 w-9 rounded-full" />
              <ModalClose onClick={close} />
            </div>
          </div>
          <h2 className="m-0 mt-2 text-[24px] font-semibold leading-tight tracking-tight text-balance md:text-[28px]">{form.name || campaign.name}</h2>
          <p className="m-0 mt-2 text-[15px] leading-relaxed text-muted-foreground">{nextStepHint(campaign.status, launchable ? allProblems.length : 0)}</p>
          <TabsList className="mt-5 flex h-auto w-full justify-start gap-7 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="emails" className={tabCls}>Emails{localEmailProblems.length > 0 && dot}</TabsTrigger>
            <TabsTrigger value="who" className={tabCls}>Who &amp; where{launchable && whoProblems > 0 && dot}</TabsTrigger>
            <TabsTrigger value="launch" className={tabCls}>{launchable ? 'Launch' : 'Status'}</TabsTrigger>
          </TabsList>
        </div>

        <div className="modal-scroll min-h-0 flex-1 overflow-y-auto px-6 py-7 md:px-10">
          {/* ── Emails ── */}
          <TabsContent value="emails" className="m-0">
            {!form.emails ? (
              <div className="flex flex-col items-start gap-3 rounded-2xl border border-border p-6">
                <p className="m-0 text-[16px] font-semibold">No email template yet</p>
                <p className="m-0 text-[14px] leading-relaxed text-muted-foreground">We write each email from scratch for every business we find. Add a template to set the message yourself; we still personalise it for each business.</p>
                <Button className="h-11 rounded-xl px-5" onClick={() => set({ emails: emailsFrom(null) })}>Add an email template</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="m-0 max-w-[420px] text-[14px] leading-relaxed text-muted-foreground">
                    Every business gets these four emails, personalised for them. Follow-ups stop when they reply.
                  </p>
                  <Button variant="outline" className="h-10 rounded-full px-4 text-[13px] font-semibold" disabled={rewritesLeft === 0 || rewriting !== null} onClick={() => void rewrite(null)}
                    title={`${rewritesLeft} of ${rewriteLimit} free AI rewrites left`}>
                    {rewriting === 'all' ? <ThinkingOrb state="composing" size={20} color={BRAND} className="mr-1.5" aria-hidden /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                    Rewrite all with AI
                  </Button>
                </div>
                {form.emails.map((e, i) => {
                  const probs = localEmailProblems.filter((p) => p.step === i);
                  return (
                    <section key={i} aria-label={EMAIL_TITLES[i]} className="flex flex-col gap-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="m-0 text-[17px] font-semibold tracking-tight">{EMAIL_TITLES[i]} <span className="ml-1 text-[13px] font-medium text-muted-foreground">{EMAIL_WHEN[i]}</span></h3>
                        <button type="button" disabled={rewritesLeft === 0 || rewriting !== null} onClick={() => void rewrite(i)}
                          className="inline-flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-40">
                          {rewriting === i ? <ThinkingOrb state="composing" size={20} color={BRAND} aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}Rewrite
                        </button>
                      </div>
                      <Input aria-label={`${EMAIL_TITLES[i]} subject`} placeholder="Subject" className={cn(fieldCls, 'font-semibold')} value={e.subject} onChange={(ev) => setEmail(i, { subject: ev.target.value })} />
                      <Textarea aria-label={`${EMAIL_TITLES[i]} body`} rows={8} className="rounded-xl text-[15px] leading-relaxed" value={e.body} onChange={(ev) => setEmail(i, { body: ev.target.value })} />
                      {probs.map((p) => <p key={p.message} className="m-0 flex items-start gap-1.5 text-[13px] text-(--ad-clay)"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{p.message}</p>)}
                    </section>
                  );
                })}
                <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
                  {rewritesLeft > 0 ? `${rewritesLeft} of ${rewriteLimit} free AI rewrites left. ` : "You've used this campaign's free AI rewrites; editing yourself is always free. "}
                  You can use {'{{first_name}}'}, {'{{company_name}}'} and {'{{sender_name}}'}. Weekends and public holidays are skipped, and we add your unsubscribe line and address.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── Who & where ── */}
          <TabsContent value="who" className="m-0">
            <div className="flex flex-col gap-7">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ed-name" className="text-[15px] font-semibold">Campaign name</Label>
                <Input id="ed-name" className={fieldCls} value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              {campaign.icp && typeof campaign.icp.target === 'string' && (
                <p className="m-0 rounded-2xl bg-muted/60 px-5 py-4 text-[15px] leading-relaxed"><span className="text-muted-foreground">Who it reaches: </span>{campaign.icp.target}</p>
              )}
              <TagInput sentenceLabel label="Types of business" required placeholder="e.g. property management company"
                helper="What we search for on maps. Businesses, not job titles." values={form.search_queries} onChange={(v) => set({ search_queries: v })} splitOn="," maxItems={limits.maxSearchTerms} capLabel="search term" />
              <LocationAreaInput sentenceLabel label="Areas" required helper="A city, a region, or a radius around a point."
                values={form.areas} onChange={(v) => set({ areas: v })} maxItems={limits.maxLocations} capLabel="area" />
              <LimitMessages errors={limitCheck.errors} fields={['search_queries', 'target_locations', 'pairs', 'max_results']} />

              <div className="border-t border-border pt-5">
                <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}
                  className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent p-0 text-left text-[15px] font-semibold text-foreground">
                  More settings <span className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground">Size, language, start date<ChevronDown className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} aria-hidden /></span>
                </button>
                {moreOpen && (
                  <div className="mt-5 flex flex-col gap-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="ed-max">Maximum businesses</Label>
                        <Input id="ed-max" type="number" min={1} max={limits.maxResults} className={fieldCls} value={form.max_results}
                          onChange={(e) => set({ max_results: Math.max(1, Number(e.target.value) || 1) })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="ed-lang">Email language</Label>
                        <select id="ed-lang" className="h-12 rounded-xl border border-input bg-background px-3 text-[15px]" value={form.language} onChange={(e) => set({ language: e.target.value })}>
                          {[...new Set([form.language, ...LANGUAGES])].map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ed-start">Start date <span className="font-normal text-muted-foreground">Optional</span></Label>
                      <Input id="ed-start" type="date" className={cn(fieldCls, 'sm:max-w-[260px]')} value={form.start_date} disabled={launched} onChange={(e) => set({ start_date: e.target.value })} />
                      <p className="m-0 text-[13px] text-muted-foreground">With a future date, launching schedules it: nothing is found, sent or charged before that day.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ed-desc">Notes <span className="font-normal text-muted-foreground">Optional, only you see these</span></Label>
                      <Input id="ed-desc" className={fieldCls} value={form.description} onChange={(e) => set({ description: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Launch / status ── */}
          <TabsContent value="launch" className="m-0">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <dl className="m-0 grid grid-cols-3 gap-3">
                  {[
                    { k: launched ? 'Businesses found' : 'Businesses', v: launched ? String(campaign.prospect_count) : (line ? `${line.prospects_lo}–${line.prospects_hi}` : '…') },
                    { k: 'Hot leads', v: line ? `${line.hot_lo}–${line.hot_hi}` : '…' },
                    { k: launched ? 'Each hot lead' : 'Launch', v: launched ? '1 credit' : (line ? (line.launch === 'free' ? 'Free' : '1 credit') : '…') },
                  ].map((s) => (
                    <div key={s.k} className="rounded-2xl border border-border px-4 py-4">
                      <dt className="text-[12px] text-muted-foreground">{s.k}</dt>
                      <dd className="m-0 mt-1 text-[20px] font-semibold tabular-nums tracking-tight">{s.v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
                  Estimates, not promises; every campaign varies.{!launched && line && checked?.cost ? ` ${launchLine(line, checked.cost)}.` : ''}
                  {checked?.cost && ` Your balance: ${checked.cost.balance} credit${checked.cost.balance === 1 ? '' : 's'}.`}
                </p>
              </div>

              {launchable && (
                <section aria-label="Before you launch" className="flex flex-col gap-3">
                  <h3 className="m-0 text-[17px] font-semibold tracking-tight">Before you launch</h3>
                  {allProblems.length === 0 ? (
                    <p className="m-0 flex items-center gap-2.5 rounded-2xl bg-(--ad-green-tint)/50 px-5 py-4 text-[15px] font-medium"><Check className="h-4 w-4 text-(--ad-green)" strokeWidth={3} aria-hidden />Everything is ready to launch.</p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border p-0">
                      {allProblems.map((p) => (
                        <li key={`${p.code}-${p.message}`} className="flex items-center justify-between gap-3 px-5 py-3.5 text-[14px]">
                          <span className="flex items-start gap-2.5"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-(--ad-clay)" aria-hidden />{p.message}</span>
                          {p.code === 'no_mailbox'
                            ? <Link className="shrink-0 text-[13px] font-semibold text-foreground underline underline-offset-4" to={`${basePath}/settings`}>Connect Gmail</Link>
                            : p.tab !== 'launch' && <button type="button" className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-foreground underline underline-offset-4" onClick={() => setTab(p.tab === 'emails' ? 'emails' : 'who')}>Fix</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {launchResult && (
                <p role="status" className={cn('m-0 rounded-2xl px-5 py-4 text-[14px] leading-relaxed', launchResult.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted/60')}>
                  {launchResult.text}
                  {launchResult.tone === 'warn' && <> <Link className="font-semibold underline underline-offset-4" to={`${basePath}/billing`}>Add credits</Link></>}
                </p>
              )}

              {!launchable && (
                <p className="m-0 text-[14px] leading-relaxed text-muted-foreground">
                  New emails appear in <Link className="font-semibold text-foreground underline underline-offset-4" to={`${basePath}/approvals`}>Approvals</Link> for you to check before they're sent.
                  Pause, archive, copy or delete it from the ⋮ menu at the top.
                </p>
              )}
            </div>
          </TabsContent>
        </div>

        {/* Footer: one clear next step */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4 max-md:pb-[calc(16px+env(safe-area-inset-bottom,0px))] md:px-10">
          <span className="text-[13px] text-muted-foreground" aria-live="polite">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <div className="flex items-center gap-2">
            {dirty && <Button variant="ghost" className="h-11 rounded-xl px-4 text-[14px] font-semibold" disabled={saving} onClick={() => { if (confirmDiscard(true)) setForm(saved); }}>Discard</Button>}
            {launchable && campaign.status !== 'scheduled' ? (
              <>
                {dirty && <Button variant="outline" className="h-11 rounded-xl px-5 text-[14px] font-semibold" disabled={saving || launching} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>}
                <Button className="h-11 rounded-xl px-6 text-[14px] font-semibold" disabled={saving || launching} onClick={() => void launch()}>
                  {launching && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                  {starts ? 'Schedule' : 'Launch campaign'}
                </Button>
              </>
            ) : (
              <Button className="h-11 rounded-xl px-6 text-[14px] font-semibold" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</Button>
            )}
          </div>
        </div>
      </Tabs>
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </Shell>
  );
}
