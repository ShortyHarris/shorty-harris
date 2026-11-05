-- A sandbox client only ever mails its own connected mailbox (sandbox_address_allowed),
-- so the send window and the warm-up ramp, which protect a real mailbox's reputation,
-- only make testers wait. Sandbox clients: no window, no warm-up spacing, 100 a day.
--
-- Applied live as 20261104165820. The live migration patched send_pacing in place
-- with a DO block; this file records the resulting full definition instead, so it
-- reads as plain SQL. The n8n side (WF2.5 Compute Per-Client Send Batch and its
-- coarse UTC gate) was changed in the same step to skip the window for is_sandbox.

create or replace function public.mailbox_daily_cap(p_client_id uuid)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare cred record; started timestamptz; d int;
begin
  if coalesce((select is_sandbox from public.clients where id = p_client_id), false) then
    return 100;
  end if;
  select * into cred from public.client_email_credentials
   where client_id = p_client_id and status = 'active' order by created_at limit 1;
  if not found then return 40; end if;
  if cred.paused_until is not null and cred.paused_until > now() then return 0; end if;
  if cred.warmup_mode = 'warm' then return 40; end if;
  started := coalesce(cred.warmup_started_at,
    (select min(sent_at) from public.messages where client_id = p_client_id and send_status = 'sent'),
    now());
  d := greatest(0, floor(extract(epoch from (now() - started)) / 86400))::int;
  return case when d < 7 then 5 when d < 14 then 10 when d < 21 then 20 when d < 28 then 30 else 40 end;
end $function$;

-- WF2.5 reads this. is_sandbox is new (appended, so existing columns keep their order);
-- warmup_mode reads 'warm' for a sandbox so WF2.5 skips the one-at-a-time warm-up spacing.
create or replace view public.client_send_limits with (security_invoker = true) as
 select cl.id,
    cl.send_timezone,
    mailbox_daily_cap(cl.id) as daily_cap,
    case when cl.is_sandbox then 'warm'::text
         else coalesce(( select c.warmup_mode
                from client_email_credentials c
               where c.client_id = cl.id and c.status = 'active'::text
               order by c.created_at
              limit 1), 'warm'::text) end as warmup_mode,
    cl.is_sandbox
   from clients cl;

-- send_pacing (the Sending panel): a sandbox is always in its window and never warming up.
CREATE OR REPLACE FUNCTION public.send_pacing(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin boolean := public.is_admin();
  v_sandbox boolean;
  v_tz text; v_now_local timestamp; v_today date;
  v_has_mailbox boolean := false; v_mode text; v_paused timestamptz; v_cred_started timestamptz;
  v_started timestamptz; v_ramp boolean; v_idx int;
  v_cap int; v_sent_today int;
  v_ready int := 0; v_ready_first int := 0; v_ready_fu int := 0; v_waiting int := 0;
  v_fu_await int := 0; v_fu_sched int := 0; v_fu_next timestamptz;
  v_in_window boolean;
  v_acc int := 0; v_finish date; v_off int; v_day date; v_capd int;
  v_next_in int; v_next_cap int; v_next_date date;
  v_held int := 0; v_blocked int := 0;
  v_ladder jsonb;
begin
  if not public.can_manage_client(p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;

  select coalesce(nullif(c.send_timezone, ''), 'America/Chicago') into v_tz
    from public.clients c where c.id = p_client_id;
  if v_tz is null then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;
  v_now_local := now() at time zone v_tz;
  v_today := v_now_local::date;

  select c.warmup_mode, c.paused_until, c.warmup_started_at
    into v_mode, v_paused, v_cred_started
    from public.client_email_credentials c
   where c.client_id = p_client_id and c.status = 'active'
   order by c.created_at limit 1;
  v_has_mailbox := found;
  v_mode := coalesce(v_mode, 'warm');
  v_sandbox := coalesce((select c.is_sandbox from public.clients c where c.id = p_client_id), false);
  if v_sandbox then v_mode := 'warm'; end if;
  v_started := coalesce(v_cred_started,
      (select min(m.sent_at) from public.messages m
        where m.client_id = p_client_id and m.send_status = 'sent'),
      now());
  v_ramp := v_has_mailbox and v_mode is distinct from 'warm';
  v_idx := greatest(0, floor(extract(epoch from (now() - v_started)) / 86400))::int;
  v_cap := coalesce(public.mailbox_daily_cap(p_client_id), 40);

  select count(*) into v_sent_today from public.messages m
   where m.client_id = p_client_id and m.send_status = 'sent'
     and (m.sent_at at time zone v_tz)::date = v_today;

  select count(*),
         count(*) filter (where s.message_type = 'initial'),
         count(*) filter (where s.message_type <> 'initial')
    into v_ready, v_ready_first, v_ready_fu
    from public.sendable_messages s
   where s.client_id = p_client_id and s.approval_status = 'approved' and s.send_status = 'not_sent';

  select count(*) into v_waiting from public.message_block_reasons r
   where r.client_id = p_client_id and r.reason = 'waiting_followup_timing';

  select count(*) into v_fu_await
    from public.messages m join public.prospects p on p.id = m.prospect_id
   where m.client_id = p_client_id and m.message_type like 'follow_up%'
     and m.approval_status = 'pending' and m.send_status = 'not_sent'
     and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
     and (v_admin or not public.is_send_rule_held(p.email, m.campaign_id, m.client_id));

  select count(*), min(f.due_at) into v_fu_sched, v_fu_next
    from public.follow_up_schedules f
   where f.client_id = p_client_id and f.status = 'pending';

  if v_admin then
    select count(*) into v_held
      from public.messages m join public.prospects p on p.id = m.prospect_id
     where m.client_id = p_client_id and m.approval_status = 'approved' and m.send_status = 'not_sent'
       and public.is_send_rule_held(p.email, m.campaign_id, m.client_id);
    select count(*) into v_blocked from public.message_block_reasons r
     where r.client_id = p_client_id and r.reason <> 'waiting_followup_timing';
  end if;

  v_in_window := v_sandbox or extract(isodow from v_now_local) <= 5
                 and v_now_local::time >= time '09:00' and v_now_local::time < time '17:00';

  -- Estimated clear date for the ready queue.
  if v_ready > 0 and v_has_mailbox and v_cap > 0 and (v_paused is null or v_paused <= now()) then
    for v_off in 0..365 loop
      v_day := v_today + v_off;
      if v_sandbox or extract(isodow from v_day) <= 5 then
        if v_off = 0 then
          if v_now_local::time >= time '17:00' and not v_sandbox then
            v_capd := 0;
          else
            v_capd := greatest(0, v_cap - v_sent_today);
          end if;
        elsif v_ramp then
          v_capd := case when (v_idx + v_off) < 7 then 5 when (v_idx + v_off) < 14 then 10
                         when (v_idx + v_off) < 21 then 20 when (v_idx + v_off) < 28 then 30 else 40 end;
        else
          v_capd := 40;
        end if;
        v_acc := v_acc + v_capd;
        if v_acc >= v_ready then v_finish := v_day; exit; end if;
      end if;
    end loop;
  end if;

  -- Next warm-up step.
  if v_ramp and v_idx < 28 then
    v_next_in := case when v_idx < 7 then 7 when v_idx < 14 then 14 when v_idx < 21 then 21 else 28 end - v_idx;
    v_next_cap := case (v_idx + v_next_in) when 7 then 10 when 14 then 20 when 21 then 30 else 40 end;
    v_next_date := v_today + v_next_in;
  end if;

  v_ladder := (select jsonb_agg(jsonb_build_object('cap', t.c, 'starts_on', (v_today - v_idx + t.d)) order by t.d)
                 from (values (0, 5), (7, 10), (14, 20), (21, 30), (28, 40)) as t(d, c));

  return jsonb_build_object(
    'ok', true,
    'is_admin', v_admin,
    'is_sandbox', v_sandbox,
    'time_zone', v_tz,
    'window', jsonb_build_object('start', '09:00', 'end', '17:00', 'days', 'Mon-Fri'),
    'mailbox_connected', v_has_mailbox,
    'paused_until', case when v_paused is not null and v_paused > now() then v_paused end,
    'warmup', jsonb_build_object(
        'mode', v_mode,
        'active', (v_ramp and v_idx < 28),
        'day', v_idx,
        'next_step_cap', v_next_cap,
        'next_step_date', v_next_date,
        'ladder', v_ladder),
    'today', jsonb_build_object(
        'cap', v_cap,
        'sent', v_sent_today,
        'remaining', greatest(0, v_cap - v_sent_today),
        'in_window_now', v_in_window),
    'queue', jsonb_build_object(
        'ready', v_ready,
        'ready_first_emails', v_ready_first,
        'ready_follow_ups', v_ready_fu,
        'waiting_for_date', v_waiting,
        'estimated_clear_date', v_finish),
    'follow_ups', jsonb_build_object(
        'awaiting_approval', v_fu_await,
        'scheduled', v_fu_sched,
        'next_due', v_fu_next),
    'admin', case when v_admin then jsonb_build_object(
        'held_by_send_rules', v_held, 'blocked_total', v_blocked) end
  );
end; $function$;
