-- Shared helpers for the pgTAP database tests (supabase/tests/database). Installed into the
-- test database by scripts/db/build-test-db.sh; never applied to the live project.
--
-- Fixtures: tests.client(), tests.user(), tests.campaign(), tests.prospect(), tests.message(),
--           tests.sent() (mark an email sent at a given time, as WF3 does).
-- Acting as someone: tests.claims_client(uid) / claims_service() / claims_anon(), then
--           `set local session authorization authenticated|service_role|anon`. That switches the
--           SESSION user, as a real API request does, so is_trusted_backend() and auth.uid()
--           behave as in production (a plain SET ROLE would leave session_user = the test login,
--           which the database trusts as the backend).
-- Questions: tests.sendable(id), tests.block_reason(id), tests.schedule(client, message).
--
-- Every test file runs in one transaction that is rolled back, so fixtures never leak.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- A client with an active, already-warm Gmail connection (40 a day) unless told otherwise.
create or replace function tests.client(
  p_country text default 'US',
  p_tz text default 'America/Chicago',
  p_gmail boolean default true,
  p_name text default 'Test Client'
) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into public.clients (business_name, contact_email, country, send_timezone, status,
                              representative_name, postal_address)
  values (p_name, 'owner@client.example', p_country, p_tz, 'active', 'Dana Tester', '1 Main St')
  returning id into v_id;
  if p_gmail then
    insert into public.client_email_credentials (client_id, email_address, status, warmup_mode)
    values (v_id, 'sender@client.example', 'active', 'warm');
  end if;
  return v_id;
end $$;

-- A signed-up user. Role 'client' (attached to p_client_id) or 'admin'.
create or replace function tests.user(p_client_id uuid default null, p_role text default 'client')
returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          v_id || '@users.example',
          jsonb_build_object('role', p_role, 'client_id', p_client_id, 'full_name', 'Test ' || p_role),
          now(), now());
  -- handle_new_user() creates the profile; make sure role and client are exactly as asked.
  update public.profiles set role = p_role, client_id = p_client_id where id = v_id;
  return v_id;
end $$;

create or replace function tests.campaign(
  p_client_id uuid,
  p_country text default null,
  p_upfront boolean default false,
  p_status text default 'active'
) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into public.campaigns (client_id, name, status, country, upfront_sequence)
  values (p_client_id, 'Test campaign', p_status, p_country, p_upfront)
  returning id into v_id;
  return v_id;
end $$;

create or replace function tests.prospect(p_campaign_id uuid, p_email text default null)
returns uuid
language plpgsql as $$
declare v_id uuid; v_client uuid;
begin
  select client_id into v_client from public.campaigns where id = p_campaign_id;
  insert into public.prospects (campaign_id, client_id, business_name, contact_name, email, pipeline_status)
  values (p_campaign_id, v_client, 'Prospect Co', 'Pat Prospect',
          -- Own domain per prospect: at most 2 prospects per domain are admitted (admit_prospect_guard).
          coalesce(p_email, 'pat@' || left(gen_random_uuid()::text, 8) || '.prospect.example'), 'new')
  returning id into v_id;
  if v_id is null then
    raise exception 'tests.prospect: the prospect was not admitted (blacklist or per-domain cap)';
  end if;
  return v_id;
end $$;

-- An email draft. p_type: initial | follow_up_d3 | follow_up_d7 | follow_up_d14. A follow-up
-- draft marks the prospect's pending schedule as generated, as WF5 does when it writes one.
-- p_pending_since backdates when it started waiting for approval ("awaiting approval for 30 days").
create or replace function tests.message(
  p_prospect_id uuid,
  p_type text default 'initial',
  p_approval text default 'pending',
  p_pending_since timestamptz default null
) returns uuid
language plpgsql as $$
declare v_id uuid; p record;
begin
  select * into p from public.prospects where id = p_prospect_id;
  insert into public.messages (prospect_id, campaign_id, client_id, subject, body, message_type,
                               approval_status, approved_at, created_at, pending_since)
  values (p.id, p.campaign_id, p.client_id, 'Hello', E'Hi Pat,\n\nA short note.\n\nBest,\nDana\nTest Client',
          p_type, p_approval, case when p_approval = 'approved' then now() end,
          coalesce(p_pending_since, now()), coalesce(p_pending_since, now()))
  returning id into v_id;
  -- Writing a follow-up draft uses up the prospect's active schedule, as WF5 does.
  if p_type <> 'initial' then
    update public.follow_up_schedules set status = 'generated', updated_at = now()
     where prospect_id = p_prospect_id and status in ('pending', 'generating');
  end if;
  return v_id;
end $$;

-- Marks an email sent at p_at, the way WF3 does after Gmail accepts it.
create or replace function tests.sent(p_message_id uuid, p_at timestamptz default now())
returns void
language sql as $$
  update public.messages
     set send_status = 'sent', sent_at = p_at, send_claimed_at = null,
         approval_status = case when approval_status = 'pending' then 'approved' else approval_status end,
         approved_at = coalesce(approved_at, p_at), updated_at = now()
   where id = p_message_id;
$$;

-- What WF3 does after a send: schedule the next step (due date as WF3 proposes it; the
-- database trigger recomputes it with the send gate's rule).
create or replace function tests.schedule_next(p_message_id uuid, p_wf3_due timestamptz default null)
returns uuid
language plpgsql as $$
declare m record; v_id uuid; v_day int;
begin
  select * into m from public.messages where id = p_message_id;
  v_day := case m.message_type when 'initial' then 3 when 'follow_up_d3' then 7 when 'follow_up_d7' then 14 end;
  if v_day is null then return null; end if;
  if m.sent_at is null then raise exception 'tests.schedule_next: email % has not been sent', p_message_id; end if;
  -- In an upfront sequence the earlier step's schedule can still be open (its draft was written
  -- in advance). Production closes it before scheduling the next step: on 2026-11-05 every sent
  -- follow-up (906) had its next schedule and no unique-index errors were logged.
  update public.follow_up_schedules set status = 'generated', updated_at = now()
   where prospect_id = m.prospect_id and status in ('pending', 'generating');
  insert into public.follow_up_schedules (prospect_id, client_id, follow_up_day, due_at, status)
  values (m.prospect_id, m.client_id, v_day, coalesce(p_wf3_due, m.sent_at + interval '3 days'), 'pending')
  returning id into v_id;
  return v_id;
end $$;

-- ── Acting as someone ────────────────────────────────────────────────────────────────────
-- JWT claims for the rest of the transaction, as PostgREST sets them for an API request.
create or replace function tests._claims(p_role text, p_sub uuid, p_extra jsonb default '{}')
returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    (jsonb_build_object('role', p_role, 'aud', 'authenticated') || coalesce(jsonb_build_object('sub', p_sub), '{}') || p_extra)::text,
    true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
end $$;

-- The session user itself cannot be switched inside a function, so a test sets the claims
-- with one of these and then runs the matching statement, for example:
--   select tests.claims_client(:'user_id');  set local session authorization authenticated;
--   ...                                       reset session authorization;
create or replace function tests.claims_client(p_user uuid) returns void
language sql as $$ select tests._claims('authenticated', p_user); $$;
create or replace function tests.claims_service() returns void
language sql as $$ select tests._claims('service_role', null); $$;
create or replace function tests.claims_anon() returns void
language sql as $$ select tests._claims('anon', null); $$;
-- Back to the backend with no request: no JWT at all (auth.uid() and auth.role() are null).
create or replace function tests.claims_none() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end $$;

-- ── Questions ────────────────────────────────────────────────────────────────────────────
-- Would the sender (WF2.5 reads sendable_messages) pick this email up right now?
create or replace function tests.sendable(p_message_id uuid) returns boolean
language sql stable as $$
  select exists (select 1 from public.sendable_messages s where s.id = p_message_id);
$$;

-- Why an approved, unsent email is held (message_block_reasons), or null if it is sendable.
create or replace function tests.block_reason(p_message_id uuid) returns text
language sql stable as $$
  select reason from public.message_block_reasons where message_id = p_message_id;
$$;

-- The Approvals page's row for one email (approvals_schedule).
create or replace function tests.schedule(p_client_id uuid, p_message_id uuid)
returns table (estimated_send_at timestamptz, is_confirmed boolean, basis text)
language sql stable as $$
  select s.estimated_send_at, s.is_confirmed, s.basis
    from public.approvals_schedule(p_client_id) s where s.message_id = p_message_id;
$$;

-- Local wall-clock time of a timestamp in a zone, for readable assertions.
create or replace function tests.local(p_at timestamptz, p_tz text default 'America/Chicago')
returns timestamp
language sql immutable as $$ select p_at at time zone p_tz; $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Time travel for one client: moves every timestamp of its emails and follow-up schedules
-- back by p_by, so "now" is p_by later in its timeline (the technique the sandbox clock uses).
create or replace function tests.travel(p_client_id uuid, p_by interval)
returns void
language sql as $$
  update public.messages
     set created_at = created_at - p_by, pending_since = pending_since - p_by,
         approved_at = approved_at - p_by, sent_at = sent_at - p_by,
         rejected_at = rejected_at - p_by, send_retry_at = send_retry_at - p_by
   where client_id = p_client_id;
  update public.follow_up_schedules
     set due_at = due_at - p_by, created_at = created_at - p_by
   where client_id = p_client_id;
$$;

-- How many of a prospect's emails the sender could pick up right now.
create or replace function tests.sendable_count(p_prospect_id uuid) returns bigint
language sql stable as $$
  select count(*) from public.sendable_messages s where s.prospect_id = p_prospect_id;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ── Business-day time travel ─────────────────────────────────────────────────────────────
-- p_n business days before p_at (same clock time; the inverse of add_business_days for a
-- business-day start).
create or replace function tests.minus_business_days(p_at timestamptz, p_n int, p_tz text, p_country text)
returns timestamptz
language plpgsql stable as $$
declare d timestamptz := p_at; left_days int := p_n;
begin
  if p_at is null then return null; end if;
  while left_days > 0 loop
    d := d - interval '1 day';
    if public.is_business_day((d at time zone p_tz)::date, p_country) then left_days := left_days - 1; end if;
  end loop;
  return d;
end $$;

-- The latest moment at or before now that is p_time local on a business day: a time the
-- sender could have sent at. Tests send at this moment so "now" is just after the send.
create or replace function tests.business_moment(p_tz text, p_country text, p_time time default '10:00')
returns timestamptz
language plpgsql stable as $$
declare v_day date := (now() at time zone p_tz)::date;
begin
  loop
    if public.is_business_day(v_day, p_country) and ((v_day + p_time) at time zone p_tz) <= now() then
      return (v_day + p_time) at time zone p_tz;
    end if;
    v_day := v_day - 1;
  end loop;
end $$;

-- Moves a client's timeline back by p_n business days, so that "now" is p_n business days
-- later for its emails and schedules, and every "N business days after the send" relation
-- between them is preserved (a plain calendar shift would move sends onto weekends).
create or replace function tests.travel_business_days(p_client_id uuid, p_n int)
returns void
language plpgsql as $$
declare v_tz text; v_ctry text;
begin
  select send_timezone, upper(coalesce(nullif(country, ''), 'US')) into v_tz, v_ctry from public.clients where id = p_client_id;
  update public.messages
     set created_at = tests.minus_business_days(created_at, p_n, v_tz, v_ctry),
         pending_since = tests.minus_business_days(pending_since, p_n, v_tz, v_ctry),
         approved_at = tests.minus_business_days(approved_at, p_n, v_tz, v_ctry),
         sent_at = tests.minus_business_days(sent_at, p_n, v_tz, v_ctry),
         send_retry_at = tests.minus_business_days(send_retry_at, p_n, v_tz, v_ctry)
   where client_id = p_client_id;
  update public.follow_up_schedules
     set due_at = tests.minus_business_days(due_at, p_n, v_tz, v_ctry),
         created_at = tests.minus_business_days(created_at, p_n, v_tz, v_ctry)
   where client_id = p_client_id;
end $$;

-- A follow-up draft written in advance by WF19 (upfront sequences); unlike tests.message()
-- it leaves follow-up schedules alone.
create or replace function tests.upfront_draft(p_prospect_id uuid, p_type text, p_pending_since timestamptz default null)
returns uuid
language plpgsql as $$
declare v_id uuid; p record;
begin
  select * into p from public.prospects where id = p_prospect_id;
  insert into public.messages (prospect_id, campaign_id, client_id, subject, body, message_type, created_at, pending_since)
  values (p.id, p.campaign_id, p.client_id, 'Following up', E'Hi Pat,\n\nFollowing up.\n\nBest,\nDana\nTest Client',
          p_type, coalesce(p_pending_since, now()), coalesce(p_pending_since, now()))
  returning id into v_id;
  return v_id;
end $$;

-- Next business day at 09:00 local strictly after p_day (the Approvals page's "next window").
create or replace function tests.next_window(p_day date, p_tz text, p_country text)
returns timestamptz
language plpgsql stable as $$
declare d date := p_day + 1;
begin
  while not public.is_business_day(d, p_country) loop d := d + 1; end loop;
  return (d + time '09:00') at time zone p_tz;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ── Pinning "is today a send day" ────────────────────────────────────────────────────────
-- The send gate holds every email on weekends and public holidays (is_send_day). Tests that
-- are not about that pin the answer for their transaction, like freezing a clock, so they
-- give the same result on any day; tests.unpin_send_day() restores the real rule. Both are
-- undone by the test's rollback in any case.
create or replace function tests.pin_send_day(p_on boolean default true) returns void
language plpgsql as $pin$
begin
  create temp table if not exists _send_day_def (def text) on commit drop;
  if not exists (select 1 from _send_day_def) then
    insert into _send_day_def values (pg_get_functiondef('public.is_send_day(uuid,uuid)'::regprocedure));
  end if;
  execute format($f$create or replace function public.is_send_day(p_client_id uuid, p_campaign_id uuid)
    returns boolean language sql stable as $b$ select %L::boolean $b$ $f$, p_on);
end $pin$;

create or replace function tests.unpin_send_day() returns void
language plpgsql as $$
begin
  if to_regclass('pg_temp._send_day_def') is not null then
    execute (select def from _send_day_def);
  end if;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
