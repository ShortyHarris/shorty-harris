-- send_pacing(): one read-only answer to "what is going to be sent, and when?"
-- for the client dashboard and the admin client page. It mirrors, and does not
-- replace, the rules the real sender (WF2.5) enforces:
--   * weekdays only, 09:00-17:00 in the client's send_timezone
--   * daily cap from mailbox_daily_cap(): warm-up ladder 5/10/20/30/40 by
--     calendar day since the first send, or 40 flat when warmup_mode = 'warm'
--   * the cap counts ALL sends today, first emails and follow-ups alike
-- The estimated clear date counts weekdays only (the sender does not skip public
-- holidays) and covers the ready queue alone. Follow-ups that fall due later
-- share the same daily cap, so it is an estimate, not a promise.
--
-- SECURITY DEFINER because mailbox state lives in client_email_credentials. The
-- output is aggregates only: counts, dates and the warm-up step. No addresses,
-- bodies or tokens are returned, so the single can_manage_client() gate is an
-- acceptable sole guard here, unlike approved_queue which returns row content.
-- Admins additionally get the count held by send rules; clients never do.
create or replace function public.send_pacing(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_admin boolean := public.is_admin();
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

  v_in_window := extract(isodow from v_now_local) <= 5
                 and v_now_local::time >= time '09:00' and v_now_local::time < time '17:00';

  -- Estimated clear date for the ready queue.
  if v_ready > 0 and v_has_mailbox and v_cap > 0 and (v_paused is null or v_paused <= now()) then
    for v_off in 0..365 loop
      v_day := v_today + v_off;
      if extract(isodow from v_day) <= 5 then
        if v_off = 0 then
          if v_now_local::time >= time '17:00' then
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

revoke all on function public.send_pacing(uuid) from public, anon;
grant execute on function public.send_pacing(uuid) to authenticated, service_role;