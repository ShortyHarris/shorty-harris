-- Permissions per role: a client sees and changes only their own data, cannot use another
-- client's functions or backend-only ones, the public (anon) sees nothing private, and every
-- function and table the app uses is usable by signed-in users (a missing grant took the
-- Approvals page down for every client once).
begin;
select plan(31);

select tests.client() as client_a \gset
select tests.user(:'client_a') as user_a \gset
select tests.campaign(:'client_a') as campaign_a \gset
select tests.prospect(:'campaign_a') as prospect_a \gset
select tests.message(:'prospect_a') as msg_a \gset

select tests.client('CZ', 'Europe/Prague', true, 'Client B') as client_b \gset
select tests.user(:'client_b') as user_b \gset
select tests.campaign(:'client_b') as campaign_b \gset
select tests.prospect(:'campaign_b') as prospect_b \gset
select tests.message(:'prospect_b') as msg_b \gset

select tests.user(null, 'admin') as admin_user \gset

-- ── Every function and table the app uses is usable by a signed-in user ──────────────────
-- Lists taken from app/src (supabase.rpc(...) and supabase.from(...) calls). Admin screens
-- run as signed-in users too, so admin functions are included.
select is_empty($$
  select f from unnest(array['admin_adjust_credits','admin_create_sandbox_client','admin_prospect_categories',
    'approvals_schedule','approve_sequences','approved_queue','client_analytics','client_pipeline',
    'client_result_insights','client_targeting_performance','hot_lead_queue','is_domain_blacklisted',
    'prospect_sequence','purge_blacklisted_prospects','sandbox_simulate_purchase','save_client_icp',
    'send_pacing','set_campaign_upfront_sequence','set_hot_lead_outcome','set_prospect_note',
    'suggest_campaign_inputs','unsubscribe_by_token','validate_campaign_inputs']) f
  where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f
                      and has_function_privilege('authenticated', p.oid, 'execute'))
$$, 'Every database function the app calls can be executed by signed-in users');
select is_empty($$
  select t from unnest(array['ab_metrics','ab_tests','ab_variants','billing_profiles','blacklisted_domains',
    'blog_link_graph','blog_posts','campaigns','client_email_credentials','client_icp','client_usage','clients',
    'country_send_holds','credit_transactions','discovery_queue','do_not_contact','docs_articles','error_logs',
    'hot_leads','messages','messages_with_sender','monthly_launch_usage','notifications','optout_stats',
    'payments','profiles','prospects','replies','warm_prospects']) t
  where not has_table_privilege('authenticated', 'public.' || t, 'select')
$$, 'Every table and view the app reads can be selected by signed-in users');
select ok(has_function_privilege('anon', 'public.unsubscribe_by_token(uuid)', 'execute'),
          'The public unsubscribe page can call unsubscribe_by_token without logging in');

-- ── Row level security is on for every table ────────────────────────────────────────────
select is_empty($$ select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity $$,
                'Row level security is enabled on every table');

-- ── A client sees only their own data ───────────────────────────────────────────────────
select tests.claims_client(:'user_a');
set local session authorization authenticated;
select is((select count(*)::int from public.messages), 1, 'Client A sees exactly their one email');
select is((select count(*)::int from public.messages where id = :'msg_b'), 0, 'Client A cannot see client B''s email');
select is((select count(*)::int from public.prospects where id = :'prospect_b'), 0, 'nor client B''s prospect');
select is((select count(*)::int from public.campaigns where id = :'campaign_b'), 0, 'nor client B''s campaign');
select is((select count(*)::int from public.clients), 1, 'Client A sees only their own client record');
with u as (update public.messages set approval_status = 'approved' where id = :'msg_b' returning 1)
select is((select count(*)::int from u), 0, 'Client A cannot approve client B''s email');
select throws_ok(format($$ update public.messages set client_id = %L where id = %L $$, :'client_b', :'msg_a'), '42501', null,
                 'Client A cannot move their email to client B');
select is(public.approve_sequences(:'client_b', array[:'prospect_b']::uuid[])->>'error', 'not_permitted',
          'Client A cannot approve client B''s sequences');
select is(public.approved_queue(:'client_b')->>'error', 'not_permitted', 'Client A cannot read client B''s approvals queue');
select is((select count(*)::int from public.approvals_schedule(:'client_b')), 0, 'Client A gets nothing from client B''s approvals schedule');
select is(public.stop_followups(:'prospect_b')->>'error', 'not_permitted', 'Client A cannot stop client B''s follow-ups');
select is(public.set_campaign_upfront_sequence(:'campaign_b', true)->>'error', 'not_permitted', 'Client A cannot change client B''s campaign');
select ok(public.approved_queue(:'client_a')->>'ok' = 'true', 'Client A can read their own approvals queue');
select is((select count(*)::int from public.approvals_schedule(:'client_a')), 1, 'and their own approvals schedule');
select ok(not public.is_trusted_backend(), 'A signed-in client is not treated as the backend');
-- Backend-only functions
select throws_ok($$ select public.suppress_prospects_for_email('x@example.com') $$, '42501', null,
                 'A client cannot call the backend-only suppression function');
select throws_ok($$ select public.sandbox_shift_clock(gen_random_uuid(), 60) $$, '42501', null,
                 'A client cannot call the backend-only sandbox clock');
select throws_ok($$ insert into public.do_not_contact (email, reason) values ('someone@example.com', 'manual') $$, '42501', null,
                 'A client cannot add to the do-not-contact list directly');
reset session authorization;

-- ── An admin sees everything; a profile's role decides it ───────────────────────────────
select tests.claims_client(:'admin_user');
set local session authorization authenticated;
select ok(public.is_admin(), 'An admin profile is an admin');
select is((select count(*)::int from public.messages where id in (:'msg_a', :'msg_b')), 2, 'An admin sees every client''s emails');
reset session authorization;

-- Impersonation: an admin acting as client B is limited to client B.
select tests._claims('authenticated', :'admin_user', jsonb_build_object('impersonating', true, 'client_id', :'client_b'));
set local session authorization authenticated;
select ok(not public.is_admin(), 'An admin impersonating a client is not an admin while impersonating');
select is((select count(*)::int from public.messages where id in (:'msg_a', :'msg_b')), 1, 'and sees only that client''s emails');
reset session authorization;

-- ── The public sees nothing private ─────────────────────────────────────────────────────
select tests.claims_anon();
set local session authorization anon;
select is((select count(*)::int from public.messages), 0, 'Anonymous visitors see no emails');
select is((select count(*)::int from public.prospects), 0, 'nor prospects');
select is((select count(*)::int from public.clients), 0, 'nor clients');
reset session authorization;
select tests.claims_none();

-- ── Known issue: the send pipeline's claim functions are open to anonymous callers ───────
-- claim_message_for_send and release_message_claim are executable by anon (the public API key).
-- With a message id, anyone could hold an email (claim) or, by releasing it three times,
-- mark it failed. Only the backend (n8n, service role) calls them.
select todo('Send-pipeline functions should be backend-only (docs/REGRESSION-TESTING-PLAN.md, issue 6)', 2);
select ok(not has_function_privilege('anon', 'public.claim_message_for_send(uuid)', 'execute'),
          'Anonymous callers cannot claim emails for sending');
select ok(not has_function_privilege('anon', 'public.release_message_claim(uuid, text)', 'execute'),
          'Anonymous callers cannot release send claims (which can mark emails failed)');

select * from finish();
rollback;
