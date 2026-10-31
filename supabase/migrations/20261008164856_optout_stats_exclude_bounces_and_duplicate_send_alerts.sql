create or replace view public.optout_stats as
 with totals as (
  select
   (select count(*) from do_not_contact where reason is distinct from 'bounce') as total_optouts,
   (select count(*) from replies where intent = 'stop') as stop_replies,
   (select count(*) from replies where intent = 'not_interested') as not_interested_replies,
   (select count(*) from do_not_contact where reason is distinct from 'bounce' and created_at >= now() - interval '7 days') as optouts_last_7_days,
   (select count(*) from do_not_contact where reason is distinct from 'bounce' and created_at >= now() - interval '30 days') as optouts_last_30_days
 )
 select total_optouts, stop_replies, not_interested_replies, optouts_last_7_days, optouts_last_30_days from totals;

create or replace view public.duplicate_send_alerts as
 -- 1. same prospect, same step, more than one message marked sent
 select 'same_step_sent_twice'::text as alert_type, m.client_id, m.prospect_id, m.message_type as detail,
        count(*)::int as occurrences, min(m.sent_at) as first_at, max(m.sent_at) as last_at
 from public.messages m
 where m.send_status = 'sent' and m.sent_at > now() - interval '30 days'
 group by m.client_id, m.prospect_id, m.message_type
 having count(*) > 1
 union all
 -- 2. several emails to one prospect within 24h (any step), catches back-to-back steps too
 select 'multiple_sends_within_24h', m.client_id, m.prospect_id, 'mixed',
        count(*)::int, min(m.sent_at), max(m.sent_at)
 from public.messages m
 where m.send_status = 'sent' and m.sent_at > now() - interval '30 days'
 group by m.client_id, m.prospect_id, date_trunc('day', m.sent_at)
 having count(*) > 1
 union all
 -- 3. claimed for sending but never marked sent: outcome unknown, may have gone out
 select 'claimed_but_unconfirmed', m.client_id, m.prospect_id, m.message_type, 1,
        m.send_claimed_at, m.send_claimed_at
 from public.messages m
 where m.send_claimed_at is not null and m.send_status <> 'sent'
   and m.send_status not in ('failed','blocked_dnc')
   and m.send_claimed_at < now() - interval '30 minutes'
   and m.send_claimed_at > now() - interval '30 days';