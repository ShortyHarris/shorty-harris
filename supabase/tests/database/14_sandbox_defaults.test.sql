-- "+ New sandbox" (admin_create_sandbox_client): every sandbox account gets the same limits
-- (migration sandbox_same_limits_for_everyone). A tester must be able to run the campaign
-- wizard more than once without hitting the campaign limit.
begin;
select plan(8);

select tests.user(null, 'admin') as admin_user \gset
select tests.client() as client_a \gset
select tests.user(:'client_a') as user_a \gset

select tests.claims_client(:'admin_user');
set local session authorization authenticated;
select (public.admin_create_sandbox_client('Test Tester', 'tester@example.com') ->> 'client_id') as sandbox \gset
reset session authorization;

select is((select is_sandbox from public.clients where id = :'sandbox'), true, 'An admin can create a sandbox account');
select is((select max_campaigns from public.clients where id = :'sandbox'), 20, 'It can hold 20 campaigns');
select is((select monthly_prospect_limit from public.clients where id = :'sandbox'), 1000, 'and find 1,000 businesses a month');
select is((select auto_approve_campaigns from public.clients where id = :'sandbox'), true, 'Its campaigns skip staff review');
select is((select allow_generic_mailboxes from public.clients where id = :'sandbox'), false, 'Generic mailboxes stay off');
select is((select credits_remaining from public.billing_profiles where client_id = :'sandbox'), 10000, 'It starts with 10,000 credits');
select is((select business_name from public.clients where id = :'sandbox'), 'Sandbox (Test Tester)', 'It is named after the tester');

select tests.claims_client(:'user_a');
set local session authorization authenticated;
select is(public.admin_create_sandbox_client('Sneaky', 'x@example.com') ->> 'error', 'not_permitted', 'A client cannot create one');
reset session authorization;

select * from finish();
rollback;
