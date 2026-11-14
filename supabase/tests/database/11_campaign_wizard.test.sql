-- Campaign Wizard foundation (migration campaign_wizard_foundation): the pilot switch, wizard
-- sessions, services, the screen-2 profile save, draft campaigns, and no staff approval for
-- pilot clients. See docs/CAMPAIGN_WIZARD_BUILD_PLAN.md.
begin;
select plan(35);

select tests.client() as client_a \gset
select tests.user(:'client_a') as user_a \gset
select tests.client('CZ', 'Europe/Prague', true, 'Client B') as client_b \gset
select tests.user(:'client_b') as user_b \gset
select tests.user(null, 'admin') as admin_user \gset
-- These tests cover the wizard once it is out for everyone; the sandbox-only rollout switch
-- (wizard_settings.sandbox_only) has its own file, 13_campaign_wizard_sandbox_gate.
update public.wizard_settings set sandbox_only = false where id = 1;

-- ── Tables are protected ─────────────────────────────────────────────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.wizard_sessions'::regclass), 'wizard_sessions has row level security');
select ok((select relrowsecurity from pg_class where oid = 'public.client_services'::regclass), 'client_services has row level security');
select ok(not has_table_privilege('anon', 'public.wizard_sessions', 'select'), 'The public cannot read wizard sessions');
select ok(has_function_privilege('authenticated', 'public.confirm_wizard_profile(uuid)', 'execute'), 'Signed-in users can confirm a wizard profile');
select ok(not has_function_privilege('anon', 'public.confirm_wizard_profile(uuid)', 'execute'), 'The public cannot');

-- ── On for every client; only an admin can switch it off ─────────────────────────────────
select is((select wizard_enabled from public.clients where id = :'client_a'), true, 'Every client has the wizard by default');
select tests.claims_client(:'user_a');
set local session authorization authenticated;
update public.clients set wizard_enabled = false where id = :'client_a';
reset session authorization;
select is((select wizard_enabled from public.clients where id = :'client_a'), true, 'A client cannot switch the wizard off themselves');

-- ── Sessions: own only, one open at a time ───────────────────────────────────────────────
select tests.claims_client(:'user_a');
set local session authorization authenticated;
insert into public.wizard_sessions (client_id, answers) values (:'client_a', '{"business":{"name":"Mountains Mowing"}}');
select is((select count(*)::int from public.wizard_sessions), 1, 'Client A can start a wizard session');
select throws_ok(format($$ insert into public.wizard_sessions (client_id) values (%L) $$, :'client_a'), '23505', null,
                 'Only one open session per client (so "continue where you left off" is unambiguous)');
select throws_ok(format($$ insert into public.wizard_sessions (client_id) values (%L) $$, :'client_b'), '42501', null,
                 'Client A cannot start a session for client B');
select (select id from public.wizard_sessions where client_id = :'client_a') as session_a \gset
update public.wizard_sessions set screen = 2, answers = answers || '{"goal":{"goal":"quotes"}}' where id = :'session_a';
select is((select screen::int from public.wizard_sessions where id = :'session_a'), 2, 'Autosave updates the session');
reset session authorization;

select tests.claims_client(:'user_b');
set local session authorization authenticated;
select is((select count(*)::int from public.wizard_sessions), 0, 'Client B cannot see client A''s session');
with u as (update public.wizard_sessions set screen = 3 where id = :'session_a' returning 1)
select is((select count(*)::int from u), 0, 'nor change it');
select is((public.confirm_wizard_profile(:'session_a'))->>'error', 'not_permitted', 'nor confirm it');
reset session authorization;

-- ── Confirming the profile ───────────────────────────────────────────────────────────────
select tests.claims_client(:'user_a');
set local session authorization authenticated;
select is((public.confirm_wizard_profile(:'session_a'))->'missing',
          '["service", "business_type", "area"]'::jsonb,
          'Missing required fields are named, and nothing is saved');
select is((select count(*)::int from public.client_services), 0, 'No services saved while fields are missing');

update public.wizard_sessions set answers = $${
  "business": {"name": "Mountains Mowing", "industry": "Landscaping", "description": "Lawn care around Bozeman"},
  "services": [{"name": "Lawn mowing", "source": "website"}, {"name": "Snow removal", "seasonal_months": [11, 12, 1, 2, 3], "source": "website"}, {"name": "  "}],
  "audience": {"business_types": ["Property managers", "HOA management companies", ""], "roles": ["Facilities manager"], "exclusions": ["Residential homeowners"]},
  "area": {"areas": [{"mode": "radius", "label": "Bozeman, Montana", "lat": "45.68", "lng": "-111.04", "radius_km": "80"}]},
  "goal": {"goal": "quotes", "cta": "Ask for a quote"}
}$$::jsonb where id = :'session_a';
select is((public.confirm_wizard_profile(:'session_a'))->>'ok', 'true', 'A complete profile is confirmed');
select is((select array_agg(name order by position) from public.client_services), array['Lawn mowing', 'Snow removal'],
          'Services are saved in order, blank ones dropped');
select is((select seasonal_months from public.client_services where name = 'Snow removal'), array[1, 2, 3, 11, 12]::smallint[],
          'Seasonal months are kept');
select is((select target_business_types from public.client_icp where client_id = :'client_a'), array['Property managers', 'HOA management companies'],
          'Business types go to the profile');
select is((select goal || ' / ' || cta from public.client_icp where client_id = :'client_a'), 'quotes / Ask for a quote', 'Goal and call to action are saved');
select is((select target_locations from public.client_icp where client_id = :'client_a'), array['Bozeman, Montana'], 'Areas are saved as place names');
select is((select screen::int from public.wizard_sessions where id = :'session_a'), 3, 'The session moves on to screen 3');

update public.wizard_sessions set answers = jsonb_set(answers, '{services}', '[{"name": "lawn mowing"}, {"name": "Landscaping"}]') where id = :'session_a';
select is((public.confirm_wizard_profile(:'session_a'))->>'ok', 'true', 'Confirming again works');
select is((select array_agg(name order by position) from public.client_services), array['Lawn mowing', 'Landscaping'],
          'Confirming again matches services by name, adds new ones and removes deleted ones');
reset session authorization;

-- ── Draft campaigns and protected fields ─────────────────────────────────────────────────
select tests.claims_client(:'user_a');
set local session authorization authenticated;
insert into public.campaigns (client_id, name, status, channel, origin, sequence)
values (:'client_a', 'Commercial Lawn Maintenance', 'draft', 'email', 'wizard', '[{"subject": "Hi", "body": "Hello"}]');
select is((select status from public.campaigns where name = 'Commercial Lawn Maintenance'), 'draft', 'A client can save a draft campaign');
select throws_ok(format($$ insert into public.campaigns (client_id, name, status, channel) values (%L, 'Sneaky', 'active', 'email') $$, :'client_a'),
                 '42501', null, 'but cannot insert a running one');
update public.campaigns set rewrites_used = 0, origin = 'manual', status = 'active' where name = 'Commercial Lawn Maintenance';
select is((select origin || '/' || status from public.campaigns where name = 'Commercial Lawn Maintenance'), 'wizard/draft',
          'A client cannot change a campaign''s origin or status directly');
select throws_ok(format($$ insert into public.campaigns (client_id, name, status, channel, sequence) values (%L, 'Too long', 'draft', 'email', '[{},{},{},{},{}]') $$, :'client_a'),
                 '23514', null, 'A campaign holds at most four emails');
reset session authorization;

-- ── No staff approval with the wizard on ─────────────────────────────────────────────────
select tests.claims_client(:'admin_user');
set local session authorization authenticated;
update public.clients set wizard_enabled = false where id = :'client_b';
reset session authorization;
select is((select wizard_enabled from public.clients where id = :'client_b'), false, 'An admin can switch the wizard off for a client');
select tests.claims_client(:'user_b');
set local session authorization authenticated;
insert into public.campaigns (client_id, name, status, channel) values (:'client_b', 'Not in pilot', 'pending_review', 'email');
reset session authorization;
select is((select status from public.campaigns where name = 'Not in pilot'), 'pending_review', 'With the wizard off, a new campaign still waits for review');

select tests.claims_client(:'admin_user');
set local session authorization authenticated;
update public.clients set wizard_enabled = true where id = :'client_b';
reset session authorization;
select is((select wizard_enabled from public.clients where id = :'client_b'), true, 'An admin can switch it back on');
select tests.claims_client(:'user_b');
set local session authorization authenticated;
insert into public.campaigns (client_id, name, status, channel) values (:'client_b', 'In pilot', 'pending_review', 'email');
reset session authorization;
select is((select status from public.campaigns where name = 'In pilot'), 'active', 'With the wizard on, it goes straight to active (no staff approval)');

select tests.claims_client(:'user_b');
set local session authorization authenticated;
insert into public.campaigns (client_id, name, status, channel) values (:'client_b', 'Pilot draft', 'draft', 'email');
reset session authorization;
select is((select status from public.campaigns where name = 'Pilot draft'), 'draft', 'A draft stays a draft until it is launched');

-- ── Services belong to their client ──────────────────────────────────────────────────────
select tests.claims_client(:'user_b');
set local session authorization authenticated;
select is((select count(*)::int from public.client_services), 0, 'Client B cannot see client A''s services');
reset session authorization;

select * from finish();
rollback;
