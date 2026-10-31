alter table public.holidays drop constraint if exists holidays_holiday_date_key;
alter table public.holidays add constraint holidays_date_country_key unique (holiday_date, country_code);

insert into public.holidays (holiday_date, name, country_code) values
  ('2026-10-28','Czech Statehood Day','CZ'),
  ('2026-11-17','Struggle for Freedom and Democracy Day','CZ'),
  ('2026-12-24','Christmas Eve','CZ'),
  ('2026-12-25','Christmas Day','CZ'),
  ('2026-12-26','St. Stephen''s Day','CZ'),
  ('2027-01-01','New Year''s Day','CZ'),
  ('2027-03-26','Good Friday','CZ'),
  ('2027-03-29','Easter Monday','CZ'),
  ('2027-05-01','Labour Day','CZ'),
  ('2027-05-08','Liberation Day','CZ'),
  ('2027-07-05','Saints Cyril and Methodius Day','CZ'),
  ('2027-07-06','Jan Hus Day','CZ'),
  ('2027-09-28','Czech Statehood Day','CZ'),
  ('2027-10-28','Independent Czechoslovak State Day','CZ'),
  ('2027-11-17','Struggle for Freedom and Democracy Day','CZ'),
  ('2027-12-24','Christmas Eve','CZ'),
  ('2027-12-25','Christmas Day','CZ'),
  ('2027-12-26','St. Stephen''s Day','CZ'),
  ('2027-01-01','New Year''s Day','US'),
  ('2027-05-31','Memorial Day','US'),
  ('2027-07-05','Independence Day (observed)','US'),
  ('2027-09-06','Labor Day','US'),
  ('2027-11-25','Thanksgiving','US'),
  ('2027-12-24','Christmas Day (observed)','US')
on conflict (holiday_date, country_code) do nothing;

create or replace function public.is_business_day(p_day date, p_country text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select extract(isodow from p_day) < 6
     and not exists (select 1 from public.holidays h
                     where h.holiday_date = p_day and h.country_code = upper(coalesce(nullif(p_country,''),'US')));
$$;
revoke all on function public.is_business_day(date, text) from public, anon;
grant execute on function public.is_business_day(date, text) to authenticated, service_role;

create or replace function public.add_business_days(p_start timestamptz, p_days integer, p_tz text, p_country text)
returns timestamptz language plpgsql stable security definer set search_path to 'public' as $$
declare d timestamptz := p_start; left_days integer := p_days; tz text := coalesce(nullif(p_tz,''),'America/Denver');
begin
  while left_days > 0 loop
    d := d + interval '1 day';
    if public.is_business_day((d at time zone tz)::date, p_country) then left_days := left_days - 1; end if;
  end loop;
  return d;
end; $$;
revoke all on function public.add_business_days(timestamptz, integer, text, text) from public, anon;
grant execute on function public.add_business_days(timestamptz, integer, text, text) to authenticated, service_role;

create or replace view public.sendable_messages as
 SELECT m.id, m.prospect_id, m.campaign_id, m.client_id, m.channel, m.subject, m.body, m.message_type,
    m.approval_status, m.approved_by, m.approved_at, m.send_status, m.scheduled_for, m.sent_at,
    m.gmail_message_id, m.gmail_thread_id, m.created_at, m.updated_at, m.opened_at, m.open_count,
    m.last_opened_at, m.send_claimed_at
   FROM (((messages m
     JOIN prospects p ON ((p.id = m.prospect_id)))
     LEFT JOIN campaigns c ON ((c.id = m.campaign_id)))
     LEFT JOIN clients cl ON ((cl.id = m.client_id)))
  WHERE ((m.approval_status = 'approved'::text) AND (m.send_status = 'not_sent'::text) AND COALESCE(( SELECT ps.unsubscribe_ok
           FROM platform_settings ps
          WHERE (ps.id = 1)), true) AND (p.pipeline_status <> ALL (ARRAY['replied'::text, 'hot_lead'::text, 'won'::text, 'lost'::text, 'called'::text, 'bounced'::text])) AND (p.sequence_paused = false) AND ((m.message_type = 'initial'::text) OR (p.followups_stopped = false)) AND (COALESCE(c.status, 'active'::text) <> ALL (ARRAY['paused'::text, 'cancelled'::text, 'draft'::text])) AND (NOT (EXISTS ( SELECT 1
           FROM do_not_contact d
          WHERE (lower(d.email) = lower(p.email))))) AND (NOT (((COALESCE(c.language, ''::text) = 'Czech'::text) OR is_eu_country(COALESCE(c.country, cl.country))) AND ((is_generic_mailbox(p.email) AND (NOT COALESCE(cl.allow_generic_mailboxes, false))) OR is_freemail(p.email)))) AND (NOT (EXISTS ( SELECT 1
           FROM country_send_holds h
          WHERE ((h.cleared = false) AND (h.country = upper(COALESCE(c.country, cl.country, ''::text))))))) AND ((m.message_type = 'initial'::text) OR (EXISTS ( SELECT 1
           FROM messages prev
          WHERE ((prev.prospect_id = m.prospect_id) AND (prev.send_status = 'sent'::text) AND (prev.message_type =
                CASE m.message_type
                    WHEN 'follow_up_d3'::text THEN 'initial'::text
                    WHEN 'follow_up_d7'::text THEN 'follow_up_d3'::text
                    WHEN 'follow_up_d14'::text THEN 'follow_up_d7'::text
                    ELSE NULL::text
                END) AND (add_business_days(prev.sent_at,
                CASE m.message_type
                    WHEN 'follow_up_d3'::text THEN 3
                    WHEN 'follow_up_d7'::text THEN 5
                    ELSE 7
                END, COALESCE(cl.send_timezone, 'America/Chicago'::text), upper(COALESCE(NULLIF(c.country, ''::text), NULLIF(cl.country, ''::text), 'US'::text))) <= now()))))))