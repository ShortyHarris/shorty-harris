create or replace function public.honour_optout_language()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text;
  v_prospect_id uuid;
begin
  if new.body is null or not public.reply_has_optout(new.body) then
    return new;
  end if;

  select email, id into v_email, v_prospect_id
  from public.prospects where id = new.prospect_id;

  if v_email is null then
    return new;
  end if;

  insert into public.do_not_contact (email, reason, source_prospect_id)
  values (lower(v_email), 'opt_out', v_prospect_id)
  on conflict (lower(email)) where email is not null do nothing;

  update public.follow_up_schedules
    set status = 'cancelled', updated_at = now()
    where prospect_id = v_prospect_id and status in ('pending', 'generating');

  update public.messages
    set send_status = 'blocked_dnc', updated_at = now()
    where prospect_id = v_prospect_id
      and send_status in ('not_sent', 'queued', 'scheduled');

  return new;
end;
$function$;