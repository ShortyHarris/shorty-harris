import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { myCampaignsKey } from '../hooks/useClientCampaigns';
import { invalidateApprovalQueries } from '../hooks/useClientApprovals';
import {
  setFollowUpsNow, writingEta, FOLLOW_UPS_NOW_TITLE, FOLLOW_UPS_NOW_HELP, FOLLOW_UPS_OFF_HELP,
} from '../lib/followUpsNow';

/**
 * Per-campaign switch for "write follow-ups now" (campaigns.upfront_sequence). Used on the client
 * Campaigns detail and the admin campaign editor; the RPC checks the viewer may manage the client.
 */
export function FollowUpsNowToggle({
  campaignId, clientId, on, campaignActive, readOnly = false, client = supabase, onChanged,
}: {
  campaignId: string;
  clientId: string;
  on: boolean;
  /** Drafting only runs for active campaigns. */
  campaignActive: boolean;
  readOnly?: boolean;
  client?: SupabaseClient;
  onChanged?: (on: boolean) => void;
}) {
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    if (readOnly || busy) return;
    const next = !value;
    setBusy(true); setErr(null); setNote(null);
    const { data, error } = await setFollowUpsNow(client, campaignId, next);
    setBusy(false);
    if (error || !data) { setErr(`Couldn't change this: ${error}`); return; }
    setValue(next);
    if (next) setNote(campaignActive ? writingEta(data.followUpsToWrite) : 'Follow-ups will be drafted once this campaign is live.');
    else setNote('Turned off. Follow-ups already drafted stay in Approvals; new ones are written after each email sends.');
    queryClient.invalidateQueries({ queryKey: myCampaignsKey(clientId) });
    invalidateApprovalQueries(clientId);
    onChanged?.(next);
  }

  return (
    <div className="rounded-xl border border-(--ad-line) bg-(--ad-surface) px-4 py-3.5" data-testid="follow-ups-now">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Layers size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-(--ad-green)" aria-hidden />
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold text-(--ad-ink)">{FOLLOW_UPS_NOW_TITLE}</p>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-(--ad-ink-soft)">
              {value ? FOLLOW_UPS_NOW_HELP : `${FOLLOW_UPS_OFF_HELP} ${FOLLOW_UPS_NOW_HELP}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={FOLLOW_UPS_NOW_TITLE}
          onClick={toggle}
          disabled={readOnly || busy}
          className="relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: value ? 'var(--ad-green)' : 'var(--ad-line)' }}
        >
          <span className="absolute top-0.5 h-5 w-5 rounded-full bg-(--ad-surface) shadow-sm transition-all" style={{ left: value ? 22 : 2 }} />
        </button>
      </div>
      {note && <p role="status" className="m-0 mt-2.5 text-[12.5px] font-semibold leading-snug text-(--ad-ink)">{note}</p>}
      {err && <p role="alert" className="m-0 mt-2.5 text-[12.5px] font-semibold leading-snug text-(--ad-ink)">{err}</p>}
    </div>
  );
}
