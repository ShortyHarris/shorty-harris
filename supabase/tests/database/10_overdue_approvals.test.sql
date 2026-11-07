-- Overdue approvals and sequence rescheduling: docs/REGRESSION-TESTING-PLAN.md section 6,
-- scenarios OA-1 to OA-10, at the database level. What the database decides:
--   * the send gate (sendable_messages, which WF2.5 reads): what may go out now;
--   * the stored follow-up due date (follow_up_due_from_send_gate);
--   * the Approvals page dates (approvals_schedule) and block reasons (message_block_reasons).
-- Sending hours, daily limits and send order inside a run are WF2.5's (n8n) and are tested in
-- app/src/n8n/wf2.5-send-batch.test.ts; here they are checked as the Approvals page shows them.
--
-- Time: the database clock cannot be faked, so emails are "sent" at real past business-day
-- moments (tests.business_moment) and time moves with tests.travel_business_days, which keeps
-- every "N business days after the send" relation intact.
begin;
select plan(79);
-- Not a test of weekends and holidays: today counts as a send day (see tests.pin_send_day).
select tests.pin_send_day(true);

select 'America/Chicago' as tz, 'US' as ctry \gset
select tests.business_moment(:'tz', :'ctry') as x0 \gset

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-1  Main scenario: first email waiting 30 days, upfront follow-ups 1-3 already written.
-- ═════════════════════════════════════════════════════════════════════════════════════════
select tests.client(:'ctry', :'tz', true, 'OA-1') as c1 \gset
select tests.user(:'c1') as u1 \gset
select tests.campaign(:'c1', null, true) as camp1 \gset
select tests.prospect(:'camp1') as p1 \gset
select tests.message(:'p1', 'initial', 'pending', now() - interval '30 days') as p1_i \gset
select tests.upfront_draft(:'p1', 'follow_up_d3', now() - interval '30 days') as p1_f1 \gset
select tests.upfront_draft(:'p1', 'follow_up_d7', now() - interval '30 days') as p1_f2 \gset
select tests.upfront_draft(:'p1', 'follow_up_d14', now() - interval '30 days') as p1_f3 \gset

select is(tests.sendable_count(:'p1'), 0::bigint, 'OA-1: nothing is sent while the first email awaits approval (30 days)');

-- 2. The client approves the whole sequence (Approvals > approve sequence).
select tests.claims_client(:'u1');
set local session authorization authenticated;
select is((public.approve_sequences(:'c1', array[:'p1']::uuid[])->>'emails_approved')::int, 4,
          'OA-1: the client approves the first email and the three follow-ups');
reset session authorization;
select tests.claims_none();

-- 3. Only the first email is queued.
select ok(tests.sendable(:'p1_i'), 'OA-1: the first email is in the send queue');
select is(tests.sendable_count(:'p1'), 1::bigint, 'OA-1: and nothing else for this prospect');
select is(tests.block_reason(:'p1_f1'), 'waiting_followup_timing', 'OA-1: follow-up 1 waits for the first email to be sent');
select is(tests.block_reason(:'p1_f3'), 'waiting_followup_timing', 'OA-1: follow-up 3 waits too');

-- 8. Approvals page: the first email gets a real slot; follow-ups are counted from it.
select estimated_send_at as p1_i_est, basis as p1_i_basis from tests.schedule(:'c1', :'p1_i') \gset
select is(:'p1_i_basis'::text, 'queue_position_and_daily_cap', 'OA-1: Approvals dates the first email by queue position and daily limit');
select ok(:'p1_i_est'::timestamptz >= now() - interval '1 second', 'OA-1: its estimated send time is not in the past (no overdue date from the old plan)');
select ok(public.is_business_day((:'p1_i_est'::timestamptz at time zone :'tz')::date, :'ctry')
          and (:'p1_i_est'::timestamptz at time zone :'tz')::time between '09:00' and '17:00',
          'OA-1: and it is inside sending hours on a business day');
select is((select basis from tests.schedule(:'c1', :'p1_f1')), 'depends_on_unsent_email', 'OA-1: follow-up 1 is dated from the first email''s estimate');
select ok((select estimated_send_at from tests.schedule(:'c1', :'p1_f1')) >= public.add_business_days(:'p1_i_est', 3, :'tz', :'ctry'),
          'OA-1: at least 3 business days after it');

-- 4-5. The first email goes out at the next allowed time; WF3 schedules follow-up 1.
select tests.sent(:'p1_i', :'x0');
select tests.schedule_next(:'p1_i', :'x0'::timestamptz + interval '3 days') as p1_s1 \gset
select is((select due_at from public.follow_up_schedules where id = :'p1_s1'), public.add_business_days(:'x0', 3, :'tz', :'ctry'),
          'OA-1: follow-up 1 is due 3 business days after the actual send');
select ok((select due_at from public.follow_up_schedules where id = :'p1_s1') > now(),
          'OA-1: which is in the future, not overdue from the original plan');
select is(tests.sendable_count(:'p1'), 0::bigint, 'OA-1: right after the send nothing else is queued');
select is((select row(estimated_send_at, is_confirmed, basis)::text from tests.schedule(:'c1', :'p1_f1')),
          row((select due_at from public.follow_up_schedules where id = :'p1_s1'), true, 'previous_email_sent')::text,
          'OA-1: Approvals now shows follow-up 1 on its due date, confirmed, counted from the real send');

-- 6. Three business days later follow-up 1 is due; only it is released.
select tests.travel_business_days(:'c1', 3);
select ok(tests.sendable(:'p1_f1'), 'OA-1: 3 business days later follow-up 1 is in the send queue');
select is(tests.sendable_count(:'p1'), 1::bigint, 'OA-1: and only follow-up 1');
select tests.sent(:'p1_f1', :'x0');
select tests.schedule_next(:'p1_f1') as p1_s2 \gset
select is((select due_at from public.follow_up_schedules where id = :'p1_s2'), public.add_business_days(:'x0', 5, :'tz', :'ctry'),
          'OA-1: follow-up 2 is due 5 business days after follow-up 1 went out');
select is(tests.sendable_count(:'p1'), 0::bigint, 'OA-1: follow-up 2 is not sent early');
select is((select basis from tests.schedule(:'c1', :'p1_f3')), 'depends_on_unsent_email', 'OA-1: Approvals dates follow-up 3 from follow-up 2''s date');
select ok((select estimated_send_at from tests.schedule(:'c1', :'p1_f3')) >= public.add_business_days(:'x0', 12, :'tz', :'ctry'),
          'OA-1: 7 business days after follow-up 2''s date');

select tests.travel_business_days(:'c1', 5);
select ok(tests.sendable(:'p1_f2') and tests.sendable_count(:'p1') = 1, 'OA-1: 5 business days later only follow-up 2 is queued');
select tests.sent(:'p1_f2', :'x0');
select tests.schedule_next(:'p1_f2') as p1_s3 \gset
select is((select due_at from public.follow_up_schedules where id = :'p1_s3'), public.add_business_days(:'x0', 7, :'tz', :'ctry'),
          'OA-1: follow-up 3 is due 7 business days after follow-up 2 went out');
select is((select estimated_send_at from tests.schedule(:'c1', :'p1_f3')), (select due_at from public.follow_up_schedules where id = :'p1_s3'),
          'OA-1: Approvals shows follow-up 3 on that date');
select is(tests.sendable_count(:'p1'), 0::bigint, 'OA-1: follow-up 3 is not sent early');

select tests.travel_business_days(:'c1', 7);
select ok(tests.sendable(:'p1_f3') and tests.sendable_count(:'p1') = 1, 'OA-1: 7 business days later only follow-up 3 is queued');
select tests.sent(:'p1_f3', :'x0');
select is(tests.sendable_count(:'p1'), 0::bigint, 'OA-1: after follow-up 3 nothing more is queued');
select is(tests.schedule_next(:'p1_f3'), null, 'OA-1: and there is no further step to schedule');
select is((select count(*)::int from public.messages where prospect_id = :'p1' and send_status = 'sent'), 4,
          'OA-1: four emails in all, one per send cycle');

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-2  Approval delayed by one business day: follow-ups count from the actual send.
-- ═════════════════════════════════════════════════════════════════════════════════════════
select tests.client(:'ctry', :'tz', true, 'OA-2') as c2 \gset
select tests.campaign(:'c2') as camp2 \gset
select tests.prospect(:'camp2') as p2 \gset
select tests.message(:'p2', 'initial', 'pending', tests.minus_business_days(:'x0', 1, :'tz', :'ctry')) as p2_i \gset
update public.messages set approval_status = 'approved', approved_at = now() where id = :'p2_i';
select ok(tests.sendable(:'p2_i'), 'OA-2: approved a business day late, the first email is queued');
select tests.sent(:'p2_i', :'x0');
select tests.schedule_next(:'p2_i') as p2_s1 \gset
select is((select due_at from public.follow_up_schedules where id = :'p2_s1'), public.add_business_days(:'x0', 3, :'tz', :'ctry'),
          'OA-2: follow-up 1 is due 3 business days after the actual send...');
select isnt((select due_at from public.follow_up_schedules where id = :'p2_s1'),
            public.add_business_days(tests.minus_business_days(:'x0', 1, :'tz', :'ctry'), 3, :'tz', :'ctry'),
            'OA-2: ...not 3 business days after the draft was written');

-- OA-3 and OA-4 are about sending hours, weekends and holidays: use the real send-day rule.
select tests.unpin_send_day();

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-3  Approved outside sending hours: it waits for the next sending window.
-- (Time zones are chosen so that it is evening, or early morning, there right now.)
-- ═════════════════════════════════════════════════════════════════════════════════════════
select name as tz_evening from pg_timezone_names
 where name ~ '^Etc/GMT[+-][0-9]+$' and extract(hour from now() at time zone name) between 18 and 22 order by name limit 1 \gset
select tests.client('GB', :'tz_evening', true, 'OA-3 evening') as c3 \gset
select tests.campaign(:'c3') as camp3 \gset
select tests.prospect(:'camp3') as p3 \gset
select tests.message(:'p3', 'initial', 'approved') as p3_i \gset
select is((select estimated_send_at from tests.schedule(:'c3', :'p3_i')),
          tests.next_window((now() at time zone :'tz_evening')::date, :'tz_evening', 'GB'),
          'OA-3: approved in the evening, Approvals shows it going out at 9:00 on the next business day');
select tests.upfront_draft(:'p3', 'follow_up_d3') as p3_f1 \gset
select is((select estimated_send_at from tests.schedule(:'c3', :'p3_f1')),
          public.add_business_days(tests.next_window((now() at time zone :'tz_evening')::date, :'tz_evening', 'GB'), 3, :'tz_evening', 'GB'),
          'OA-3: its follow-up is dated 3 business days after that 9:00 send, not after the approval');

select name as tz_morning from pg_timezone_names
 where name ~ '^Etc/GMT[+-][0-9]+$' and extract(hour from now() at time zone name) between 2 and 7 order by name limit 1 \gset
select tests.client('GB', :'tz_morning', true, 'OA-3 morning') as c3b \gset
select tests.campaign(:'c3b') as camp3b \gset
select tests.prospect(:'camp3b') as p3b \gset
select tests.message(:'p3b', 'initial', 'approved') as p3b_i \gset
select is((select estimated_send_at from tests.schedule(:'c3b', :'p3b_i')),
          case when public.is_business_day((now() at time zone :'tz_morning')::date, 'GB')
               then ((now() at time zone :'tz_morning')::date + time '09:00') at time zone :'tz_morning'
               else tests.next_window((now() at time zone :'tz_morning')::date, :'tz_morning', 'GB') end,
          'OA-3: approved before 9:00, it is dated 9:00 that day (or the next business day)');
select is(tests.sendable(:'p3_i'), extract(isodow from (now() at time zone :'tz_evening')) < 6,
          'OA-3: the database holds it only on a non-business day; WF2.5 applies the 9-5 window (wf2.5-send-batch.test.ts)');

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-4  Approved on a public holiday: Approvals shows the next business day; follow-up
-- dates skip holidays (fixed-date cases in 04_follow_up_dates.test.sql).
-- ═════════════════════════════════════════════════════════════════════════════════════════
select name as tz_day from pg_timezone_names
 where name ~ '^Etc/GMT[+-][0-9]+$' and extract(hour from now() at time zone name) between 11 and 14 order by name limit 1 \gset
select (now() at time zone :'tz_day')::date as local_today \gset
insert into public.holidays (holiday_date, name, country_code) values (:'local_today', 'Test holiday', 'GB');
select tests.client('GB', :'tz_day', true, 'OA-4') as c4 \gset
select tests.campaign(:'c4') as camp4 \gset
select tests.prospect(:'camp4') as p4 \gset
select tests.message(:'p4', 'initial', 'approved') as p4_i \gset
select is((select estimated_send_at from tests.schedule(:'c4', :'p4_i')), tests.next_window(:'local_today', :'tz_day', 'GB'),
          'OA-4: approved at midday on a public holiday, Approvals shows 9:00 on the next business day');
select tests.client('FR', :'tz_day', true, 'OA-4 no holiday') as c4b \gset
select tests.campaign(:'c4b') as camp4b \gset
select tests.prospect(:'camp4b') as p4b \gset
select tests.message(:'p4b', 'initial', 'approved') as p4b_i \gset
select is((select (estimated_send_at at time zone :'tz_day')::date from tests.schedule(:'c4b', :'p4b_i')),
          case when public.is_business_day(:'local_today', 'FR') then :'local_today'::date
               else (tests.next_window(:'local_today', :'tz_day', 'FR') at time zone :'tz_day')::date end,
          'OA-4: the same approval in a country without that holiday is dated today (if a weekday)');
select ok(not public.is_business_day(:'local_today', 'GB'), 'OA-4: the holiday is not a business day for the follow-up calendar either');
select ok(not tests.sendable(:'p4_i'), 'OA-4: the send gate does not release a first email on the public holiday (issue 7)');
select is(tests.block_reason(:'p4_i'), 'not_a_send_day', 'OA-4: Approvals shows it as waiting for a business day');
select is((select basis from tests.schedule(:'c4', :'p4_i')), 'queue_position_and_daily_cap', 'OA-4: and still gives it a date (it is not "held")');
select is(tests.sendable(:'p4b_i'), public.is_business_day(:'local_today', 'FR'),
          'OA-4: in a country without that holiday it is released on a weekday');
-- A follow-up that is due is held on the holiday too.
select tests.prospect(:'camp4') as p4c \gset
select tests.message(:'p4c', 'initial', 'approved') as p4c_i \gset
select tests.sent(:'p4c_i', now() - interval '30 days');
select tests.message(:'p4c', 'follow_up_d3', 'approved') as p4c_f1 \gset
select ok(not tests.sendable(:'p4c_f1'), 'OA-4: a due follow-up waits for the next business day as well');
-- The campaign's country decides: a GB client's US campaign sends on the GB holiday.
select tests.campaign(:'c4', 'US') as camp4us \gset
select tests.prospect(:'camp4us') as p4d \gset
select tests.message(:'p4d', 'initial', 'approved') as p4d_i \gset
select is(tests.sendable(:'p4d_i'), public.is_business_day(:'local_today', 'US'),
          'OA-4: a US campaign of the same client follows US holidays, not GB ones');
select tests.pin_send_day(true);

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-5  Overdue follow-up after the first email was sent long ago.
-- ═════════════════════════════════════════════════════════════════════════════════════════
select tests.client(:'ctry', :'tz', true, 'OA-5') as c5 \gset
select tests.user(:'c5') as u5 \gset
select tests.campaign(:'c5') as camp5 \gset
select tests.prospect(:'camp5') as p5 \gset
select tests.message(:'p5', 'initial', 'approved') as p5_i \gset
select tests.sent(:'p5_i', tests.minus_business_days(:'x0', 20, :'tz', :'ctry'));
select tests.schedule_next(:'p5_i');
select tests.message(:'p5', 'follow_up_d3', 'pending', tests.minus_business_days(:'x0', 15, :'tz', :'ctry')) as p5_f1 \gset
select ok(not tests.sendable(:'p5_f1'), 'OA-5: a follow-up overdue for 15 business days still needs approval');
select is((select basis from tests.schedule(:'c5', :'p5_f1')), 'previous_email_sent', 'OA-5: Approvals shows it as overdue, counted from the real send');
select tests.claims_client(:'u5');
set local session authorization authenticated;
update public.messages set approval_status = 'approved', approved_at = now(), approved_by = :'u5' where id = :'p5_f1' and approval_status = 'pending';
reset session authorization;
select tests.claims_none();
select ok(tests.sendable(:'p5_f1'), 'OA-5: once approved it is queued straight away (its interval passed long ago)');
select is(tests.sendable_count(:'p5'), 1::bigint, 'OA-5: only that one email');
select tests.sent(:'p5_f1', :'x0');
select tests.schedule_next(:'p5_f1') as p5_s2 \gset
select is((select due_at from public.follow_up_schedules where id = :'p5_s2'), public.add_business_days(:'x0', 5, :'tz', :'ctry'),
          'OA-5: follow-up 2 is recalculated from this send (5 business days), not from the original plan');
select ok((select due_at from public.follow_up_schedules where id = :'p5_s2') > now(), 'OA-5: so it is not immediately due');

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-6  Several follow-ups awaiting approval at once (upfront sequence, first email long sent).
-- ═════════════════════════════════════════════════════════════════════════════════════════
select tests.client(:'ctry', :'tz', true, 'OA-6') as c6 \gset
select tests.user(:'c6') as u6 \gset
select tests.campaign(:'c6', null, true) as camp6 \gset
select tests.prospect(:'camp6') as p6 \gset
select tests.message(:'p6', 'initial', 'approved') as p6_i \gset
select tests.sent(:'p6_i', tests.minus_business_days(:'x0', 30, :'tz', :'ctry'));
select tests.upfront_draft(:'p6', 'follow_up_d3') as p6_f1 \gset
select tests.upfront_draft(:'p6', 'follow_up_d7') as p6_f2 \gset
select tests.upfront_draft(:'p6', 'follow_up_d14') as p6_f3 \gset
select tests.claims_client(:'u6');
set local session authorization authenticated;
select is((public.approve_sequences(:'c6', array[:'p6']::uuid[])->>'emails_approved')::int, 3, 'OA-6: all three overdue follow-ups are approved at once');
reset session authorization;
select tests.claims_none();
select ok(tests.sendable(:'p6_f1'), 'OA-6: follow-up 1 is released');
select is(tests.sendable_count(:'p6'), 1::bigint, 'OA-6: and only follow-up 1, never all three together');
select is(tests.block_reason(:'p6_f2'), 'waiting_followup_timing', 'OA-6: follow-up 2 waits for follow-up 1');
select is((select basis from tests.schedule(:'c6', :'p6_f2')), 'depends_on_unsent_email', 'OA-6: Approvals dates follow-up 2 from follow-up 1''s estimate');
select tests.sent(:'p6_f1', :'x0');
select is(tests.sendable_count(:'p6'), 0::bigint, 'OA-6: after follow-up 1 goes out, follow-up 2 waits its 5 business days');
select tests.travel_business_days(:'c6', 5);
select ok(tests.sendable(:'p6_f2') and not tests.sendable(:'p6_f3'), 'OA-6: then follow-up 2 is released, follow-up 3 still waits');

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-7  Cadence: per-campaign cadence does not exist yet. Meanwhile the three places that
-- apply the 3/5/7 cadence in the database must agree (WF3's copy: wf3-follow-up-schedule.test.ts).
-- ═════════════════════════════════════════════════════════════════════════════════════════
select tests.client(:'ctry', :'tz', true, 'OA-7') as c7 \gset
select tests.campaign(:'c7') as camp7 \gset
create temp table cadence (step text, gap int, due_at timestamptz, approvals_at timestamptz, gate_releases_at_due boolean) on commit drop;
do $$
declare
  v_client uuid := (select id from public.clients where business_name = 'OA-7');
  v_camp uuid := (select id from public.campaigns where client_id = (select id from public.clients where business_name = 'OA-7'));
  v_steps text[][] := array[['initial','follow_up_d3','3'], ['follow_up_d3','follow_up_d7','5'], ['follow_up_d7','follow_up_d14','7']];
  v_x0 timestamptz := tests.business_moment('America/Chicago', 'US');
  s int; v_p uuid; v_prev uuid; v_next uuid; v_sched uuid; v_gap int; v_sent timestamptz;
begin
  for s in 1 .. 3 loop
    v_gap := v_steps[s][3]::int;
    v_sent := tests.minus_business_days(v_x0, v_gap, 'America/Chicago', 'US');   -- due exactly at v_x0
    v_p := tests.prospect(v_camp);
    v_prev := tests.message(v_p, v_steps[s][1], 'approved');
    perform tests.sent(v_prev, v_sent);
    v_sched := tests.schedule_next(v_prev);
    v_next := tests.message(v_p, v_steps[s][2], 'pending');
    insert into cadence values (v_steps[s][2], v_gap,
      (select due_at from public.follow_up_schedules where id = v_sched),
      (select estimated_send_at from tests.schedule(v_client, v_next)),
      null);
    update public.messages set approval_status = 'approved' where id = v_next;
    update cadence set gate_releases_at_due = tests.sendable(v_next) where step = v_steps[s][2];
  end loop;
end $$;
select is_empty($$ select * from cadence where due_at <> tests.business_moment('America/Chicago', 'US') $$,
                'OA-7: the stored due dates use 3/5/7 business days for follow-ups 1/2/3');
select is_empty($$ select * from cadence where approvals_at is distinct from due_at $$,
                'OA-7: Approvals shows exactly the stored due date for each step');
select is_empty($$ select * from cadence where not gate_releases_at_due $$,
                'OA-7: the send gate releases each step exactly when it is due');

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-8  The prospect unsubscribes while follow-ups are scheduled and approved.
-- ═════════════════════════════════════════════════════════════════════════════════════════
select tests.client(:'ctry', :'tz', true, 'OA-8') as c8 \gset
select tests.campaign(:'c8', null, true) as camp8 \gset
select tests.prospect(:'camp8') as p8 \gset
select tests.message(:'p8', 'initial', 'approved') as p8_i \gset
select tests.sent(:'p8_i', :'x0');
select tests.schedule_next(:'p8_i') as p8_s1 \gset
select tests.upfront_draft(:'p8', 'follow_up_d3') as p8_f1 \gset
select tests.upfront_draft(:'p8', 'follow_up_d7') as p8_f2 \gset
update public.messages set approval_status = 'approved' where id in (:'p8_f1', :'p8_f2');
select unsubscribe_token as p8_token from public.prospects where id = :'p8' \gset
select tests.claims_anon();
set local session authorization anon;
select public.unsubscribe_by_token(:'p8_token');
reset session authorization;
select tests.claims_none();
select is((select status from public.follow_up_schedules where id = :'p8_s1'), 'cancelled', 'OA-8: the scheduled follow-up is cancelled');
select tests.travel_business_days(:'c8', 20);
select is(tests.sendable_count(:'p8'), 0::bigint, 'OA-8: the approved follow-ups never send, even when their dates pass');
select is((select count(*)::int from public.follow_up_schedules where prospect_id = :'p8' and status in ('pending', 'generating')), 0,
          'OA-8: nothing is left for WF5 to write');
select is((select count(*)::int from public.sequence_writer_queue where prospect_id = :'p8'), 0, 'OA-8: nor for WF19 (upfront writer)');
select is((select count(*)::int from tests.schedule(:'c8', :'p8_f1')) + (select count(*)::int from tests.schedule(:'c8', :'p8_f2')), 0,
          'OA-8: and the follow-ups leave the Approvals schedule');

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-9  The daily limit is already reached when the overdue email is approved.
-- ═════════════════════════════════════════════════════════════════════════════════════════
select tests.client(:'ctry', :'tz', true, 'OA-9') as c9 \gset
update public.client_email_credentials set warmup_mode = 'ramp', warmup_started_at = now() where client_id = :'c9';
select is(public.mailbox_daily_cap(:'c9'), 5, 'OA-9: a mailbox in its first warm-up week may send 5 a day');
select tests.campaign(:'c9') as camp9 \gset
do $$
declare v_camp uuid := (select id from public.campaigns where client_id = (select id from public.clients where business_name = 'OA-9'));
  i int; v_m uuid;
begin
  for i in 1 .. 5 loop
    v_m := tests.message(tests.prospect(v_camp), 'initial', 'approved');
    perform tests.sent(v_m, now());
  end loop;
end $$;
select tests.prospect(:'camp9') as p9 \gset
select tests.message(:'p9', 'initial', 'pending', now() - interval '30 days') as p9_i \gset
update public.messages set approval_status = 'approved', approved_at = now() where id = :'p9_i';
select is((select estimated_send_at from tests.schedule(:'c9', :'p9_i')),
          tests.next_window((now() at time zone :'tz')::date, :'tz', :'ctry'),
          'OA-9: with today''s 5 already sent, Approvals shows it at 9:00 on the next business day');
select ok(tests.sendable(:'p9_i'), 'OA-9: it stays queued; WF2.5 enforces the daily limit and sends due follow-ups first (wf2.5-send-batch.test.ts)');

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- OA-10 Gmail is disconnected when the overdue email is approved.
-- ═════════════════════════════════════════════════════════════════════════════════════════
select tests.client(:'ctry', :'tz', true, 'OA-10') as c10 \gset
select tests.campaign(:'c10') as camp10 \gset
select tests.prospect(:'camp10') as p10 \gset
select tests.message(:'p10', 'initial', 'pending', now() - interval '30 days') as p10_i \gset
update public.client_email_credentials set status = 'revoked' where client_id = :'c10';
update public.messages set approval_status = 'approved', approved_at = now() where id = :'p10_i';
select ok(not tests.sendable(:'p10_i'), 'OA-10: with Gmail disconnected the approved email is not sent');
select is(tests.block_reason(:'p10_i'), 'no_gmail', 'OA-10: Approvals says it is waiting for Gmail');
select is((select basis from tests.schedule(:'c10', :'p10_i')), 'held_by_send_rules', 'OA-10: and gives no send date while held');
select is((select send_status from public.messages where id = :'p10_i'), 'not_sent', 'OA-10: it is not marked failed');
-- A send already in progress when Gmail dropped: WF3 releases the claim with the error.
select public.claim_message_for_send(:'p10_i');
select public.release_message_claim(:'p10_i', 'gmail_not_connected');
select is((select row(send_status, send_attempts)::text from public.messages where id = :'p10_i'), row('not_sent', 0)::text,
          'OA-10: a send interrupted by the disconnection does not count as a failed attempt');
update public.client_email_credentials set status = 'active' where client_id = :'c10';
select is(tests.block_reason(:'p10_i'), 'retrying_send', 'OA-10: after reconnecting it waits for its retry time');
update public.messages set send_retry_at = now() - interval '1 minute' where id = :'p10_i';
select ok(tests.sendable(:'p10_i'), 'OA-10: then it is queued again');
select tests.sent(:'p10_i', :'x0');
select tests.schedule_next(:'p10_i') as p10_s1 \gset
select is((select due_at from public.follow_up_schedules where id = :'p10_s1'), public.add_business_days(:'x0', 3, :'tz', :'ctry'),
          'OA-10: follow-up 1 is counted from the send after reconnecting');
-- Real Gmail failures (Gmail connected) are retried, and fail only after 3 attempts.
select tests.prospect(:'camp10') as p10b \gset
select tests.message(:'p10b', 'initial', 'approved') as p10b_i \gset
select public.claim_message_for_send(:'p10b_i'); select public.release_message_claim(:'p10b_i', 'gmail_500');
select is((select send_status from public.messages where id = :'p10b_i'), 'not_sent', 'OA-10: a Gmail error is retried, not dropped');
select public.claim_message_for_send(:'p10b_i'); select public.release_message_claim(:'p10b_i', 'gmail_500');
select public.claim_message_for_send(:'p10b_i'); select public.release_message_claim(:'p10b_i', 'gmail_500');
select is((select row(send_status, send_attempts)::text from public.messages where id = :'p10b_i'), row('failed', 3)::text,
          'OA-10: after 3 failed attempts it is marked failed');

select * from finish();
rollback;
