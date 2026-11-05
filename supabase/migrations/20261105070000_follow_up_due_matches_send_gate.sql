-- A follow-up's due date now uses the same business-day rule as the send gate.
--
-- WF3 (n8n) proposes due_at as 3/5/7 weekdays after the send, without public holidays and
-- in n8n's time zone. The send gate (sendable_messages) only releases a follow-up once
-- add_business_days(previous send, 3/5/7, client time zone, country) has passed, which does
-- skip the country's holidays. Around a holiday the two disagreed: e.g. a first email sent
-- Mon 23 Nov 2026 (US) got a follow-up due Thu 26 Nov (Thanksgiving) that the gate would
-- not send until Fri 27 Nov, so WF5 wrote the draft early and Approvals showed the wrong date.
--
-- This BEFORE INSERT trigger recomputes due_at from the previous email's actual send time with
-- the gate's own expression, so the schedule and the gate cannot disagree. Rows whose previous
-- email is not found (or an unknown step) keep the due_at they were given.
-- Cadence (also asserted by app/src/n8n/wf3-follow-up-schedule.test.ts):
--   follow_up_day 3  (follow_up_d3)  = 3 business days after the first email
--   follow_up_day 7  (follow_up_d7)  = 5 business days after follow-up 1
--   follow_up_day 14 (follow_up_d14) = 7 business days after follow-up 2
--
-- Applied live as 20261105070000; statements exactly as applied.

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
  -- Same expression as the follow-up timing check in sendable_messages.
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
