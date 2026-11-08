-- Failures are recorded with a reason and reach the admin (error_logs, Monitoring) instead of
-- failing silently: text alerts, emails Gmail refused, and emails the pre-send gate blocked.
-- A gate "collision" is rescheduled 3 days later instead of failing for good.
begin;
select plan(30);
select tests.pin_send_day(true);

select tests.client() as client_id \gset
select tests.campaign(:'client_id') as campaign_id \gset
select tests.client('US', 'America/Chicago', true, 'Sandbox Client') as sandbox_id \gset
-- Marking a client as a sandbox is admin-only (protect_client_admin_fields); the test bypasses it.
alter table public.clients disable trigger trg_protect_client_admin_fields;
update public.clients set is_sandbox = true where id = :'sandbox_id';
alter table public.clients enable trigger trg_protect_client_admin_fields;

-- ── Text alerts ───────────────────────────────────────────────────────────────────────────
insert into public.notifications (client_id, channel, purpose, recipient, body, status)
values (:'client_id', 'sms', 'hot_lead_nudge', 'client', 'Shorty Harris: you have a hot lead.', 'pending')
returning id as notif_id \gset

-- WF14 / WF6 after Twilio refuses the alert.
update public.notifications
   set status = 'failed', failure_reason = '400 - The number is unverified (21608)'
 where id = :'notif_id';

select is((select body from public.notifications where id = :'notif_id'), 'Shorty Harris: you have a hot lead.',
          'The alert text is kept clean; the error is in failure_reason');
select is((select count(*)::int from public.error_logs where context->>'notification_id' = :'notif_id'), 1,
          'A failed text alert is logged for the admin');
select is((select source || '/' || error_type from public.error_logs where context->>'notification_id' = :'notif_id'),
          'wf14_notifications/notification_failed', 'Logged as a notification failure');
select matches((select message from public.error_logs where context->>'notification_id' = :'notif_id'),
               'Test Client.*sms, hot lead nudge.*21608', 'The log says whose alert, which kind, and why');

update public.notifications set failure_reason = failure_reason where id = :'notif_id';
update public.notifications set status = 'failed' where id = :'notif_id';
select is((select count(*)::int from public.error_logs where context->>'notification_id' = :'notif_id'), 1,
          'Updating an already failed alert does not log it twice');

insert into public.notifications (client_id, channel, purpose, recipient, body, status)
values (:'client_id', 'sms', 'hot_lead_new', 'client', 'Born failed', 'failed')
returning id as notif2 \gset
select is((select count(*)::int from public.error_logs where context->>'notification_id' = :'notif2'), 1,
          'An alert inserted as failed is logged too');

insert into public.notifications (client_id, channel, purpose, recipient, body, status)
values (:'sandbox_id', 'sms', 'hot_lead_new', 'client', 'Sandbox alert', 'pending')
returning id as sandbox_notif \gset
update public.notifications set status = 'failed', failure_reason = 'x' where id = :'sandbox_notif';
select is((select count(*)::int from public.error_logs where context->>'notification_id' = :'sandbox_notif'), 0,
          'Sandbox clients are not logged (they are tests)');

-- ── Emails Gmail refused ─────────────────────────────────────────────────────────────────
select tests.prospect(:'campaign_id') as p1 \gset
select tests.message(:'p1', 'initial', 'approved') as m1 \gset

update public.messages set send_status = 'failed' where id = :'m1';
select is((select send_error from public.messages where id = :'m1'), 'failed_no_reason_recorded',
          'An email marked failed without a reason gets a placeholder reason, never null');
select is((select count(*)::int from public.error_logs where context->>'message_id' = :'m1'), 1,
          'A failed email is logged for the admin');
select matches((select message from public.error_logs where context->>'message_id' = :'m1'),
               'Prospect Co.*Test Client.*initial.*failed_no_reason_recorded',
               'The log names the prospect, the client, the step and the reason');

update public.messages set send_status = 'failed', updated_at = now() where id = :'m1';
select is((select count(*)::int from public.error_logs where context->>'message_id' = :'m1'), 1,
          'An email already failed is not logged again');

select tests.prospect(:'campaign_id') as p2 \gset
select tests.message(:'p2', 'initial', 'approved') as m2 \gset
-- Three Gmail refusals: WF3 claims, Gmail fails, WF3a releases with the error.
select public.claim_message_for_send(:'m2');
select public.release_message_claim(:'m2', 'Gmail 429 rate limit');
select is((select send_status from public.messages where id = :'m2'), 'not_sent', 'First refusal: retried later');
select is((select count(*)::int from public.error_logs where context->>'message_id' = :'m2'), 0,
          'A send that will be retried is not alerted yet');
update public.messages set send_retry_at = null where id = :'m2';
select public.claim_message_for_send(:'m2');
select public.release_message_claim(:'m2', 'Gmail 429 rate limit');
update public.messages set send_retry_at = null where id = :'m2';
select public.claim_message_for_send(:'m2');
select public.release_message_claim(:'m2', 'Gmail 500 backend error');
select is((select send_status from public.messages where id = :'m2'), 'failed', 'Third refusal: failed for good');
select matches((select message from public.error_logs where context->>'message_id' = :'m2'),
               'Gmail 500 backend error', 'The final Gmail error is in the admin log');

-- ── Emails the pre-send gate blocked ─────────────────────────────────────────────────────
select tests.prospect(:'campaign_id') as p3 \gset
select tests.message(:'p3', 'initial', 'approved') as m3 \gset
select public.record_presend_block(:'m3', 'collision');
select is((select send_status from public.messages where id = :'m3'), 'not_sent',
          'A collision does not fail the email');
select ok((select send_retry_at between now() + interval '71 hours' and now() + interval '73 hours'
             from public.messages where id = :'m3'), 'It is rescheduled 3 days later');
select ok(not tests.sendable(:'m3'), 'It is not in the send queue until then');
select is(tests.block_reason(:'m3'), 'collision_rescheduled', 'The client sees why it is waiting');
select is((select count(*)::int from public.error_logs where context->>'message_id' = :'m3'), 0,
          'A rescheduled email is not an alert');
update public.messages set send_retry_at = now() - interval '1 minute' where id = :'m3';
select ok(tests.sendable(:'m3'), 'After 3 days it is back in the send queue');

select tests.prospect(:'campaign_id') as p4 \gset
select tests.message(:'p4', 'initial', 'approved') as m4 \gset
select public.record_presend_block(:'m4', 'campaign_not_active');
select is((select send_status from public.messages where id = :'m4'), 'not_sent',
          'A paused campaign holds the email instead of failing it');

select tests.prospect(:'campaign_id') as p5 \gset
select tests.message(:'p5', 'initial', 'approved') as m5 \gset
insert into public.compliance_checks (message_id, check_type, passed, warnings)
values (:'m5', 'can_spam', false, '["Missing postal address."]'::jsonb);
select public.record_presend_block(:'m5', 'compliance_failed');
select is((select send_status from public.messages where id = :'m5'), 'failed', 'A compliance failure fails the email');
select is((select send_error from public.messages where id = :'m5'), 'presend_compliance_failed: Missing postal address.',
          'The reason says which check failed');
select is((select count(*)::int from public.error_logs where context->>'message_id' = :'m5'), 1,
          'A compliance failure is alerted');

-- Only the backend may record a block or claim alerts.
select tests.claims_anon();
set local session authorization anon;
select throws_ok(format('select public.record_presend_block(%L, %L)', :'m4', 'compliance_failed'), '42501',
                 null, 'The public key cannot mark emails failed');
reset session authorization;
select tests.claims_none();
select tests.user(:'client_id') as client_user \gset
select tests.claims_client(:'client_user');
set local session authorization authenticated;
select throws_ok('select * from public.claim_failure_alerts()', '42501', null,
                 'A signed-in client cannot read the failure alerts');
reset session authorization;
select tests.claims_none();

-- ── Alert hand-off ───────────────────────────────────────────────────────────────────────
select tests.claims_service();
set local session authorization service_role;
select ok((select count(*) from public.claim_failure_alerts(500)) >= 5,
          'The alert workflow receives the new email and text failures');
select is((select count(*)::int from public.claim_failure_alerts(500)), 0, 'Each failure is handed over only once');
reset session authorization;
select tests.claims_none();

-- ── Unsubscribe date on the Prospects page ───────────────────────────────────────────────
select tests.prospect(:'campaign_id', 'gone@unsub.example') as p6 \gset
-- A real (imported) prospect; prospects default to sandbox rows, which the Prospects page hides.
update public.prospects set is_sandbox = false where id = :'p6';
insert into public.do_not_contact (email, reason) values ('gone@unsub.example', 'opt_out');
select ok((select (r->>'unsubscribed_at') is not null
             from jsonb_array_elements(public.client_pipeline(:'client_id', null, 'gone@unsub', 50, 0)->'rows') r),
          'The Prospects page gets the date the prospect unsubscribed');

select * from finish();
rollback;
