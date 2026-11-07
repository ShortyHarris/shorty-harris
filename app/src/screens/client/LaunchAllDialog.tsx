// "Launch all": launches several draft campaigns in one go. Each campaign is still checked
// and launched on its own (its own launch-gate call), so one that can't launch never blocks
// the others; the result lists which launched and which need fixing.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check, CircleAlert, Loader2, Rocket } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { enqueueCampaign } from '../../lib/scrapeEnqueue';
import { costForCampaigns, launchLine, type CostEstimate } from '../../hooks/useWizardAi';

export interface LaunchCandidate { id: string; name: string }
type Outcome = { id: string; name: string; tone: 'ok' | 'warn' | 'error'; text: string };

const niceDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export function LaunchAllDialog({ open, onOpenChange, drafts, basePath, onDone, client = supabase }: {
  open: boolean; onOpenChange: (o: boolean) => void; drafts: LaunchCandidate[]; basePath: string; onDone: () => void; client?: SupabaseClient;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(drafts.map((d) => d.id)));
  const [cost, setCost] = useState<CostEstimate | null>(null);
  const [problems, setProblems] = useState<Record<string, string[]>>({});
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const ids = drafts.filter((d) => selected.has(d.id)).map((d) => d.id);
  const idsKey = ids.join(',');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const list = idsKey ? idsKey.split(',') : [];
    void costForCampaigns(list, client).then((c) => { if (!cancelled) setCost(c); });
    void Promise.all(drafts.map(async (d) => {
      const { data } = await client.rpc('campaign_launch_problems', { p_campaign_id: d.id });
      return [d.id, ((data?.problems ?? []) as { message: string }[]).map((p) => p.message)] as const;
    })).then((rows) => { if (!cancelled) setProblems(Object.fromEntries(rows)); });
    return () => { cancelled = true; };
  }, [open, idsKey, drafts, client]);

  async function run() {
    setRunning(true);
    const out: Outcome[] = [];
    // Names are captured now: once launched, a campaign is no longer in the drafts list.
    const names = Object.fromEntries(drafts.map((d) => [d.id, d.name]));
    for (const id of ids) {
      const name = names[id] ?? 'Campaign';
      const { data: prep } = await client.rpc('prepare_campaign_launch', { p_campaign_id: id });
      if (!prep?.ok) { out.push({ id, name, tone: 'error', text: "Couldn't check this campaign." }); continue; }
      if (prep.result === 'problems') { out.push({ id, name, tone: 'warn', text: (prep.problems as { message: string }[]).map((p) => p.message).join(' ') }); continue; }
      if (prep.result === 'scheduled') { out.push({ id, name, tone: 'ok', text: `Scheduled to start on ${niceDate(prep.start_date)}. Nothing is charged until then.` }); continue; }
      const r = await enqueueCampaign(id);
      if (r.kind === 'queued' || r.kind === 'already_queued') out.push({ id, name, tone: 'ok', text: 'Launched.' });
      else out.push({ id, name, tone: r.kind === 'error' ? 'error' : 'warn', text: r.message });
    }
    setOutcomes(out);
    setRunning(false);
    onDone();
  }


  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) { onOpenChange(o); if (!o) setOutcomes(null); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Launch campaigns</DialogTitle>
          <DialogDescription>Each campaign is checked and launched on its own. One that isn't ready stays a draft and doesn't stop the others.</DialogDescription>
        </DialogHeader>

        {outcomes ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {outcomes.map((o) => (
              <li key={o.id} className="flex items-start gap-2 rounded-lg border border-(--ad-line) px-3 py-2 text-[13px]">
                {o.tone === 'ok' ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-(--ad-green)" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-(--ad-clay)" aria-hidden />}
                <span><b className="font-semibold">{o.name}</b>: {o.text}{' '}
                  {o.tone !== 'ok' && <Link className="font-semibold text-(--ad-green)" to={`${basePath}/campaigns/${o.id}/edit`}>Open</Link>}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {drafts.map((d) => {
              const i = ids.indexOf(d.id);
              const line = i >= 0 ? cost?.items?.[i] : undefined;
              const probs = problems[d.id] ?? [];
              return (
                <li key={d.id} className="flex items-start gap-3 rounded-lg border border-(--ad-line) px-3 py-2.5">
                  <Checkbox id={`la-${d.id}`} className="mt-0.5" checked={selected.has(d.id)}
                    onCheckedChange={(c) => setSelected((s) => { const n = new Set(s); if (c) n.add(d.id); else n.delete(d.id); return n; })} />
                  <label htmlFor={`la-${d.id}`} className="flex flex-1 cursor-pointer flex-col gap-1 text-[13px]">
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-(--ad-ink)">{d.name}
                      {probs.length > 0 ? <Badge variant="outline" className="border-(--ad-clay-line) text-(--ad-clay)">Needs fixes</Badge> : <Badge variant="secondary">Ready</Badge>}
                    </span>
                    {line && <span className="text-(--ad-ink-soft)">Est. {line.prospects_lo}–{line.prospects_hi} businesses · {line.hot_lo}–{line.hot_hi} hot leads (every campaign varies) · {launchLine(line, cost)}</span>}
                    {probs.map((p) => <span key={p} className="text-[12px] text-(--ad-clay)">{p}</span>)}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {!outcomes && cost && cost.short_by > 0 && (
          <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">
            These need {cost.credits_needed} credit{cost.credits_needed === 1 ? '' : 's'} and you have {cost.balance}. Campaigns that can't be covered stay drafts. <Link className="font-semibold text-(--ad-green)" to={`${basePath}/billing`}>Add credits</Link>
          </p>
        )}

        <DialogFooter>
          {outcomes ? (
            <Button onClick={() => { onOpenChange(false); setOutcomes(null); }}>Done</Button>
          ) : (
            <>
              <Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={running || ids.length === 0} onClick={() => void run()}>
                {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="mr-1.5 h-4 w-4" aria-hidden />}
                Launch {ids.length} campaign{ids.length === 1 ? '' : 's'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
