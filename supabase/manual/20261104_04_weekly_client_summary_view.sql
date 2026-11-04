-- One row per client with last week's outreach figures, read by the n8n workflow
-- "WF28 - Weekly Client Summary" (Oct 7 feedback item 14). Read-only view: it
-- changes no data. Automated replies, out-of-office and bounces are not counted
-- as replies. Opens are an estimate (privacy features hide or fake opens).
--
-- Window: the 7 days before now; prev_* = the 7 days before that.

create or replace view public.weekly_client_summary as
with w as (
  select now() - interval '7 days' as since, now() as until, now() - interval '14 days' as prev_since
),
human_intents as (
  select unnest(array['automated','auto_reply','out_of_office','bounced']) as intent
)
select
  c.id as client_id,
  c.business_name,
  coalesce(nullif(trim(c.contact_name), ''), c.business_name) as greeting_name,
  c.contact_email,
  coalesce(nullif(c.send_timezone, ''), 'America/Chicago') as send_timezone,
  (select since from w) as period_start,
  (select until from w) as period_end,
  (select count(*) from public.messages m
    where m.client_id = c.id and m.send_status = 'sent'
      and m.sent_at >= (select since from w)) as emails_sent,
  (select count(distinct m.prospect_id) from public.messages m
    where m.client_id = c.id and m.send_status = 'sent'
      and m.sent_at >= (select since from w)) as prospects_contacted,
  (select count(*) from public.messages m
    where m.client_id = c.id and m.opened_at >= (select since from w)) as emails_opened,
  (select count(*) from public.replies r
    where r.client_id = c.id and r.received_at >= (select since from w)
      and r.intent is not null and r.intent not in (select intent from human_intents)) as replies,
  (select count(*) from public.replies r
    where r.client_id = c.id and r.received_at >= (select since from w)
      and r.intent = 'interested') as positive_replies,
  (select count(*) from public.do_not_contact d
     join public.prospects p on p.id = d.source_prospect_id
    where p.client_id = c.id and d.reason in ('opt_out', 'stop_request')
      and d.created_at >= (select since from w)) as unsubscribes,
  (select count(distinct m.prospect_id) from public.messages m
     join public.prospects p on p.id = m.prospect_id
    where m.client_id = c.id and m.approval_status = 'pending' and m.send_status = 'not_sent'
      and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')) as prospects_awaiting_approval,
  (select count(*) from public.campaigns k
    where k.client_id = c.id and k.status = 'active') as active_campaigns,
  (select count(*) from public.campaigns k
    where k.client_id = c.id and (k.status = 'paused' or k.scrape_status in ('error','failed'))) as campaigns_needing_attention,
  (select count(*) from public.messages m
    where m.client_id = c.id and m.send_status = 'sent'
      and m.sent_at >= (select prev_since from w) and m.sent_at < (select since from w)) as prev_emails_sent,
  (select count(*) from public.replies r
    where r.client_id = c.id and r.received_at >= (select prev_since from w) and r.received_at < (select since from w)
      and r.intent is not null and r.intent not in (select intent from human_intents)) as prev_replies
from public.clients c
where c.status = 'active';

-- Backend only: the workflow reads it with the service role. Clients see their own
-- figures in the app's analytics instead.
revoke all on public.weekly_client_summary from public, anon, authenticated;
