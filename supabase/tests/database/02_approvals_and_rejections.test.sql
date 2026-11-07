-- Approvals and rejections: an email never reaches the sender (sendable_messages, read by
-- WF2.5) before it is approved, approving puts it there, a draft can be approved only once,
-- and a rejected draft never sends.
begin;
select plan(22);

select tests.client() as client_id \gset
select tests.user(:'client_id') as user_id \gset
select tests.campaign(:'client_id') as campaign_id \gset
select tests.prospect(:'campaign_id') as prospect_id \gset
select tests.message(:'prospect_id') as msg \gset

-- ── Approval ─────────────────────────────────────────────────────────────────────────────
select ok(not tests.sendable(:'msg'), 'A pending first email is not in the send queue');
select is(tests.block_reason(:'msg'), null, 'A pending email is not "blocked" either: it is awaiting approval');
select isnt((select pending_since from public.messages where id = :'msg'), null, 'A new draft records when it started waiting (pending_since)');

-- The client approves it in the app (useClientApprovals.approve: update ... where approval_status = 'pending').
select tests.claims_client(:'user_id');
set local session authorization authenticated;
with u as (update public.messages set approval_status = 'approved', approved_at = now(), approved_by = :'user_id'
            where id = :'msg' and approval_status = 'pending' returning 1)
select is((select count(*)::int from u), 1, 'The client can approve their own pending draft');
with u as (update public.messages set approval_status = 'approved', approved_at = now(), approved_by = :'user_id'
            where id = :'msg' and approval_status = 'pending' returning 1)
select is((select count(*)::int from u), 0, 'Approving the same draft again changes nothing (one approval per draft)');
reset session authorization;

select ok(tests.sendable(:'msg'), 'Once approved, the first email is in the send queue');
select is((select approved_by from public.messages where id = :'msg'), :'user_id'::uuid, 'The approver is recorded');

-- Only one live first-touch draft per prospect.
select throws_ok(
  format($$insert into public.messages (prospect_id, campaign_id, client_id, body, message_type, approval_status)
           values (%L, %L, %L, 'x', 'initial', 'pending')$$, :'prospect_id', :'campaign_id', :'client_id'),
  '23505', null,
  'A prospect cannot have two pending first emails');
select lives_ok(
  format($$insert into public.messages (prospect_id, campaign_id, client_id, body, message_type, approval_status)
           values (%L, %L, %L, 'x', 'follow_up_d3', 'pending')$$, :'prospect_id', :'campaign_id', :'client_id'),
  'A follow-up draft can be written alongside it');
select throws_ok(
  format($$insert into public.messages (prospect_id, campaign_id, client_id, body, message_type, approval_status)
           values (%L, %L, %L, 'x', 'follow_up_d3', 'pending')$$, :'prospect_id', :'campaign_id', :'client_id'),
  '23505', null,
  'But never two live drafts of the same follow-up step');

-- An approved email still waits while its campaign is paused, and says why.
update public.campaigns set status = 'paused' where id = :'campaign_id';
select ok(not tests.sendable(:'msg'), 'An approved email does not send while its campaign is paused');
select is(tests.block_reason(:'msg'), 'campaign_inactive', 'Approvals shows it as blocked: campaign inactive');
update public.campaigns set status = 'active' where id = :'campaign_id';

-- ── Rejection ────────────────────────────────────────────────────────────────────────────
select tests.prospect(:'campaign_id') as p2 \gset
select tests.message(:'p2') as rejected_msg \gset
select tests.claims_client(:'user_id');
set local session authorization authenticated;
update public.messages set approval_status = 'rejected', reject_reason = 'manual'
 where id = :'rejected_msg' and approval_status in ('pending', 'approved') and send_status = 'not_sent';
reset session authorization;
select ok(not tests.sendable(:'rejected_msg'), 'A rejected email is never in the send queue');
select is(tests.block_reason(:'rejected_msg'), null, 'A rejected email is not listed as approved-but-blocked');
select is((select rejected_by from public.messages where id = :'rejected_msg'), :'user_id'::uuid, 'The person who rejected it is recorded');
select is((select reject_reason from public.messages where id = :'rejected_msg'), 'manual', 'Rejected by a person: reason "manual"');

-- Rejecting an approved-but-unsent email takes it out of the queue too.
select tests.prospect(:'campaign_id') as p3 \gset
select tests.message(:'p3', 'initial', 'approved') as approved_then_rejected \gset
select ok(tests.sendable(:'approved_then_rejected'), 'Approved email is queued...');
select tests.claims_client(:'user_id');
set local session authorization authenticated;
update public.messages set approval_status = 'rejected', reject_reason = 'manual' where id = :'approved_then_rejected';
reset session authorization;
select ok(not tests.sendable(:'approved_then_rejected'), '...and leaves the queue when rejected before sending');

-- A backend rejection (no signed-in person) is recorded as "system".
select tests.prospect(:'campaign_id') as p4 \gset
select tests.message(:'p4') as system_rejected \gset
select tests.claims_none();
update public.messages set approval_status = 'rejected' where id = :'system_rejected';
select is((select reject_reason from public.messages where id = :'system_rejected'), 'system', 'A rejection by a backend process is recorded as "system"');

-- Rejecting a draft stops the sequence: the prospect's pending follow-up schedule is cancelled.
-- (Upfront sequence: first email sent, follow-up 1 scheduled, follow-up 2 already written by WF19.)
select tests.prospect(:'campaign_id') as p5 \gset
select tests.message(:'p5', 'initial', 'approved') as p5_initial \gset
select tests.sent(:'p5_initial', now() - interval '1 day');
select tests.schedule_next(:'p5_initial') as p5_schedule \gset
insert into public.messages (prospect_id, campaign_id, client_id, body, message_type)
values (:'p5', :'campaign_id', :'client_id', 'Upfront follow-up 2', 'follow_up_d7') returning id as p5_fu2 \gset
update public.messages set approval_status = 'rejected', reject_reason = 'manual' where id = :'p5_fu2';
select is((select status from public.follow_up_schedules where id = :'p5_schedule'), 'cancelled',
          'Rejecting a follow-up draft cancels the pending follow-up schedule, so nothing else is written');

-- Un-rejecting (a person changes their mind) clears the rejection fields.
update public.messages set approval_status = 'pending' where id = :'rejected_msg';
select is((select row(rejected_at, rejected_by, reject_reason)::text from public.messages where id = :'rejected_msg'),
          row(null::timestamptz, null::uuid, null::text)::text, 'Moving a draft back to pending clears who rejected it and why');
select ok(not tests.sendable(:'rejected_msg'), 'and it is pending again, so still not sendable');

select * from finish();
rollback;
