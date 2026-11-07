-- Follow-up dates: a follow-up is due 3, 5 and 7 business days after the previous email was
-- actually sent, in the client's time zone, skipping the campaign country's public holidays.
-- The due date stored on the schedule (follow_up_due_from_send_gate trigger, which overrides
-- WF3's proposal), the send gate (sendable_messages) and the Approvals page
-- (approvals_schedule) must all agree. Issue 1 in docs/REGRESSION-TESTING-PLAN.md.
begin;
select plan(13);

select tests.client('US', 'America/Chicago') as us_client \gset
select tests.campaign(:'us_client') as us_campaign \gset
select tests.campaign(:'us_client', 'CZ') as cz_campaign_of_us_client \gset

-- ── The stored due date (trigger) ───────────────────────────────────────────────────────
-- First email sent Mon 23 Nov 2026 09:00 Chicago. WF3 proposes Thu 26 Nov (3 weekdays,
-- no holidays); that is Thanksgiving, when the send gate would not release it.
select tests.prospect(:'us_campaign') as p1 \gset
select tests.message(:'p1', 'initial', 'approved') as p1_initial \gset
select tests.sent(:'p1_initial', '2026-11-23 15:00+00');
select tests.schedule_next(:'p1_initial', '2026-11-26 15:00+00') as p1_schedule \gset
select is((select due_at from public.follow_up_schedules where id = :'p1_schedule'), '2026-11-27 15:00+00'::timestamptz,
          'WF3''s Thanksgiving due date is replaced: follow-up 1 is due Fri 27 Nov, as the send gate counts');

-- The campaign's country decides the holidays, before the client's.
select tests.prospect(:'cz_campaign_of_us_client') as p2 \gset
select tests.message(:'p2', 'initial', 'approved') as p2_initial \gset
select tests.sent(:'p2_initial', '2026-11-23 15:00+00');
select tests.schedule_next(:'p2_initial', '2026-11-26 15:00+00') as p2_schedule \gset
select is((select due_at from public.follow_up_schedules where id = :'p2_schedule'), '2026-11-26 15:00+00'::timestamptz,
          'A CZ campaign of a US client uses CZ holidays: Thanksgiving is a normal day');

-- Follow-up 2 (+5) and follow-up 3 (+7), each from the previous email's real send.
select tests.message(:'p1', 'follow_up_d3', 'approved') as p1_fu1 \gset
select tests.sent(:'p1_fu1', '2026-11-30 16:30+00');
select tests.schedule_next(:'p1_fu1', '2026-12-01 00:00+00') as p1_schedule2 \gset
select is((select due_at from public.follow_up_schedules where id = :'p1_schedule2'), '2026-12-07 16:30+00'::timestamptz,
          'Follow-up 2 is due 5 business days after follow-up 1 actually went out (Mon 30 Nov -> Mon 7 Dec)');
select tests.message(:'p1', 'follow_up_d7', 'approved') as p1_fu2 \gset
select tests.sent(:'p1_fu2', '2026-12-18 15:00+00');
select tests.schedule_next(:'p1_fu2', '2026-12-19 00:00+00') as p1_schedule3 \gset
select is((select due_at from public.follow_up_schedules where id = :'p1_schedule3'), '2026-12-30 15:00+00'::timestamptz,
          'Follow-up 3 is due 7 business days after follow-up 2 (Fri 18 Dec -> Wed 30 Dec, skipping Christmas)');

-- Client time zone and country when the campaign has none.
select tests.client('CZ', 'Europe/Prague') as cz_client \gset
select tests.campaign(:'cz_client') as cz_campaign \gset
select tests.prospect(:'cz_campaign') as p3 \gset
select tests.message(:'p3', 'initial', 'approved') as p3_initial \gset
select tests.sent(:'p3_initial', '2026-12-22 08:00+00');
select tests.schedule_next(:'p3_initial', '2026-12-25 08:00+00') as p3_schedule \gset
select is((select due_at from public.follow_up_schedules where id = :'p3_schedule'), '2026-12-29 08:00+00'::timestamptz,
          'A CZ client''s follow-up skips 24-26 Dec and the weekend (Tue 22 Dec -> Tue 29 Dec)');

-- If the previous email is not recorded as sent, WF3's date is kept (nothing to recompute from).
select tests.prospect(:'us_campaign') as p4 \gset
insert into public.follow_up_schedules (prospect_id, client_id, follow_up_day, due_at, status)
values (:'p4', :'us_client', 3, '2026-11-26 15:00+00', 'pending') returning id as p4_schedule \gset
select is((select due_at from public.follow_up_schedules where id = :'p4_schedule'), '2026-11-26 15:00+00'::timestamptz,
          'With no sent previous email, the proposed due date is kept');

-- ── The Approvals page agrees with the stored date ──────────────────────────────────────
select tests.message(:'p1', 'follow_up_d14', 'pending') as p1_fu3 \gset
select is((select estimated_send_at from tests.schedule(:'us_client', :'p1_fu3')),
          (select due_at from public.follow_up_schedules where id = :'p1_schedule3'),
          'Approvals shows follow-up 3 on the same date and time as its schedule');
select is((select basis from tests.schedule(:'us_client', :'p1_fu3')), 'previous_email_sent',
          'and says the date is counted from the previous email''s actual send');

-- KNOWN ISSUE: approvals_schedule counts holidays by the CLIENT's country, while the send gate
-- and the stored due date use the CAMPAIGN's country first. Live: 3 active US campaigns belong
-- to a CZ client, so Approvals can show a date the gate will not send on.
select tests.client('CZ', 'America/Chicago', true, 'CZ client, US campaign') as mixed_client \gset
select tests.campaign(:'mixed_client', 'US') as mixed_campaign \gset
select tests.prospect(:'mixed_campaign') as p5 \gset
select tests.message(:'p5', 'initial', 'approved') as p5_initial \gset
select tests.sent(:'p5_initial', '2026-11-23 15:00+00');
select tests.schedule_next(:'p5_initial', '2026-11-26 15:00+00') as p5_schedule \gset
select tests.message(:'p5', 'follow_up_d3', 'pending') as p5_fu1 \gset
select is((select due_at from public.follow_up_schedules where id = :'p5_schedule'), '2026-11-27 15:00+00'::timestamptz,
          'US campaign of a CZ client: the stored due date skips US Thanksgiving');
select todo('approvals_schedule uses the client''s country, not the campaign''s (docs/REGRESSION-TESTING-PLAN.md, issue 5)', 1);
select is((select estimated_send_at from tests.schedule(:'mixed_client', :'p5_fu1')), '2026-11-27 15:00+00'::timestamptz,
          'Approvals shows the same date for that follow-up');

-- ── Property: stored due date and send gate agree for every send time ───────────────────
-- For sends every 5 hours over the last 26 days, in a US and a CZ client (covering weekends,
-- the CZ holiday on 28 Oct, early-morning and late-evening sends), and for all three steps:
-- an approved follow-up is sendable exactly when its stored due date has passed.
create temp table sweep (country text, step text, sent_at timestamptz, due_at timestamptz, sendable boolean) on commit drop;
do $$
declare
  c record; i int; v_campaign uuid; v_prospect uuid; v_prev uuid; v_next uuid; v_sched uuid; v_sent timestamptz;
  steps text[][] := array[['initial','follow_up_d3'], ['follow_up_d3','follow_up_d7'], ['follow_up_d7','follow_up_d14']];
  s int;
begin
  for c in select * from (values ('US', 'America/Chicago'), ('CZ', 'Europe/Prague')) v(country, tz) loop
    v_campaign := tests.campaign(tests.client(c.country, c.tz, true, 'Sweep ' || c.country));
    for i in 0 .. 125 loop
      v_sent := date_trunc('hour', now()) - make_interval(hours => 5 * i) + interval '7 minutes';
      for s in 1 .. 3 loop
        v_prospect := tests.prospect(v_campaign);
        v_prev := tests.message(v_prospect, steps[s][1], 'approved');
        perform tests.sent(v_prev, v_sent);
        v_sched := tests.schedule_next(v_prev);
        v_next := tests.message(v_prospect, steps[s][2], 'approved');
        insert into sweep values (c.country, steps[s][2], v_sent,
          (select due_at from public.follow_up_schedules where id = v_sched), tests.sendable(v_next));
      end loop;
    end loop;
  end loop;
end $$;
select is((select count(*)::int from sweep), 756, 'The sweep covered 2 countries x 126 send times x 3 steps');
select ok((select count(*) from sweep where sendable) > 0 and (select count(*) from sweep where not sendable) > 0,
          'The sweep includes follow-ups both before and after their due date');
select is_empty($$ select country, step, sent_at, due_at, sendable from sweep where (due_at <= now()) <> sendable $$,
                'For every send time and step, the follow-up is sendable exactly when its stored due date has passed');

select * from finish();
rollback;
