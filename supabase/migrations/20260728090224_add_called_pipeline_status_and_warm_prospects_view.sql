-- Allow a 'called' status: client manually reached this prospect by phone.
alter table prospects drop constraint prospects_pipeline_status_check;
alter table prospects add constraint prospects_pipeline_status_check
  check (pipeline_status = any (array['new','contacted','replied','hot_lead','won','lost','generation_failed','message_pending','generating','called']));

-- Extend the existing follow-up-cancellation trigger so marking someone 'called'
-- also cancels their pending follow-up chain, same as a reply would.
create or replace function cancel_follow_ups_on_stop()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if TG_TABLE_NAME = 'messages' then
    if NEW.approval_status = 'rejected' and OLD.approval_status is distinct from 'rejected' then
      update follow_up_schedules
      set status = 'cancelled', updated_at = now()
      where prospect_id = NEW.prospect_id and status in ('pending','generating');
    end if;
    return NEW;
  end if;

  if TG_TABLE_NAME = 'prospects' then
    if NEW.pipeline_status in ('replied','hot_lead','won','lost','called')
       and OLD.pipeline_status is distinct from NEW.pipeline_status then
      update follow_up_schedules
      set status = 'cancelled', updated_at = now()
      where prospect_id = NEW.id and status in ('pending','generating');
    end if;
    return NEW;
  end if;

  return NEW;
end;
$function$;

-- Warm prospects: opened multiple times, never replied. security_invoker so it
-- respects each caller's existing RLS on prospects/messages rather than needing
-- its own policy.
create or replace view warm_prospects
with (security_invoker = true) as
select
  p.id as prospect_id,
  p.client_id,
  p.campaign_id,
  p.business_name,
  p.phone,
  p.email,
  p.category,
  p.location,
  coalesce(sum(m.open_count), 0) as total_opens,
  max(m.opened_at) as last_opened_at,
  min(m.sent_at) as first_sent_at
from prospects p
join messages m on m.prospect_id = p.id and m.send_status = 'sent'
where p.pipeline_status = 'contacted'
group by p.id
having coalesce(sum(m.open_count), 0) >= 2
order by total_opens desc;