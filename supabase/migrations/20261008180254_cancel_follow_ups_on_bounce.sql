create or replace function public.cancel_follow_ups_on_stop()
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
    if NEW.pipeline_status in ('replied','hot_lead','won','lost','called','bounced')
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

update public.follow_up_schedules f
set status = 'cancelled', updated_at = now()
from public.prospects p
where p.id = f.prospect_id
  and p.pipeline_status = 'bounced'
  and f.status in ('pending','generating');