-- Let a client (or an admin) choose to start approving follow-ups before the first email has sent,
-- and give the Approvals screen what it needs to explain an empty Pending tab and the Blocked tab.
--
-- How follow-ups normally arrive: WF5 writes follow-up N only after the previous email has been
-- SENT plus 3 / 5 / 7 business days, so with a slow warm-up the Pending tab can sit empty for days.
-- campaigns.upfront_sequence already exists: when on, WF19 writes all three follow-ups as soon as a
-- prospect has a live first-touch draft. Nothing could switch it on until now.
--
-- Turning it on does not send anything sooner: sendable_messages still requires the previous step to
-- have been sent plus the business-day gap. Duplicates are impossible: messages_one_followup_per_step
-- allows one live follow-up per step per prospect, and WF5 already treats that conflict as "skip".

-- ── Switch ──────────────────────────────────────────────────────────────────
create or replace function public.set_campaign_upfront_sequence(p_campaign_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_client uuid; v_to_write int;
begin
  select client_id into v_client from public.campaigns where id = p_campaign_id;
  if v_client is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.can_manage_client(v_client) then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;

  update public.campaigns
     set upfront_sequence = coalesce(p_on, false), updated_at = now()
   where id = p_campaign_id;

  -- What WF19 will now write for this campaign (it only reads active campaigns).
  select count(*) into v_to_write from public.sequence_writer_queue q where q.campaign_id = p_campaign_id;

  return jsonb_build_object('ok', true, 'upfront_sequence', coalesce(p_on, false), 'follow_ups_to_write', v_to_write);
end; $function$;

revoke all on function public.set_campaign_upfront_sequence(uuid, boolean) from public, anon;
grant execute on function public.set_campaign_upfront_sequence(uuid, boolean) to authenticated;

-- ── approved_queue: counts that explain the tabs ────────────────────────────
--   approved_initials_waiting  approved first emails queued to send (their follow-ups come later)
--   pending_followups          follow-up drafts waiting for approval
--   blocked_by_reason          { reason: n } for the Blocked tab, same visibility as the tab
--   upfront_campaigns          active campaigns with "write follow-ups now" on
--   active_campaigns           active campaigns
-- Patched in place on a single-line anchor that must appear exactly once, so line endings and
-- indentation (e.g. when pasted into the SQL editor) cannot break it.
do $$
declare v_def text; v_anchor text := $a$'policy_held', (select count(*) from visible where policy_held),$a$;
begin
  v_def := pg_get_functiondef('public.approved_queue(uuid,text,text,text,text,integer,integer)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'follow_ups_now patch: approved_queue anchor not found exactly once';
  end if;
  if position('approved_initials_waiting' in v_def) > 0 then
    raise notice 'approved_queue already patched, skipping';
    return;
  end if;
  execute replace(v_def, v_anchor, v_anchor || $b$
        'approved_initials_waiting', (select count(*) from visible where message_type = 'initial' and cat = 'sendable'),
        'pending_followups', (select count(*) from pend_visible where message_type <> 'initial'),
        'blocked_by_reason', coalesce((select jsonb_object_agg(b.reason, b.n)
            from (select reason, count(*) as n from visible where cat = 'blocked' group by reason) b), '{}'::jsonb),
        'upfront_campaigns', (select count(*) from public.campaigns uc
            where uc.client_id = p_client_id and uc.status = 'active' and uc.upfront_sequence),
        'active_campaigns', (select count(*) from public.campaigns ac
            where ac.client_id = p_client_id and ac.status = 'active'),$b$);
end $$;
