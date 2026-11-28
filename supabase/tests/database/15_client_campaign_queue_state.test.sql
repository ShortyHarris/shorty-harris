-- client_campaign_queue_state (migration 20261128180000): a client's Campaigns page can see
-- that its own launched campaigns are queued or running, how many jobs are ahead, and nothing
-- about any other client's campaigns. Finished jobs are not "in flight" and are left out.
begin;
select plan(9);

select tests.client() as client_a \gset
select tests.user(:'client_a') as user_a \gset
select tests.campaign(:'client_a') as camp_queued \gset
select tests.campaign(:'client_a') as camp_running \gset
select tests.campaign(:'client_a') as camp_done \gset

select tests.client('CZ', 'Europe/Prague', true, 'Client B') as client_b \gset
select tests.campaign(:'client_b') as camp_b \gset

-- Client B's job was requested first, so it is ahead of client A's queued one.
insert into public.discovery_queue (campaign_id, status, requested_at)
values (:'camp_b', 'queued', now() - interval '10 minutes');
insert into public.discovery_queue (campaign_id, status, requested_at)
values (:'camp_queued', 'queued', now() - interval '5 minutes');
insert into public.discovery_queue (campaign_id, status, requested_at, started_at)
values (:'camp_running', 'running', now() - interval '20 minutes', now() - interval '3 minutes');
insert into public.discovery_queue (campaign_id, status, requested_at, started_at, finished_at)
values (:'camp_done', 'done', now() - interval '1 day', now() - interval '1 day', now() - interval '23 hours');

select ok(has_function_privilege('authenticated', 'public.client_campaign_queue_state(uuid)', 'execute'),
          'Signed-in users can call client_campaign_queue_state');
select ok(not has_function_privilege('anon', 'public.client_campaign_queue_state(uuid)', 'execute'),
          'The public cannot');

select tests.claims_client(:'user_a');
set local session authorization authenticated;

select is((select count(*)::int from public.discovery_queue), 0,
          'A client still cannot read the queue table itself');
select is((select count(*)::int from public.client_campaign_queue_state(:'client_a')), 2,
          'A client sees their queued and running campaigns, not finished ones');
select is((select status from public.client_campaign_queue_state(:'client_a') where campaign_id = :'camp_queued'), 'queued',
          'The queued campaign shows as queued');
select is((select ahead from public.client_campaign_queue_state(:'client_a') where campaign_id = :'camp_queued'), 1,
          'with the one earlier job (another client''s) counted ahead of it');
select is((select status from public.client_campaign_queue_state(:'client_a') where campaign_id = :'camp_running'), 'running',
          'The running campaign shows as running');
select is((select ahead from public.client_campaign_queue_state(:'client_a') where campaign_id = :'camp_running'), null::int,
          'and has no queue position');
select is((select count(*)::int from public.client_campaign_queue_state(:'client_b')), 0,
          'A client gets nothing for another client''s id');

reset session authorization;

select * from finish();
rollback;
