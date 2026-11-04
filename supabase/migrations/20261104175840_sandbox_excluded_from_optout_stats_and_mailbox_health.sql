-- Keep sandbox test activity out of platform reporting and health monitors.
--  * optout_stats (admin): counted every client's opt-outs and stop/not-interested
--    replies, so a sandbox "Unsubscribe" test inflated the platform numbers.
--  * check_mailbox_health: a few simulated bounces could auto-pause the sandbox
--    mailbox and raise an admin alert. Sandbox mailboxes are skipped.
-- optout_list stays as is (a list, where test opt-outs are useful to see), and the
-- weekly client summary still runs for a sandbox (it only emails the tester).
-- NOTE: create or replace view resets view options; security_invoker is restored in
-- 20261104175920_optout_stats_restore_security_invoker.sql.

create or replace view public.optout_stats as
 WITH real_dnc AS (
         SELECT d.reason, d.created_at
           FROM do_not_contact d
           LEFT JOIN prospects p ON p.id = d.source_prospect_id
           LEFT JOIN clients c ON c.id = p.client_id
          WHERE NOT COALESCE(c.is_sandbox, false)
        ), real_replies AS (
         SELECT r.intent
           FROM replies r
           LEFT JOIN clients c ON c.id = r.client_id
          WHERE NOT COALESCE(c.is_sandbox, false)
        ), totals AS (
         SELECT ( SELECT count(*) FROM real_dnc WHERE real_dnc.reason IS DISTINCT FROM 'bounce'::text) AS total_optouts,
            ( SELECT count(*) FROM real_replies WHERE real_replies.intent = 'stop'::text) AS stop_replies,
            ( SELECT count(*) FROM real_replies WHERE real_replies.intent = 'not_interested'::text) AS not_interested_replies,
            ( SELECT count(*) FROM real_dnc WHERE real_dnc.reason IS DISTINCT FROM 'bounce'::text
                 AND real_dnc.created_at >= (now() - '7 days'::interval)) AS optouts_last_7_days,
            ( SELECT count(*) FROM real_dnc WHERE real_dnc.reason IS DISTINCT FROM 'bounce'::text
                 AND real_dnc.created_at >= (now() - '30 days'::interval)) AS optouts_last_30_days
        )
 SELECT total_optouts, stop_replies, not_interested_replies, optouts_last_7_days, optouts_last_30_days
   FROM totals;

create or replace function public.check_mailbox_health()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record; win timestamptz; s int; b int; n int := 0; reason text;
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
    if s >= 20 and b::numeric / s > 0.03 then
      reason := format('Bounce rate %s%% (%s of %s) in the last 7 days', round(100.0 * b / s, 1), b, s);
      update public.client_email_credentials
         set paused_until = now() + interval '24 hours', pause_reason = reason,
             health_reset_at = now() + interval '24 hours'
       where id = r.id;
      insert into public.mailbox_events (client_id, event_type, detail)
        values (r.client_id, 'auto_paused', jsonb_build_object('reason', reason, 'sent', s, 'bounced', b));
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$;
