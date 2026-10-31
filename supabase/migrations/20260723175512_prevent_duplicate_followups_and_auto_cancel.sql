
-- 1. Only one non-rejected, not-yet-sent message per prospect+type going forward.
--    (Historical rows that were already both actually sent are left alone — can't undo a sent email —
--    but no new duplicate can ever be queued/approved again.)
create unique index if not exists messages_prospect_type_active_uniq
  on messages (prospect_id, message_type)
  where approval_status <> 'rejected' and send_status <> 'sent';

-- 2. Only one active (pending/generating) follow-up schedule per prospect at a time
create unique index if not exists follow_up_schedules_one_active_per_prospect
  on follow_up_schedules (prospect_id)
  where status in ('pending','generating');

-- 3. Auto-cancel remaining follow-ups when a message is rejected, or when a prospect
--    replies / is marked hot_lead / won / lost — covers "reject stops the chain" and
--    "not_interested reply stops the chain" regardless of which app/workflow made the change.
create or replace function public.cancel_follow_ups_on_stop() returns trigger as $$
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
    if NEW.pipeline_status in ('replied','hot_lead','won','lost')
       and OLD.pipeline_status is distinct from NEW.pipeline_status then
      update follow_up_schedules
      set status = 'cancelled', updated_at = now()
      where prospect_id = NEW.id and status in ('pending','generating');
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_cancel_followups_on_message_reject on messages;
create trigger trg_cancel_followups_on_message_reject
after update on messages
for each row execute function public.cancel_follow_ups_on_stop();

drop trigger if exists trg_cancel_followups_on_prospect_status on prospects;
create trigger trg_cancel_followups_on_prospect_status
after update on prospects
for each row execute function public.cancel_follow_ups_on_stop();
