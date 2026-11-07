-- Business days and public holidays (is_business_day, add_business_days): the calendar every
-- follow-up date and the send gate depend on. Fixed dates, so the result never depends on
-- when the test runs. Holidays come from supabase/baseline/reference_data.sql.
begin;
select plan(16);

-- is_business_day
select ok(public.is_business_day('2026-11-23', 'US'), 'Monday 23 Nov 2026 is a US business day');
select ok(not public.is_business_day('2026-11-26', 'US'), 'Thanksgiving (Thu 26 Nov 2026) is not a US business day');
select ok(public.is_business_day('2026-11-26', 'CZ'), 'US Thanksgiving is an ordinary business day in CZ');
select ok(not public.is_business_day('2026-11-17', 'CZ'), '17 Nov 2026 (Struggle for Freedom Day) is not a CZ business day');
select ok(not public.is_business_day('2026-11-28', 'US'), 'Saturday is never a business day');
select ok(not public.is_business_day('2026-11-26', null), 'No country means US holidays');
select ok(not public.is_business_day('2026-11-26', 'us'), 'Country codes are not case sensitive');

-- add_business_days(start, n, time zone, country): what the send gate and follow-up dates use
select is(public.add_business_days('2026-11-23 15:00+00', 3, 'America/Chicago', 'US'),
          '2026-11-27 15:00+00'::timestamptz,
          'Mon 23 Nov + 3 US business days skips Thanksgiving: Fri 27 Nov, same time of day');
select is(public.add_business_days('2026-11-23 15:00+00', 3, 'America/Chicago', 'CZ'),
          '2026-11-26 15:00+00'::timestamptz,
          'The same send for a CZ campaign is due Thu 26 Nov (not a CZ holiday)');
select is(public.add_business_days('2026-11-06 15:00+00', 3, 'America/Chicago', 'US'),
          '2026-11-11 15:00+00'::timestamptz,
          'Fri 6 Nov + 3 business days skips the weekend: Wed 11 Nov');
select is(public.add_business_days('2026-12-22 10:00+00', 3, 'Europe/Prague', 'CZ'),
          '2026-12-29 10:00+00'::timestamptz,
          'Tue 22 Dec + 3 CZ business days skips 24-26 Dec and the weekend: Tue 29 Dec');
select is(public.add_business_days('2026-11-13 15:00+00', 5, 'America/Chicago', 'US'),
          '2026-11-20 15:00+00'::timestamptz,
          'Follow-up 2 gap: Fri 13 Nov + 5 business days is Fri 20 Nov');
select is(public.add_business_days('2026-11-20 15:00+00', 7, 'America/Chicago', 'US'),
          '2026-12-02 15:00+00'::timestamptz,
          'Follow-up 3 gap: Fri 20 Nov + 7 business days skips Thanksgiving: Wed 2 Dec');

-- The day is judged in the client's time zone, not UTC.
-- Thu 26 Nov 2026 03:00 UTC is still Wed 25 Nov 21:00 in Chicago.
select is(public.add_business_days('2026-11-25 03:00+00', 1, 'America/Chicago', 'US'),
          '2026-11-26 03:00+00'::timestamptz,
          'Tue 24 Nov 21:00 Chicago + 1 business day lands on Wed 25 Nov 21:00 Chicago (03:00 UTC Thu)');
select is(public.add_business_days('2026-11-26 03:00+00', 1, 'America/Chicago', 'US'),
          '2026-11-28 03:00+00'::timestamptz,
          'Wed 25 Nov 21:00 Chicago + 1 business day skips Thanksgiving: Fri 27 Nov 21:00 Chicago');
select is(public.add_business_days('2026-11-23 15:00+00', 0, 'America/Chicago', 'US'),
          '2026-11-23 15:00+00'::timestamptz, 'Zero business days returns the start unchanged');

select * from finish();
rollback;
