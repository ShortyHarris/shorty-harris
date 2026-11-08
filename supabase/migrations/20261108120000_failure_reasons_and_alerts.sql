-- Failures are recorded with a reason and reach the admin, instead of failing silently.
--
-- 1. Text alerts (notifications): the Twilio error goes in its own column, failure_reason, not
--    pasted into the message body. Every failed alert is logged to error_logs (admin Monitoring).
-- 2. Emails (messages): a failed email always has a send_error, and every failed email is logged
--    to error_logs. Sandbox clients are left out of error_logs (they are tests).
-- 3. Pre-send gate blocks are recorded by record_presend_block() (backend only, called by WF3
--    through WF3a). A "collision" (another client emailed the same address today) is now
--    rescheduled 3 days later, as the gate always said, instead of being marked failed for good.
--    A paused campaign puts the email back in the queue instead of failing it.
-- 4. claim_failure_alerts() hands new email/text failures to the alert workflow once each.
-- 5. client_pipeline returns unsubscribed_at, so the Prospects page can show the date.

-- ── 1. Text alerts ─────────────────────────────────────────────────────────────────────────
alter table public.notifications add column if not exists failure_reason text;
comment on column public.notifications.failure_reason is
  'Why the alert failed (the Twilio error) or was cancelled. Null when sent.';

-- Recover reasons written into the body by the earlier WF14/WF6 versions ("[send_failed: ...] body"
-- and "[reason] body"), and mark the rest as unknown.
update public.notifications
   set failure_reason = substring(body from '^\[send_failed: (.*?)\] '),
       body = regexp_replace(body, '^\[send_failed: .*?\] ', '')
 where status = 'failed' and body ~ '^\[send_failed: ';
update public.notifications
   set failure_reason = substring(body from '^\[([a-z_]+)\] '),
       body = regexp_replace(body, '^\[[a-z_]+\] ', '')
 where status = 'cancelled' and body ~ '^\[[a-z_]+\] ';
update public.notifications
   set failure_reason = 'No reason recorded (failed before reasons were saved)'
 where status = 'failed' and failure_reason is null;

-- ── error_logs: new source, and "alert already sent" marker ────────────────────────────────
alter table public.error_logs drop constraint if exists error_logs_source_check;
alter table public.error_logs add constraint error_logs_source_check CHECK ((source = ANY (ARRAY[
  'wf0_discovery'::text, 'wf1_import'::text, 'wf2_generation'::text, 'wf2_5_approval'::text,
  'wf3_send'::text, 'wf4_classification'::text, 'wf5_follow_up'::text, 'wf6_hot_lead'::text,
  'wf14_notifications'::text, 'stripe_webhook'::text, 'frontend'::text, 'edge_function'::text,
  'other'::text])));

alter table public.error_logs add column if not exists alerted_at timestamptz;
comment on column public.error_logs.alerted_at is
  'When the failure alert email included this row (claim_failure_alerts). Null = not alerted yet.';

create or replace function public.log_failed_notification()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_client text; v_sandbox boolean;
begin
  if new.status <> 'failed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'failed' then return new; end if;
  select c.business_name, coalesce(c.is_sandbox, false) into v_client, v_sandbox
    from public.clients c where c.id = new.client_id;
  if v_sandbox then return new; end if;
  insert into public.error_logs (source, error_type, severity, message, context)
  values ('wf14_notifications', 'notification_failed', 'error',
    'Text alert to ' || case when new.recipient = 'agency' then 'the agency' else coalesce(v_client, 'a client') end
      || ' failed (' || new.channel || ', ' || replace(new.purpose, '_', ' ') || '): '
      || coalesce(new.failure_reason, 'no reason recorded'),
    jsonb_build_object('notification_id', new.id, 'client_id', new.client_id,
      'hot_lead_id', new.hot_lead_id, 'channel', new.channel, 'purpose', new.purpose,
      'failure_reason', new.failure_reason));
  return new;
end; $function$;
revoke all on function public.log_failed_notification() from public, anon, authenticated;

drop trigger if exists trg_log_failed_notification on public.notifications;
create trigger trg_log_failed_notification
  after insert or update of status on public.notifications
  for each row execute function public.log_failed_notification();

-- ── 2. Emails ──────────────────────────────────────────────────────────────────────────────
-- Safety net: whichever path marks an email failed, it never stays without a reason.
create or replace function public.messages_require_send_error()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.send_status = 'failed' and old.send_status is distinct from 'failed'
     and nullif(btrim(coalesce(new.send_error, '')), '') is null then
    new.send_error := 'failed_no_reason_recorded';
  end if;
  return new;
end; $function$;

drop trigger if exists trg_messages_require_send_error on public.messages;
create trigger trg_messages_require_send_error
  before update of send_status on public.messages
  for each row execute function public.messages_require_send_error();

create or replace function public.log_failed_message()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_client text; v_sandbox boolean; v_email text; v_business text;
begin
  if new.send_status <> 'failed' or old.send_status = 'failed' then return new; end if;
  select c.business_name, coalesce(c.is_sandbox, false) into v_client, v_sandbox
    from public.clients c where c.id = new.client_id;
  if v_sandbox then return new; end if;
  select p.email, p.business_name into v_email, v_business
    from public.prospects p where p.id = new.prospect_id;
  insert into public.error_logs (source, error_type, severity, message, context)
  values ('wf3_send', 'email_send_failed', 'error',
    'Email to ' || coalesce(v_business, v_email, 'a prospect') || coalesce(' <' || v_email || '>', '')
      || ' for ' || coalesce(v_client, 'a client') || ' (' || replace(new.message_type, '_', ' ')
      || ') failed and will not be retried: ' || coalesce(new.send_error, 'no reason recorded'),
    jsonb_build_object('message_id', new.id, 'client_id', new.client_id,
      'prospect_id', new.prospect_id, 'campaign_id', new.campaign_id,
      'message_type', new.message_type, 'send_error', new.send_error,
      'send_attempts', new.send_attempts));
  return new;
end; $function$;
revoke all on function public.log_failed_message() from public, anon, authenticated;

drop trigger if exists trg_log_failed_message on public.messages;
create trigger trg_log_failed_message
  after update of send_status on public.messages
  for each row execute function public.log_failed_message();

-- Past failures: recover the reason where the database still knows it. Only send_error changes,
-- so neither trigger above fires and nothing old is re-alerted.
update public.messages m
   set send_error = 'collision: another client emailed this address the same day (not retried; recorded later)'
 where m.send_status = 'failed' and m.send_error is null
   and exists (select 1 from public.prospect_collisions pc where pc.blocked_message_id = m.id);
update public.messages m
   set send_error = 'No reason recorded (failed before reasons were saved)'
 where m.send_status = 'failed' and m.send_error is null;

-- ── 3. Pre-send gate blocks ────────────────────────────────────────────────────────────────
create or replace function public.record_presend_block(p_message_id uuid, p_error text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_reason text := coalesce(nullif(btrim(p_error), ''), 'unknown'); v_detail text;
begin
  if v_reason = 'collision' then
    update public.messages
       set send_status = 'not_sent', send_claimed_at = null,
           send_error = 'collision_rescheduled: another client emailed this address today; retrying in 3 days',
           send_retry_at = now() + interval '3 days', updated_at = now()
     where id = p_message_id and send_status <> 'sent';
  elsif v_reason = 'campaign_not_active' then
    -- The queue already holds emails of paused campaigns; this one goes back to wait with them.
    update public.messages
       set send_status = 'not_sent', send_claimed_at = null,
           send_error = 'campaign_not_active: held until the campaign is active again',
           updated_at = now()
     where id = p_message_id and send_status <> 'sent';
  else
    if v_reason = 'compliance_failed' then
      select string_agg(distinct w.value, '; ') into v_detail
        from public.compliance_checks cc, jsonb_array_elements_text(cc.warnings) w(value)
       where cc.message_id = p_message_id and cc.passed = false;
    end if;
    update public.messages
       set send_status = 'failed', send_claimed_at = null,
           send_error = left('presend_' || v_reason || coalesce(': ' || v_detail, ''), 300),
           updated_at = now()
     where id = p_message_id and send_status <> 'sent';
  end if;
end; $function$;
revoke all on function public.record_presend_block(uuid, text) from public, anon, authenticated;
grant execute on function public.record_presend_block(uuid, text) to service_role;

-- The client sees "Rescheduled" rather than "Retrying" (which says Gmail refused it).
do $mig$
declare d text := rtrim(pg_get_viewdef('public.message_block_reasons'), E'; \n');
  a text := 'WHEN (m.send_retry_at > now()) THEN ''retrying_send''::text';
begin
  if position('collision_rescheduled' in d) > 0 then raise exception 'already applied'; end if;
  if position(a in d) = 0 then raise exception 'message_block_reasons: anchor not found'; end if;
  d := replace(d, a,
    'WHEN ((m.send_retry_at > now()) AND (m.send_error ~~ ''collision_rescheduled%''::text)) THEN ''collision_rescheduled''::text '
    || a);
  execute 'create or replace view public.message_block_reasons as ' || d;
end $mig$;

-- ── 4. Failure alerts ──────────────────────────────────────────────────────────────────────
-- Returns the email/text failures not alerted yet and marks them alerted, in one step, so two
-- runs never alert the same failure twice.
create or replace function public.claim_failure_alerts(p_limit integer default 100)
 returns table(id uuid, source text, error_type text, message text, context jsonb, created_at timestamptz)
 language sql
 security definer
 set search_path to 'public'
as $function$
  with picked as (
    select e.id from public.error_logs e
     where e.alerted_at is null and e.resolved = false
       and e.error_type in ('email_send_failed', 'notification_failed')
     order by e.created_at
     limit greatest(coalesce(p_limit, 100), 1)
     for update skip locked
  )
  update public.error_logs e set alerted_at = now()
    from picked where e.id = picked.id
  returning e.id, e.source, e.error_type, e.message, e.context, e.created_at;
$function$;
revoke all on function public.claim_failure_alerts(integer) from public, anon, authenticated;
grant execute on function public.claim_failure_alerts(integer) to service_role;

-- ── 5. Unsubscribe date on the Prospects page ──────────────────────────────────────────────
do $mig$
declare d text := pg_get_functiondef('public.client_pipeline(uuid,text,text,integer,integer)'::regprocedure);
  a text := '''suppressed'', exists (select 1 from public.do_not_contact d where lower(d.email) = lower(f.email)),';
begin
  if position('unsubscribed_at' in d) > 0 then raise exception 'already applied'; end if;
  if position(a in d) = 0 then raise exception 'client_pipeline: anchor not found'; end if;
  d := replace(d, a, a || chr(10) ||
    '    ''unsubscribed_at'', (select min(d.created_at) from public.do_not_contact d where lower(d.email) = lower(f.email) and d.reason in (''opt_out'',''stop_request'')),');
  execute d;
end $mig$;
