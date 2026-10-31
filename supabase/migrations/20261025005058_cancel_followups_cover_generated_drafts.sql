
create or replace function public.cancel_follow_ups_on_stop()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
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
    if NEW.pipeline_status in ('replied','hot_lead','won','lost','called','bounced')
       and OLD.pipeline_status is distinct from NEW.pipeline_status then
      -- 1) schedules not yet turned into drafts
      update follow_up_schedules
      set status = 'cancelled', updated_at = now()
      where prospect_id = NEW.id and status in ('pending','generating');

      -- 2) follow-up drafts already generated but not sent: reject them so they leave
      --    the approval queue and can never be sent, and cancel their schedules
      update messages
      set approval_status = 'rejected', updated_at = now()
      where prospect_id = NEW.id and message_type <> 'initial'
        and send_status = 'not_sent' and approval_status in ('pending','approved');

      update follow_up_schedules s
      set status = 'cancelled', updated_at = now()
      where s.prospect_id = NEW.id and s.status = 'generated'
        and s.due_at > now() - interval '1 hour'
        and not exists (select 1 from messages m where m.prospect_id = NEW.id and m.message_type <> 'initial' and m.send_status = 'sent' and m.sent_at >= s.due_at - interval '1 day');
    end if;
    return NEW;
  end if;
  return NEW;
end;
$function$;

-- One-off cleanup: generated schedules of already-stopped prospects that never sent
update follow_up_schedules s
set status = 'cancelled', updated_at = now()
from prospects p
where p.id = s.prospect_id and s.status = 'generated'
  and p.pipeline_status in ('replied','hot_lead','won','lost','called','bounced')
  and not exists (select 1 from messages m where m.prospect_id = s.prospect_id and m.message_type <> 'initial' and m.send_status in ('sent','queued') and m.sent_at >= s.due_at - interval '1 day');
