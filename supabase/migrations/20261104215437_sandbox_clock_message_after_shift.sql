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