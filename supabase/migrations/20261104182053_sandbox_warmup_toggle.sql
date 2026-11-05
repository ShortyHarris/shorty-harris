-- Bring the mailbox warm-up back for sandboxes, so it can be tested with time travel.
-- Warm-up is driven by days since the mailbox's first send (or warmup_started_at):
-- 5/day in week 1, then 10, 20, 30, 40. sandbox_advance_time moves the first send back,
-- so advancing the clock steps the limit up exactly as production would.
--  * clients.sandbox_warmup (default true): on = the real warm-up (cap and spacing);
--    off = the fast testing mode (100/day, no spacing) used until now.
--  * The send window stays off for sandboxes either way: time travel moves dates, not
--    the hour of the day, so a window would only make testers wait.
--  * sandbox_advance_time also shifts the mailbox's warm-up and pause timestamps.
-- WF2.5 (n8n, changed live in the same step) now applies the warm-up spacing whenever
-- client_send_limits reports 'ramp', sandbox or not.
--
-- Applied live as 20261104182053; statements exactly as applied. The two DO blocks
-- edit send_pacing and sandbox_advance_time as defined in 20261104165820 and
-- 20261104181004.

alter table public.clients add column if not exists sandbox_warmup boolean not null default true;

create or replace function public.mailbox_daily_cap(p_client_id uuid)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare cred record; started timestamptz; d int;
begin
  -- Sandbox with warm-up switched off: fast testing mode.
  if exists (select 1 from public.clients where id = p_client_id and is_sandbox and not sandbox_warmup) then
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
    cl.is_sandbox
   from clients cl;

do $mig$
declare d text := pg_get_functiondef('public.send_pacing'::regproc);
  a text := '  if v_sandbox then v_mode := ''warm''; end if;';
begin
  if position(a in d) = 0 then raise exception 'send_pacing: anchor not found'; end if;
  d := replace(d, a, '  if v_sandbox and not coalesce((select c.sandbox_warmup from public.clients c where c.id = p_client_id), true) then v_mode := ''warm''; end if;');
  execute d;
end $mig$;

do $mig$
declare d text := pg_get_functiondef('public.sandbox_advance_time'::regproc);
  a text := '  update clients set sandbox_days_advanced = sandbox_days_advanced + p_days';
begin
  if position(a in d) = 0 then raise exception 'sandbox_advance_time: anchor not found'; end if;
  d := replace(d, a,
    '  -- The mailbox''s warm-up start and pause windows move with the timeline too.' || chr(10) ||
    '  update client_email_credentials' || chr(10) ||
    '     set warmup_started_at = warmup_started_at - make_interval(days => p_days),' || chr(10) ||
    '         paused_until = paused_until - make_interval(days => p_days),' || chr(10) ||
    '         health_reset_at = health_reset_at - make_interval(days => p_days)' || chr(10) ||
    '   where client_id = p_client_id;' || chr(10) || chr(10) || a);
  execute d;
end $mig$;

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
      then 'Warm-up on: real daily limits (' || public.mailbox_daily_cap(p_client_id) || ' today) and spacing between sends.'
      else 'Warm-up off: fast testing mode, up to 100 emails a day with no spacing.' end);
end;
$function$;
revoke all on function public.sandbox_set_warmup(uuid, boolean) from public, anon;
grant execute on function public.sandbox_set_warmup(uuid, boolean) to authenticated, service_role;
