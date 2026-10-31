create or replace function public.is_generic_mailbox(e text) returns boolean
language sql immutable set search_path to 'public' as $$
  select split_part(lower(coalesce(e,'')),'@',1) ~ '^(info|office|kancelar|kancelář|podatelna|elpodatelna|recepce|reception|sekretariat|obchod|sprava|správa|kontakt|contact|hello|hi|support|podpora|fakturace|ucetni|ucetnictvi|dispecink|informace|objednavky|poptavka|poptavky|zakaznicky|helpdesk|admin|sales|marketing|mzdy|ekonom|vybor|výbor|concierge|email|mail|post|team|reditel|jednatel|servis|provoz|predstavenstvo)([._-].*)?$'
$$;

create or replace view public.sendable_messages as
select m.id, m.prospect_id, m.campaign_id, m.client_id, m.channel, m.subject, m.body, m.message_type,
       m.approval_status, m.approved_by, m.approved_at, m.send_status, m.scheduled_for, m.sent_at,
       m.gmail_message_id, m.gmail_thread_id, m.created_at, m.updated_at, m.opened_at, m.open_count,
       m.last_opened_at, m.send_claimed_at
from public.messages m
join public.prospects p on p.id = m.prospect_id
left join public.campaigns c on c.id = m.campaign_id
where m.approval_status = 'approved' and m.send_status = 'not_sent'
  and p.pipeline_status <> all (array['replied','hot_lead','won','lost','called','bounced'])
  and p.sequence_paused = false
  and coalesce(c.status,'active') <> all (array['paused','cancelled','draft'])
  and not exists (select 1 from public.do_not_contact d where lower(d.email) = lower(p.email))
  and not (coalesce(c.language,'') = 'Czech' and public.is_generic_mailbox(p.email))
  and (m.message_type = 'initial' or exists (
        select 1 from public.messages prev
        where prev.prospect_id = m.prospect_id and prev.send_status = 'sent'
          and prev.message_type = case m.message_type
                when 'follow_up_d3' then 'initial' when 'follow_up_d7' then 'follow_up_d3'
                when 'follow_up_d14' then 'follow_up_d7' else null end
          and public.add_business_days(prev.sent_at, case m.message_type
                when 'follow_up_d3' then 3 when 'follow_up_d7' then 5 else 7 end) <= now()));