alter table public.client_email_credentials
  add column if not exists warmup_mode text not null default 'ramp' check (warmup_mode in ('ramp','warm')),
  add column if not exists warmup_started_at timestamptz,
  add column if not exists paused_until timestamptz,
  add column if not exists pause_reason text,
  add column if not exists health_reset_at timestamptz,
  add column if not exists auth_check jsonb,
  add column if not exists auth_checked_at timestamptz;

create table if not exists public.mailbox_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  event_type text not null,
  detail jsonb,
  created_at timestamptz not null default now(),
  alerted_at timestamptz
);
alter table public.mailbox_events enable row level security;
revoke all on public.mailbox_events from anon, authenticated;

create or replace function public.mailbox_daily_cap(p_client_id uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare cred record; started timestamptz; d int;
begin
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
end $$;
revoke execute on function public.mailbox_daily_cap(uuid) from public, anon, authenticated;
grant execute on function public.mailbox_daily_cap(uuid) to service_role;

create or replace view public.client_send_limits with (security_invoker = true) as
select cl.id, cl.send_timezone,
       public.mailbox_daily_cap(cl.id) as daily_cap,
       coalesce((select c.warmup_mode from public.client_email_credentials c
                  where c.client_id = cl.id and c.status = 'active' order by c.created_at limit 1), 'warm') as warmup_mode
from public.clients cl;
revoke all on public.client_send_limits from anon, authenticated;
grant select on public.client_send_limits to service_role;

create or replace function public.check_mailbox_health()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; win timestamptz; s int; b int; n int := 0; reason text;
begin
  for r in select id, client_id, health_reset_at from public.client_email_credentials
            where status = 'active' and (paused_until is null or paused_until <= now())
  loop
    win := greatest(now() - interval '7 days', coalesce(r.health_reset_at, '-infinity'::timestamptz));
    select count(*) into s from public.messages
      where client_id = r.client_id and send_status = 'sent' and sent_at > win;
    select count(distinct rp.message_id) into b from public.replies rp
      join public.messages m on m.id = rp.message_id
      where rp.client_id = r.client_id and rp.intent = 'bounced' and m.sent_at > win;
    if s >= 20 and b::numeric / s > 0.03 then
      reason := format('Bounce rate %s%% (%s of %s) in the last 7 days', round(100.0 * b / s, 1), b, s);
      update public.client_email_credentials
         set paused_until = now() + interval '24 hours', pause_reason = reason,
             health_reset_at = now() + interval '24 hours'
       where id = r.id;
      insert into public.mailbox_events (client_id, event_type, detail)
        values (r.client_id, 'auto_paused', jsonb_build_object('reason', reason, 'sent', s, 'bounced', b));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.check_mailbox_health() from public, anon, authenticated;
grant execute on function public.check_mailbox_health() to service_role;

update public.client_email_credentials set warmup_mode = 'warm'
 where email_address in ('bloomingtonlaundry2@gmail.com','coffeehousenormal@gmail.com','nick@mountainsmowing.com','marcustheofficial@gmail.com');
update public.client_email_credentials set warmup_mode = 'ramp', warmup_started_at = '2026-10-19 00:00:00+00'
 where email_address = 'info@tutel.cz';

select cron.schedule('mailbox-health-hourly', '20 * * * *', $c$select public.check_mailbox_health()$c$);