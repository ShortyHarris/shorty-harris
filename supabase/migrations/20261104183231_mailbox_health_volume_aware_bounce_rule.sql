-- The bounce auto-pause was too sensitive at low volume: pause above 3% once a mailbox
-- had sent 20 emails in 7 days, so one bad address in 20 (5%) stopped a client for
-- 24 hours (PostKing, 2026-11-04). A single bounce does not hurt a mailbox's
-- reputation, and the bounced address is already put on do-not-contact.
--
-- New rule (last 7 days, since the last health reset):
--   pause : under 50 sends and 3 or more bounces,
--           or 50+ sends and at least 2 bounces and a rate above 3%
--   warn  : any other bounce. A 'bounce_warning' mailbox event, at most one per
--           client per 24 hours; WF21 emails it to the admin. Sending carries on.
-- Sandbox mailboxes stay excluded (20261104175840).
--
-- Applied live as 20261104183231. Same day, as data: PostKing's pause from the old
-- rule (1 bounce in 20) was lifted, since the new rule would only have warned. WF21's
-- alert email gained the 'bounce_warning' wording (n8n, changed live).

create or replace function public.mailbox_bounce_decision(p_sent integer, p_bounced integer)
 returns text
 language sql
 immutable
as $function$
  select case
    when coalesce(p_bounced, 0) <= 0 then 'ok'
    when coalesce(p_sent, 0) < 50 and p_bounced >= 3 then 'pause'
    when coalesce(p_sent, 0) >= 50 and p_bounced >= 2 and p_bounced::numeric / p_sent > 0.03 then 'pause'
    else 'warn'
  end;
$function$;

create or replace function public.check_mailbox_health()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record; win timestamptz; s int; b int; n int := 0; reason text; decision text;
begin
  for r in select e.id, e.client_id, e.health_reset_at
             from public.client_email_credentials e
             join public.clients c on c.id = e.client_id
            where e.status = 'active' and (e.paused_until is null or e.paused_until <= now())
              and not coalesce(c.is_sandbox, false)
  loop
    win := greatest(now() - interval '7 days', coalesce(r.health_reset_at, '-infinity'::timestamptz));
    select count(*) into s from public.messages
      where client_id = r.client_id and send_status = 'sent' and sent_at > win;
    select count(distinct rp.message_id) into b from public.replies rp
      join public.messages m on m.id = rp.message_id
      where rp.client_id = r.client_id and rp.intent = 'bounced' and m.sent_at > win;
    decision := public.mailbox_bounce_decision(s, b);

    if decision = 'pause' then
      reason := format('%s bounces out of %s sent (%s%%) in the last 7 days', b, s, round(100.0 * b / greatest(s, 1), 1));
      update public.client_email_credentials
         set paused_until = now() + interval '24 hours', pause_reason = reason,
             health_reset_at = now() + interval '24 hours'
       where id = r.id;
      insert into public.mailbox_events (client_id, event_type, detail)
        values (r.client_id, 'auto_paused', jsonb_build_object('reason', reason, 'sent', s, 'bounced', b));
      n := n + 1;
    elsif decision = 'warn' and not exists (
            select 1 from public.mailbox_events
             where client_id = r.client_id and event_type = 'bounce_warning'
               and created_at > now() - interval '24 hours') then
      insert into public.mailbox_events (client_id, event_type, detail)
        values (r.client_id, 'bounce_warning', jsonb_build_object('sent', s, 'bounced', b));
    end if;
  end loop;
  return n;
end $function$;
