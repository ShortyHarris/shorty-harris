-- The sandbox clock moves hours as well as days, and sandboxes can test sending hours.
--
-- The clock works by moving the account's timeline back (all its timestamps), so every
-- elapsed-time rule runs unchanged. Time of day and weekday cannot be faked that way,
-- so a sandbox also carries a clock offset: its "now" is now() + offset. The offset is
-- read only where the time of day or the calendar date matters (the send window and
-- "sent today"). sandbox_clock_offset() is zero for every non-sandbox client, so real
-- clients' sending is computed exactly as before.
--
--  * clients.sandbox_minutes_advanced: total offset in minutes (days stay in
--    sandbox_days_advanced as whole days, for existing readers).
--  * sandbox_shift_clock(client, minutes): the one place that moves the timeline;
--    sandbox_advance_time (days) and sandbox_advance_hours (hours) call it, and
--    sandbox_jump_to_send_window moves to the next weekday 09:00 on the sandbox clock.
--  * Send window for sandboxes: applied when clients.sandbox_warmup is on (now "real
--    sending rules": warm-up and 9-5 Mon-Fri), skipped in fast mode.
--  * client_send_limits gains clock_offset_minutes and sandbox_fast for WF2.5, which
--    (n8n, changed live in the same step) uses them for the window and the day count.
--
-- Applied live as 20261104233000; statements exactly as applied.

alter table public.clients add column if not exists sandbox_minutes_advanced integer not null default 0;
update public.clients set sandbox_minutes_advanced = sandbox_days_advanced * 1440
 where is_sandbox and sandbox_minutes_advanced = 0 and sandbox_days_advanced <> 0;

create or replace function public.sandbox_clock_offset(p_client_id uuid)
 returns interval
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select make_interval(mins => c.sandbox_minutes_advanced)
                     from public.clients c where c.id = p_client_id and c.is_sandbox), interval '0');
$function$;

create or replace function public.sandbox_shift_clock(p_client_id uuid, p_minutes integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sandbox boolean;
  v_tbl text;
  v_set text;
  v_rows bigint;
  v_shifted bigint := 0;
  v_total integer;
  v_due integer;
  v_iv interval := make_interval(mins => p_minutes);
  v_tables text[] := array['messages','follow_up_schedules','replies','hot_leads','prospects',
                           'notifications','approval_reminder_log','credit_transactions',
                           'payments','campaigns','mailbox_events'];
begin
  select is_sandbox into v_sandbox from clients where id = p_client_id;
  if not coalesce(v_sandbox, false) then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_client');
  end if;
  if not (public.is_admin() or public.can_manage_client(p_client_id) or public.is_trusted_backend()) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 60 * 1440 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount', 'detail', 'Advance between 1 minute and 60 days.');
  end if;

  foreach v_tbl in array v_tables loop
    select string_agg(format('%I = %I - $2', c.column_name, c.column_name), ', ')
      into v_set
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = v_tbl
       and c.data_type = 'timestamp with time zone';
    if v_set is not null and exists (select 1 from information_schema.columns
                                      where table_schema = 'public' and table_name = v_tbl and column_name = 'client_id') then
      execute format('update public.%I set %s where client_id = $1', v_tbl, v_set) using p_client_id, v_iv;
      get diagnostics v_rows = row_count;
      v_shifted := v_shifted + v_rows;
    end if;
  end loop;

  -- The mailbox's warm-up start and pause windows move with the timeline too.
  update client_email_credentials
     set warmup_started_at = warmup_started_at - v_iv,
         paused_until = paused_until - v_iv,
         health_reset_at = health_reset_at - v_iv
   where client_id = p_client_id;

  update clients
     set sandbox_minutes_advanced = sandbox_minutes_advanced + p_minutes,
         sandbox_days_advanced = (sandbox_minutes_advanced + p_minutes) / 1440
   where id = p_client_id returning sandbox_minutes_advanced into v_total;

  select count(*) into v_due from follow_up_schedules
   where client_id = p_client_id and status = 'pending' and due_at <= now();

  -- WF5 writes the due follow-ups. It only works on business days (real calendar),
  -- so on a weekend the drafts appear on Monday's run.
  perform public.sandbox_fire('wf5-run', jsonb_build_object('client_id', p_client_id));

  return jsonb_build_object('ok', true, 'minutes', p_minutes, 'total_minutes_advanced', v_total,
    'rows_shifted', v_shifted, 'follow_ups_due', v_due,
    'weekend', extract(isodow from now() at time zone 'America/Chicago') > 5);
end;
$function$;
revoke all on function public.sandbox_shift_clock(uuid, integer) from public, anon, authenticated;
grant execute on function public.sandbox_shift_clock(uuid, integer) to service_role;

-- Shared wording for the three clock buttons.
create or replace function public.sandbox_clock_message(p_client_id uuid, p_moved text, r jsonb)
 returns jsonb
 language sql
 volatile security definer
 set search_path to 'public'
as $function$
  select case when coalesce((r->>'ok')::boolean, false) then r || jsonb_build_object(
    'total_days_advanced', (r->>'total_minutes_advanced')::int / 1440,
    'detail', 'Moved ' || p_moved || '. Sandbox time is now '
      || to_char((now() + public.sandbox_clock_offset(p_client_id))
                 at time zone coalesce((select nullif(send_timezone, '') from clients where id = p_client_id), 'America/Chicago'),
                 'Dy DD Mon, HH24:MI') || '. '
      || case when (r->>'follow_ups_due')::int > 0
           then (r->>'follow_ups_due') || ' follow-up' || case when (r->>'follow_ups_due')::int = 1 then ' is' else 's are' end || ' now due'
                || case when (r->>'weekend')::boolean then ': the follow-up engine only runs on business days, so the drafts appear on Monday.'
                        else ' and the follow-up engine was run. Drafts appear in Approvals shortly.' end
           else 'No follow-ups are due yet.' end)
  else r end;
$function$;
revoke all on function public.sandbox_clock_message(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.sandbox_advance_time(p_client_id uuid, p_days integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r jsonb;
begin
  if p_days is null or p_days < 1 or p_days > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_days', 'detail', 'Advance between 1 and 60 days.');
  end if;
  -- Shift first, then word the message in a separate statement so it sees the new clock.
  r := public.sandbox_shift_clock(p_client_id, p_days * 1440);
  return public.sandbox_clock_message(p_client_id, p_days || ' day' || case when p_days = 1 then '' else 's' end || ' forward', r);
end;
$function$;

create or replace function public.sandbox_advance_hours(p_client_id uuid, p_hours integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r jsonb;
begin
  if p_hours is null or p_hours < 1 or p_hours > 72 then
    return jsonb_build_object('ok', false, 'error', 'invalid_hours', 'detail', 'Advance between 1 and 72 hours.');
  end if;
  r := public.sandbox_shift_clock(p_client_id, p_hours * 60);
  return public.sandbox_clock_message(p_client_id, p_hours || ' hour' || case when p_hours = 1 then '' else 's' end || ' forward', r);
end;
$function$;
revoke all on function public.sandbox_advance_hours(uuid, integer) from public, anon;
grant execute on function public.sandbox_advance_hours(uuid, integer) to authenticated, service_role;

-- Next weekday 09:00 on the sandbox clock, in the account's send time zone.
create or replace function public.sandbox_jump_to_send_window(p_client_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tz text;
  v_local timestamp;
  v_target timestamp;
  v_minutes integer;
  r jsonb;
begin
  select coalesce(nullif(send_timezone, ''), 'America/Chicago') into v_tz from clients where id = p_client_id;
  if v_tz is null then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;
  v_local := (now() + public.sandbox_clock_offset(p_client_id)) at time zone v_tz;
  v_target := v_local::date + time '09:00';
  if v_target <= v_local then v_target := v_target + interval '1 day'; end if;
  while extract(isodow from v_target) > 5 loop v_target := v_target + interval '1 day'; end loop;
  v_minutes := greatest(1, ceil(extract(epoch from (v_target - v_local)) / 60)::int);
  r := public.sandbox_shift_clock(p_client_id, v_minutes);
  return public.sandbox_clock_message(p_client_id,
    'to ' || to_char(v_target, 'Dy') || ' 09:00 (' || (v_minutes / 60) || 'h ' || (v_minutes % 60) || 'm)', r);
end;
$function$;
revoke all on function public.sandbox_jump_to_send_window(uuid) from public, anon;
grant execute on function public.sandbox_jump_to_send_window(uuid) to authenticated, service_role;

-- Reset puts the hour offset back too.
do $mig$
declare d text := pg_get_functiondef('public.sandbox_reset'::regproc);
  a text := '  update clients set sandbox_days_advanced = 0 where id = p_client_id;';
begin
  if position(a in d) = 0 then raise exception 'sandbox_reset: anchor not found'; end if;
  execute replace(d, a, '  update clients set sandbox_days_advanced = 0, sandbox_minutes_advanced = 0 where id = p_client_id;');
end $mig$;

-- send_pacing: sandbox time of day and "today" follow the sandbox clock; the window is
-- skipped only in fast mode. For real clients the offset is zero and v_fast is false.
do $mig$
declare d text := pg_get_functiondef('public.send_pacing'::regproc);
  pairs text[][] := array[
    array['  v_sandbox boolean;', '  v_sandbox boolean; v_fast boolean; v_clk interval;'],
    array['  v_now_local := now() at time zone v_tz;',
          '  v_clk := public.sandbox_clock_offset(p_client_id);' || chr(10) || '  v_now_local := (now() + v_clk) at time zone v_tz;'],
    array['  if v_sandbox and not coalesce((select c.sandbox_warmup from public.clients c where c.id = p_client_id), true) then v_mode := ''warm''; end if;',
          '  v_fast := v_sandbox and not coalesce((select c.sandbox_warmup from public.clients c where c.id = p_client_id), true);' || chr(10) || '  if v_fast then v_mode := ''warm''; end if;'],
    array['and (m.sent_at at time zone v_tz)::date = v_today;', 'and ((m.sent_at + v_clk) at time zone v_tz)::date = v_today;'],
    array['v_in_window := v_sandbox or extract', 'v_in_window := v_fast or extract'],
    array['if v_sandbox or extract(isodow from v_day) <= 5 then', 'if v_fast or extract(isodow from v_day) <= 5 then'],
    array['and not v_sandbox then', 'and not v_fast then']];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    if position(pairs[i][1] in d) = 0 then raise exception 'send_pacing: anchor % not found', i; end if;
    d := replace(d, pairs[i][1], pairs[i][2]);
  end loop;
  execute d;
end $mig$;

create or replace view public.client_send_limits with (security_invoker = true) as
 select cl.id,
    cl.send_timezone,
    mailbox_daily_cap(cl.id) as daily_cap,
    case when cl.is_sandbox and not cl.sandbox_warmup then 'warm'::text
         else coalesce(( select c.warmup_mode
                from client_email_credentials c
               where c.client_id = cl.id and c.status = 'active'::text
               order by c.created_at
              limit 1), 'warm'::text) end as warmup_mode,
    cl.is_sandbox,
    case when cl.is_sandbox then cl.sandbox_minutes_advanced else 0 end as clock_offset_minutes,
    (cl.is_sandbox and not cl.sandbox_warmup) as sandbox_fast
   from clients cl;

-- Applied live as a second step (sandbox_rules_wording): the switch's message now
-- describes both rules it controls.
create or replace function public.sandbox_set_warmup(p_client_id uuid, p_on boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce((select is_sandbox from clients where id = p_client_id), false) then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_client');
  end if;
  if not (public.is_admin() or public.can_manage_client(p_client_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  update clients set sandbox_warmup = coalesce(p_on, true) where id = p_client_id;
  return jsonb_build_object('ok', true, 'warmup', coalesce(p_on, true),
    'detail', case when coalesce(p_on, true)
      then 'Real sending rules on: warm-up limits (' || public.mailbox_daily_cap(p_client_id) || ' today), spacing between sends, and 9am to 5pm Mon-Fri on the sandbox clock.'
      else 'Fast testing mode: up to 100 emails a day at any hour, with no spacing.' end);
end;
$function$;
