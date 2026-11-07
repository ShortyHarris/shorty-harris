-- Reference data the business rules read, copied from the live database on 2026-11-05.
-- Applied after schema.sql when building a test database. No customer data.
--
-- holidays: the public-holiday calendar that add_business_days, is_business_day and the send
--   gate use. Keep in step with the live table when holidays are added.
-- Single-row settings tables: live values, except platform_settings, where the agency's name,
--   address and alert contacts are replaced with test placeholders.

begin;

insert into public.holidays (holiday_date, name, country_code) values
  ('2026-10-28', 'Czech Statehood Day', 'CZ'),
  ('2026-11-17', 'Struggle for Freedom and Democracy Day', 'CZ'),
  ('2026-12-24', 'Christmas Eve', 'CZ'),
  ('2026-12-25', 'Christmas Day', 'CZ'),
  ('2026-12-26', 'St. Stephen''s Day', 'CZ'),
  ('2027-01-01', 'New Year''s Day', 'CZ'),
  ('2027-03-26', 'Good Friday', 'CZ'),
  ('2027-03-29', 'Easter Monday', 'CZ'),
  ('2027-05-01', 'Labour Day', 'CZ'),
  ('2027-05-08', 'Liberation Day', 'CZ'),
  ('2027-07-05', 'Saints Cyril and Methodius Day', 'CZ'),
  ('2027-07-06', 'Jan Hus Day', 'CZ'),
  ('2027-09-28', 'Czech Statehood Day', 'CZ'),
  ('2027-10-28', 'Independent Czechoslovak State Day', 'CZ'),
  ('2027-11-17', 'Struggle for Freedom and Democracy Day', 'CZ'),
  ('2027-12-24', 'Christmas Eve', 'CZ'),
  ('2027-12-25', 'Christmas Day', 'CZ'),
  ('2027-12-26', 'St. Stephen''s Day', 'CZ'),
  ('2026-07-03', 'Independence Day (observed)', 'US'),
  ('2026-09-07', 'Labor Day', 'US'),
  ('2026-11-26', 'Thanksgiving', 'US'),
  ('2026-12-25', 'Christmas Day', 'US'),
  ('2027-01-01', 'New Year''s Day', 'US'),
  ('2027-05-31', 'Memorial Day', 'US'),
  ('2027-07-05', 'Independence Day (observed)', 'US'),
  ('2027-09-06', 'Labor Day', 'US'),
  ('2027-11-25', 'Thanksgiving', 'US'),
  ('2027-12-24', 'Christmas Day (observed)', 'US');

insert into public.hot_lead_policy select * from json_populate_record(null::public.hot_lead_policy,
  '{"id":1,"nudge_after_hours":24,"second_nudge_after_hours":72,"max_nudges":2,"escalate_after_hours":120,"quiet_hours_start":21,"quiet_hours_end":8,"updated_at":"2026-10-03T10:21:11.920839+00:00"}');

insert into public.scrape_limits select * from json_populate_record(null::public.scrape_limits,
  '{"id":1,"max_search_terms":5,"max_locations":3,"max_term_location_pairs":10,"max_results":500,"poll_timeout_minutes":30,"stall_timeout_minutes":60,"updated_at":"2026-10-02T16:40:21.537365+00:00","max_prospects_per_domain":2}');

insert into public.platform_settings select * from json_populate_record(null::public.platform_settings,
  '{"id":1,"agency_name":"Test Agency","agency_postal_address":"1 Test Street, Testville","allow_agency_address_fallback":true,"unsubscribe_base_url":"https://example.test/unsubscribe","updated_at":"2026-10-04T00:40:40.780054+00:00","agency_alert_email":"alerts@example.test","agency_alert_phone":null,"unsubscribe_ok":true,"unsubscribe_checked_at":"2026-11-05T05:05:13.56+00:00","unsubscribe_detail":null,"thread_followups":true,"sandbox_webhook_suffix":null}');

insert into public.ai_breaker (id, state) values (1, 'closed');
insert into public.discovery_lock (id, is_locked) values (1, false);

commit;
