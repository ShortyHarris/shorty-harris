-- Campaign wizard rollout switch (migration campaign_wizard_sandbox_gate): with
-- wizard_settings.sandbox_only on, only sandbox accounts get the wizard and skip staff review;
-- with it off, every client does. clients.wizard_enabled still switches one client off.
begin;
select plan(17);

select tests.client('US', 'America/Chicago', true, 'Real client') as real_client \gset
select tests.user(:'real_client') as real_user \gset
select tests.client('US', 'America/Chicago', true, 'Sandbox client') as sandbox_client \gset
select tests.user(:'sandbox_client') as sandbox_user \gset
select tests.user(null, 'admin') as admin_user \gset
-- is_sandbox is admin-only (the guard trigger keeps the old value otherwise), so set it with
-- the guard off, as a one-off setup step.
alter table public.clients disable trigger trg_protect_client_admin_fields;
update public.clients set is_sandbox = true where id = :'sandbox_client';
alter table public.clients enable trigger trg_protect_client_admin_fields;

-- ── Defaults ──────────────────────────────────────────────────────────────────────────────
select is((select sandbox_only from public.wizard_settings where id = 1), true, 'The wizard starts sandbox-only');
select is((select wizard_enabled from public.clients where id = :'real_client'), true, 'The per-client switch is on by default');
select ok(not has_function_privilege('anon', 'public.wizard_on_for(uuid)', 'execute'), 'The public cannot ask who has the wizard');

-- ── Sandbox-only: only the sandbox account has it ─────────────────────────────────────────
select tests.claims_client(:'real_user');
set local session authorization authenticated;
select is(public.wizard_on_for(:'real_client'), false, 'Sandbox-only: a real client does not have the wizard');
select is(public.wizard_on_for(:'sandbox_client'), false, 'and cannot ask about another client');
insert into public.campaigns (client_id, name, status, channel) values (:'real_client', 'Real, sandbox-only', 'pending_review', 'email');
reset session authorization;
select is((select status from public.campaigns where name = 'Real, sandbox-only'), 'pending_review', 'Sandbox-only: a real client''s campaign still waits for review');

select tests.claims_client(:'sandbox_user');
set local session authorization authenticated;
select is(public.wizard_on_for(:'sandbox_client'), true, 'Sandbox-only: the sandbox account has the wizard');
insert into public.campaigns (client_id, name, status, channel) values (:'sandbox_client', 'Sandbox, sandbox-only', 'pending_review', 'email');
reset session authorization;
select is((select status from public.campaigns where name = 'Sandbox, sandbox-only'), 'active', 'and its campaigns skip review');

-- ── Only an admin can flip the switch ─────────────────────────────────────────────────────
select tests.claims_client(:'real_user');
set local session authorization authenticated;
update public.wizard_settings set sandbox_only = false where id = 1;
reset session authorization;
select is((select sandbox_only from public.wizard_settings where id = 1), true, 'A client cannot open the wizard to everyone');

select tests.claims_client(:'admin_user');
set local session authorization authenticated;
update public.wizard_settings set sandbox_only = false where id = 1;
select is(public.wizard_on_for(:'real_client'), true, 'An admin can ask about any client');
reset session authorization;
select is((select sandbox_only from public.wizard_settings where id = 1), false, 'An admin can open the wizard to everyone');

-- ── Everyone: real clients have it too ────────────────────────────────────────────────────
select tests.claims_client(:'real_user');
set local session authorization authenticated;
select is(public.wizard_on_for(:'real_client'), true, 'Everyone: a real client has the wizard');
insert into public.campaigns (client_id, name, status, channel) values (:'real_client', 'Real, everyone', 'pending_review', 'email');
reset session authorization;
select is((select status from public.campaigns where name = 'Real, everyone'), 'active', 'and its campaigns skip review');

-- ── The per-client switch still turns one client off ──────────────────────────────────────
select tests.claims_client(:'admin_user');
set local session authorization authenticated;
update public.clients set wizard_enabled = false where id = :'real_client';
reset session authorization;
select tests.claims_client(:'real_user');
set local session authorization authenticated;
select is(public.wizard_on_for(:'real_client'), false, 'Everyone, but switched off for this client: no wizard');
insert into public.campaigns (client_id, name, status, channel) values (:'real_client', 'Real, switched off', 'pending_review', 'email');
reset session authorization;
select is((select status from public.campaigns where name = 'Real, switched off'), 'pending_review', 'and its campaigns wait for review');

-- ── The backend can ask about any client ──────────────────────────────────────────────────
select tests.claims_service();
set local session authorization service_role;
select is(public.wizard_on_for(:'sandbox_client'), true, 'The backend (edge functions) can ask about any client');
reset session authorization;
select tests.claims_none();
select is(public.wizard_on_for(gen_random_uuid()), false, 'An unknown client never has the wizard');

select * from finish();
rollback;
