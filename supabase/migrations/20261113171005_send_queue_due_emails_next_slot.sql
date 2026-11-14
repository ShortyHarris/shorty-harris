-- Send queue: an email whose estimated send time has already passed (a follow-up that fell due,
-- or a first email whose slot went by) goes out on the sender's next run inside the send window,
-- not "today" when today's window is over. send_queue now shows that next slot: now, while today
-- is a send day in the 09:00-17:00 window; otherwise 09:00 on the next business day of the email's
-- send country, in the client's time zone. 'due' marks those rows.

create or replace function public.next_send_slot(p_tz text, p_country text)
 returns timestamptz
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_local timestamp := now() at time zone p_tz; v_day date := v_local::date;
begin
  if public.is_business_day(v_day, p_country) and v_local::time < time '17:00' then
    return greatest(now(), (v_day + time '09:00') at time zone p_tz);
  end if;
  loop
    v_day := v_day + 1;
    exit when public.is_business_day(v_day, p_country);
  end loop;
  return (v_day + time '09:00') at time zone p_tz;
end; $function$;
revoke all on function public.next_send_slot(text, text) from public, anon;
grant execute on function public.next_send_slot(text, text) to authenticated, service_role;

do $mig$
declare d text := pg_get_functiondef('public.send_queue(uuid,uuid,text,text,text,integer,integer)'::regprocedure);
  a1 text := '    select s.message_id, s.estimated_send_at, s.is_confirmed, s.basis';
  b1 text := '    select s.message_id, s.is_confirmed, s.basis,'                                   || chr(10) ||
             '           (s.estimated_send_at < now()) as due,'                                     || chr(10) ||
             '           case when s.estimated_send_at < now()'                                     || chr(10) ||
             '                then public.next_send_slot(vc.tz, public.send_country(s_m.campaign_id, vc.client_id))' || chr(10) ||
             '                else s.estimated_send_at end as estimated_send_at';
  a2 text := '      from (select distinct client_id from visible) vc'                                || chr(10) ||
             '      cross join lateral public.approvals_schedule(vc.client_id) s';
  b2 text := '      from (select distinct client_id, tz from visible) vc'                            || chr(10) ||
             '      cross join lateral public.approvals_schedule(vc.client_id) s'                      || chr(10) ||
             '      join public.messages s_m on s_m.id = s.message_id';
  a3 text := 'select v.*, s.estimated_send_at, coalesce(s.is_confirmed, false) as is_confirmed, s.basis,';
  b3 text := 'select v.*, s.estimated_send_at, coalesce(s.is_confirmed, false) as is_confirmed, s.basis, coalesce(s.due, false) as due,';
  a4 text := '''send_window'', n.send_window,';
  b4 text := '''send_window'', n.send_window, ''due'', n.due,';
begin
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 or position(a4 in d) = 0 then
    raise exception 'send_queue: anchor not found';
  end if;
  d := replace(replace(replace(replace(d, a1, b1), a2, b2), a3, b3), a4, b4);
  execute d;
end $mig$;
