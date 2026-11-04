-- Applied to production 2026-11-04.
--
-- Silent-failure detector.
--
-- A client sending steadily with zero replies coming back is not unlucky, it is
-- broken: that is exactly the shape of the Oct 2026 incident, where a Workspace
-- mailbox recorded 0 replies against 81 sent emails for three months because the
-- Gmail reply query used "category:primary", which returns nothing for accounts
-- that do not use inbox tabs. Nothing noticed. This would have.
create or replace function public.check_reply_health()
returns table (client_id uuid, sent_14d bigint, replies_14d bigint, flagged boolean)
language sql
security definer
set search_path to 'public'
as $$
  with per_client as (
    select m.client_id,
           count(*) filter (where m.send_status = 'sent'
                              and m.sent_at > now() - interval '14 days') as sent_14d,
           (select count(*) from replies r
             where r.client_id = m.client_id
               and r.received_at > now() - interval '14 days') as replies_14d
    from messages m
    group by m.client_id
  )
  select client_id, sent_14d, replies_14d,
         (sent_14d >= 30 and replies_14d = 0) as flagged
  from per_client;
$$;

-- Writes one warning per flagged client per run. error_logs already feeds the
-- admin Monitoring screen and WF8's alerting, so this needs no new plumbing.
create or replace function public.log_reply_health()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in select * from public.check_reply_health() where flagged loop
    insert into public.error_logs (source, error_type, severity, message)
    values ('reply_health_monitor', 'no_replies_received', 'warning',
            'Client ' || r.client_id || ' has sent ' || r.sent_14d ||
            ' emails in 14 days and received 0 replies. Reply ingestion is probably broken for this mailbox, not merely quiet.');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.check_reply_health() from public, anon, authenticated;
revoke all on function public.log_reply_health() from public, anon, authenticated;
