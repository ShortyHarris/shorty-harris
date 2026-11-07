create or replace function public.follow_up_due_from_send_gate()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_prev_type text := case new.follow_up_day when 3 then 'initial' when 7 then 'follow_up_d3' when 14 then 'follow_up_d7' end;
  v_gap int := case new.follow_up_day when 3 then 3 when 7 then 5 when 14 then 7 end;
  v_prev record;
begin
  if v_prev_type is null then
    return new;
  end if;
  select m.sent_at, cl.send_timezone, c.country as campaign_country, cl.country as client_country
    into v_prev
    from messages m
    left join campaigns c on c.id = m.campaign_id
    left join clients cl on cl.id = m.client_id
   where m.prospect_id = new.prospect_id
     and m.message_type = v_prev_type
     and m.send_status = 'sent'
   order by m.sent_at desc
   limit 1;
  if v_prev.sent_at is null then
    return new;
  end if;
  new.due_at := add_business_days(
    v_prev.sent_at, v_gap,
    coalesce(v_prev.send_timezone, 'America/Chicago'),
    upper(coalesce(nullif(v_prev.campaign_country, ''), nullif(v_prev.client_country, ''), 'US')));
  return new;
end;
$function$;

drop trigger if exists follow_up_due_matches_send_gate on public.follow_up_schedules;
create trigger follow_up_due_matches_send_gate
  before insert on public.follow_up_schedules
  for each row execute function public.follow_up_due_from_send_gate();