create table if not exists public.approval_reminder_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  reminder_date date not null,
  pending_prospects integer not null,
  is_first boolean not null default false,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  recipient text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- One live reminder per client per (Denver) day: the insert is the claim.
create unique index if not exists approval_reminder_one_per_day
  on public.approval_reminder_log (client_id, reminder_date)
  where status in ('pending','sent');

alter table public.approval_reminder_log enable row level security;
revoke all on public.approval_reminder_log from anon, authenticated;

-- Clients who should be reminded right now: weekdays, 8:00 to 16:59 Denver time,
-- at least one real prospect still awaiting approval, a contact email on file,
-- and no live reminder yet today. Disappears on its own once nothing is pending.
create or replace view public.approval_reminders_due as
with local_now as (select (now() at time zone 'America/Denver') as t),
pending as (
  select m.client_id,
         count(distinct m.prospect_id)::int as prospects,
         min(m.created_at) as oldest
  from public.messages m
  join public.prospects p on p.id = m.prospect_id
  where m.approval_status = 'pending'
    and m.send_status = 'not_sent'
    and coalesce(p.is_sandbox, false) = false
    and p.pipeline_status not in ('bounced','lost','replied','hot_lead','won','called')
    and not exists (select 1 from public.do_not_contact d where lower(d.email) = lower(p.email))
  group by m.client_id
)
select c.id as client_id,
       c.business_name,
       c.contact_name,
       btrim(c.contact_email) as contact_email,
       pe.prospects as pending_prospects,
       greatest(0, floor(extract(epoch from (now() - pe.oldest)) / 86400))::int as days_waiting,
       not exists (select 1 from public.approval_reminder_log l
                   where l.client_id = c.id and l.status = 'sent') as is_first,
       ln.t::date as reminder_date
from pending pe
join public.clients c on c.id = pe.client_id
cross join local_now ln
where c.contact_email is not null and btrim(c.contact_email) <> ''
  and coalesce(c.status, 'active') = 'active'
  and extract(isodow from ln.t) between 1 and 5
  and extract(hour from ln.t) between 8 and 16
  and not exists (select 1 from public.approval_reminder_log l
                  where l.client_id = c.id and l.reminder_date = ln.t::date
                    and l.status in ('pending','sent'));

revoke all on public.approval_reminders_due from anon, authenticated;