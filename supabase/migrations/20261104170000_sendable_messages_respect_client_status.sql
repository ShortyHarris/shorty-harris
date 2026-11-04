-- Applied to production 2026-11-04.
--
-- Setting a client to "Paused" in the admin did nothing. This gate checked
-- campaign status, prospect pause, bounces, do-not-contact and country holds,
-- but never the client's own status, so a client marked Paused kept sending
-- exactly as before. The label said paused and nothing paused.
--
-- Only an active client sends now, so Paused, Churned and Draft all hold mail.
-- All six clients were active when this was applied, so it changed nothing on
-- the day: the sendable count was 439 before and after.
create or replace view public.sendable_messages as
  select m.id, m.prospect_id, m.campaign_id, m.client_id, m.channel, m.subject,
         m.body, m.message_type, m.approval_status, m.approved_by, m.approved_at,
         m.send_status, m.scheduled_for, m.sent_at, m.gmail_message_id,
         m.gmail_thread_id, m.created_at, m.updated_at, m.opened_at,
         m.open_count, m.last_opened_at, m.send_claimed_at
  from messages m
    join prospects p on p.id = m.prospect_id
    left join campaigns c on c.id = m.campaign_id
    left join clients cl on cl.id = m.client_id
  where m.approval_status = 'approved'
    and m.send_status = 'not_sent'
    and coalesce((select ps.unsubscribe_ok from platform_settings ps where ps.id = 1), true)
    and coalesce(cl.status, 'active') = 'active'
    and p.pipeline_status <> all (array['replied','hot_lead','won','lost','called','bounced'])
    and p.sequence_paused = false
    and (m.message_type = 'initial' or p.followups_stopped = false)
    and coalesce(c.status, 'active') <> all (array['paused','cancelled','draft'])
    and not exists (select 1 from do_not_contact d where lower(d.email) = lower(p.email))
    and not (((coalesce(c.language, '') = 'Czech') or is_eu_country(coalesce(c.country, cl.country)))
             and ((is_generic_mailbox(p.email) and not coalesce(cl.allow_generic_mailboxes, false))
                  or is_freemail(p.email)))
    and not exists (select 1 from country_send_holds h
                     where h.cleared = false
                       and h.country = upper(coalesce(c.country, cl.country, '')))
    and (m.message_type = 'initial'
         or exists (select 1 from messages prev
                     where prev.prospect_id = m.prospect_id
                       and prev.send_status = 'sent'
                       and prev.message_type = case m.message_type
                             when 'follow_up_d3' then 'initial'
                             when 'follow_up_d7' then 'follow_up_d3'
                             when 'follow_up_d14' then 'follow_up_d7'
                             else null end
                       and add_business_days(prev.sent_at,
                             case m.message_type
                               when 'follow_up_d3' then 3
                               when 'follow_up_d7' then 5
                               else 7 end,
                             coalesce(cl.send_timezone, 'America/Chicago'),
                             upper(coalesce(nullif(c.country, ''), nullif(cl.country, ''), 'US'))) <= now()));
