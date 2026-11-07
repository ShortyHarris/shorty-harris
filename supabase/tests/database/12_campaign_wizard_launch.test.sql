-- Campaign Wizard drafts and launch (migration campaign_wizard_drafts_and_launch): estimates,
-- today's cost line, drafts from ideas, launch checks, start dates, lifecycle, free rewrites
-- and the edit log.
begin;
select plan(43);

select tests.client() as client_a \gset
select tests.user(:'client_a') as user_a \gset
select tests.client('US', 'America/Chicago', false, 'No Gmail Co') as client_b \gset
select tests.user(:'client_b') as user_b \gset
insert into public.billing_profiles (client_id, credits_remaining, sms_credits_remaining) values (:'client_a', 1, 0)
  on conflict (client_id) do update set credits_remaining = 1;

-- ── Estimated prospects ──────────────────────────────────────────────────────────────────
select tests.claims_client(:'user_a');
set local session authorization authenticated;
select is(public.estimate_prospects(:'client_a', 2, 1, 500) - 'ok', '{"lo": 50, "hi": 160, "source": "default"}'::jsonb,
          'With no history anywhere, the default range per term × area pair is used');
select is((public.estimate_prospects(:'client_a', 5, 3, 100))->>'hi', '100', 'The range never goes over the campaign''s maximum results');
select is((public.estimate_prospects(:'client_b', 1, 1, 100))->>'error', 'not_permitted', 'A client cannot estimate for another client');
reset session authorization;

update public.campaigns set prospect_count = 0 where false; -- (no-op, keeps the plan readable)
insert into public.campaigns (client_id, name, status, channel, search_queries, target_locations, max_results, last_scraped_at, prospect_count)
values (:'client_a', 'Past campaign', 'completed', 'email', array['dentists','vets'], array['Austin, TX'], 500, now(), 200);
-- prospect_count is trigger-maintained; set it as the scraper's bookkeeping would.
update public.campaigns set prospect_count = 200 where name = 'Past campaign';
select tests.claims_client(:'user_a');
set local session authorization authenticated;
select is(public.estimate_prospects(:'client_a', 1, 1, 500) - 'ok', '{"lo": 70, "hi": 130, "source": "client_history"}'::jsonb,
          'With history, the range comes from what past campaigns found per pair (100), ±30%');
reset session authorization;

-- ── Cost line, today's pricing ───────────────────────────────────────────────────────────
insert into public.monthly_launch_usage (client_id, month, launch_count)
values (:'client_a', to_char(now() at time zone 'utc', 'YYYY-MM'), 3);
select tests.claims_client(:'user_a');
set local session authorization authenticated;
select public.estimate_campaign_cost(:'client_a', '[{"lo":450,"hi":650},{"lo":80,"hi":140},{"lo":60,"hi":120},{"lo":10,"hi":20}]') as cost \gset
select is((:'cost'::jsonb)->'items'->0->>'hot_lo' || '–' || ((:'cost'::jsonb)->'items'->0->>'hot_hi'), '2–7',
          'Hot leads are 0.5%–1.0% of the prospect range (450–650 → 2–7)');
select is((select array_agg(i->>'launch') from jsonb_array_elements((:'cost'::jsonb)->'items') i), array['free','free','credit','credit'],
          'The 2 free launches left this month go to the first campaigns, then 1 credit each');
select is((:'cost'::jsonb)->>'credits_needed', '2', 'Two credits are needed');
select is((:'cost'::jsonb)->>'short_by', '1', 'With 1 credit, the client is short by 1');
select is((:'cost'::jsonb)->>'free_launches_left', '2', 'Free launches left is reported');
reset session authorization;

-- ── Drafts from ideas ────────────────────────────────────────────────────────────────────
insert into public.wizard_sessions (client_id, created_by, answers, ideas)
values (:'client_a', :'user_a',
  '{"goal":{"goal":"quotes","cta":"Reply for a quote"},"audience":{"exclusions":["Homeowners"]}}',
  $$[{"id":"lawn","name":"Commercial Lawn Maintenance","service":"Lawn mowing","target":"Property managers","reason":"Recurring work",
      "fit":"strong","search_queries":["property management company"],"business_types":["Property managers"],
      "target_areas":[{"mode":"text","label":"Bozeman, Montana"}],"max_results":200,"est_lo":120,"est_hi":200},
     {"id":"snow","name":"Commercial Snow Removal","service":"Snow removal","target":"Retail centres","reason":"Winter contracts",
      "fit":"seasonal","search_queries":["shopping center"],"target_areas":[{"mode":"text","label":"Bozeman, Montana"}],
      "max_results":150,"suggested_start":"2999-11-01","est_lo":40,"est_hi":90}]$$)
returning id as session_a \gset
insert into public.client_services (client_id, name) values (:'client_a', 'Lawn mowing');

select tests.claims_client(:'user_a');
set local session authorization authenticated;
select throws_ok(format($$ select public.create_wizard_drafts(%L, array['lawn']) $$, :'session_a'), '42501', null,
                 'Clients cannot create drafts directly (the AI function writes the emails first)');
reset session authorization;

select tests.claims_service();
set local session authorization service_role;
select public.create_wizard_drafts(:'session_a', array['lawn','snow','nope'],
  '{"lawn":[{"subject":"Lawn care for your properties","body":"Hi {{first_name}}"},{"subject":"Following up","body":"Hi again"}]}') as drafts \gset
reset session authorization;
select is(jsonb_array_length((:'drafts'::jsonb)->'created'), 2, 'One draft per selected idea; unknown ids are ignored');
select is((select status || '/' || origin from public.campaigns where name = 'Commercial Lawn Maintenance'), 'draft/wizard', 'Drafts are wizard drafts');
select is((select est_prospects_lo || '–' || est_prospects_hi from public.campaigns where name = 'Commercial Lawn Maintenance'), '120–200', 'The estimate is kept on the draft');
select is((select jsonb_array_length(sequence) from public.campaigns where name = 'Commercial Lawn Maintenance'), 2, 'The emails are saved on the draft');
select ok((select service_id is not null from public.campaigns where name = 'Commercial Lawn Maintenance'), 'The draft is linked to its service');
select is((select icp->>'cta' from public.campaigns where name = 'Commercial Lawn Maintenance'), 'Reply for a quote', 'The goal and call to action travel with it');
select is((select start_date from public.campaigns where name = 'Commercial Snow Removal'), '2999-11-01'::date, 'A seasonal idea keeps its suggested start date');
select is((select status from public.wizard_sessions where id = :'session_a'), 'completed', 'The session is completed');

select tests.claims_service();
set local session authorization service_role;
select is(jsonb_array_length((public.create_wizard_drafts(:'session_a', array['lawn']))->'created'), 1, 'Asking again returns the existing draft');
reset session authorization;
select is((select count(*)::int from public.campaigns where name = 'Commercial Lawn Maintenance'), 1, 'and never makes a duplicate');

update public.clients set max_campaigns = 3 where id = :'client_a';
update public.wizard_sessions set ideas = ideas || '[{"id":"hoa","name":"HOA Partnerships","search_queries":["hoa management"],"target_areas":[{"mode":"text","label":"Bozeman"}],"max_results":100}]'
 where id = :'session_a';
select tests.claims_service();
set local session authorization service_role;
select is((public.create_wizard_drafts(:'session_a', array['hoa']))->'skipped'->0->>'reason', 'campaign_limit',
          'An idea over the client''s campaign limit is skipped with a reason');
reset session authorization;

-- ── Launch checks ────────────────────────────────────────────────────────────────────────
select id as lawn from public.campaigns where name = 'Commercial Lawn Maintenance' \gset
select id as snow from public.campaigns where name = 'Commercial Snow Removal' \gset
select tests.claims_client(:'user_a');
set local session authorization authenticated;
select is((public.campaign_launch_problems(:'lawn'))->>'ready', 'true', 'A complete draft is ready to launch');
update public.campaigns set sequence = jsonb_set(sequence, '{1,body}', '"  "') where id = :'lawn';
select is((public.campaign_launch_problems(:'lawn'))->'problems'->0->>'code', 'blank_email', 'A blank email body blocks launch');
select is((public.prepare_campaign_launch(:'lawn'))->>'result', 'problems', 'and prepare_campaign_launch refuses');
update public.campaigns set sequence = jsonb_set(sequence, '{1,body}', '"Hi again"') where id = :'lawn';
select is((public.prepare_campaign_launch(:'lawn'))->>'result', 'launch_now', 'Fixed, it can launch now (the app then calls the launch gate)');
select is((public.prepare_campaign_launch(:'snow'))->>'result', 'scheduled', 'A future start date schedules it instead');
reset session authorization;
select is((select status from public.campaigns where id = :'snow'), 'scheduled', 'The campaign is scheduled');

insert into public.campaigns (client_id, name, status, channel, search_queries, target_locations, max_results)
values (:'client_b', 'No mailbox', 'draft', 'email', array['dentists'], array['Austin'], 100);
select tests.claims_client(:'user_b');
set local session authorization authenticated;
select is((public.campaign_launch_problems((select id from public.campaigns where name = 'No mailbox')))->'problems'->0->>'code', 'no_mailbox',
          'Without a connected Gmail the launch step says so');
select is((public.campaign_launch_problems(:'lawn'))->>'error', 'not_permitted', 'A client cannot check another client''s campaign');
reset session authorization;

-- Scheduled campaigns are released when their date comes (the webhook call itself is not run here).
update public.campaigns set start_date = current_date where id = :'snow';
select is((select count(*)::int from public.campaigns where status = 'scheduled' and start_date <= current_date), 1,
          'release_scheduled_campaigns finds the due campaign');

-- ── Lifecycle ────────────────────────────────────────────────────────────────────────────
update public.campaigns set status = 'active' where id = :'lawn';
select tests.claims_client(:'user_a');
set local session authorization authenticated;
select is((public.set_campaign_lifecycle(:'lawn', 'pause'))->>'status', 'paused', 'A client can pause a running campaign');
select is((public.set_campaign_lifecycle(:'lawn', 'resume'))->>'status', 'active', 'and resume it');
select is((public.set_campaign_lifecycle(:'lawn', 'resume'))->>'error', 'not_allowed', 'Resuming a running campaign is refused');
select is((public.set_campaign_lifecycle(:'lawn', 'archive'))->>'status', 'archived', 'A campaign can be archived');
select is((public.set_campaign_lifecycle(:'lawn', 'restore'))->>'status', 'paused', 'A launched campaign comes back paused, never sending by itself');
update public.campaigns set archived_at = now() where id = :'lawn';
select ok((select archived_at is null from public.campaigns where id = :'lawn'), 'A client cannot set archive fields directly');
select is((public.clone_campaign(:'lawn'))->>'error', 'campaign_limit', 'Cloning respects the campaign limit');
reset session authorization;
select is((select count(*)::int from public.audit_logs where resource_id = :'lawn' and action like 'campaign_%'), 4,
          'Each lifecycle action is logged');

-- ── Free rewrites ────────────────────────────────────────────────────────────────────────
select tests.claims_service();
set local session authorization service_role;
select is((public.use_campaign_rewrite(:'snow'))->>'left', '2', 'First free rewrite: 2 left');
select public.use_campaign_rewrite(:'snow');
select is((public.use_campaign_rewrite(:'snow'))->>'left', '0', 'Third: 0 left');
select is((public.use_campaign_rewrite(:'snow'))->>'error', 'no_rewrites_left', 'A fourth is refused');
reset session authorization;
select tests.claims_client(:'user_a');
set local session authorization authenticated;
select throws_ok(format($$ select public.use_campaign_rewrite(%L) $$, :'snow'), '42501', null,
                 'Clients cannot spend rewrites themselves');
reset session authorization;

-- ── Edit log ─────────────────────────────────────────────────────────────────────────────
update public.campaigns set status = 'active' where id = :'lawn';
select tests.claims_client(:'user_a');
set local session authorization authenticated;
update public.campaigns set sequence = jsonb_set(sequence, '{0,subject}', '"New subject"') where id = :'lawn';
reset session authorization;
select is((select count(*)::int from public.audit_logs where resource_id = :'lawn' and action = 'campaign_edited'), 1,
          'Editing a live campaign is logged');

select * from finish();
rollback;
