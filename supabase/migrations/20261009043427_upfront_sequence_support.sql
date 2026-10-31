alter table public.campaigns add column if not exists upfront_sequence boolean not null default false;

-- A follow-up can exist only once per prospect and step (new rows only; 24 historic duplicate groups predate this).
create unique index if not exists messages_one_followup_per_step
  on public.messages (prospect_id, message_type)
  where message_type <> 'initial'
    and send_status <> 'failed'
    and approval_status <> 'rejected'
    and created_at >= timestamptz '2026-10-09 00:00:00+00';

-- Prospects whose campaign writes the whole sequence upfront and who still lack follow-ups.
create or replace view public.sequence_writer_queue as
select p.id as prospect_id, p.client_id, p.campaign_id, p.business_name, p.category, p.contact_name,
       p.unsubscribe_token, s.step as message_type, s.day_label
from public.prospects p
join public.campaigns c on c.id = p.campaign_id and c.upfront_sequence = true and c.status = 'active'
cross join (values ('follow_up_d3', 3), ('follow_up_d7', 7), ('follow_up_d14', 14)) as s(step, day_label)
where coalesce(p.is_sandbox, false) = false
  and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced','generation_failed','new','generating')
  and exists (select 1 from public.messages i where i.prospect_id = p.id and i.message_type = 'initial'
              and i.approval_status <> 'rejected' and i.send_status <> 'failed')
  and not exists (select 1 from public.messages f where f.prospect_id = p.id and f.message_type = s.step
                  and f.approval_status <> 'rejected' and f.send_status <> 'failed')
  and not exists (select 1 from public.do_not_contact d where lower(d.email) = lower(p.email));
revoke all on public.sequence_writer_queue from public, anon, authenticated;