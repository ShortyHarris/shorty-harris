-- Campaign Wizard, milestones 3 and 4: estimates, drafts from ideas, launch checks, start
-- dates, lifecycle actions, the free-rewrite counter and the edit log.
-- See docs/CAMPAIGN_WIZARD_BUILD_PLAN.md. Pricing is today's: 5 free launches a month, then
-- 1 credit per launch (charged by the WF0a gate, unchanged), 1 credit per hot lead.

-- ── Campaign statuses and estimates ───────────────────────────────────────────────────────
alter table public.campaigns drop constraint campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('pending_review', 'draft', 'scheduled', 'active', 'paused', 'completed', 'archived'));

alter table public.campaigns
  add column if not exists est_prospects_lo integer,
  add column if not exists est_prospects_hi integer,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_from_status text;

alter table public.campaigns add constraint campaigns_estimate_check
  check ((est_prospects_lo is null and est_prospects_hi is null)
         or (est_prospects_lo >= 0 and est_prospects_hi >= est_prospects_lo));

-- Calls the wizard's AI function makes, for rate limiting and support. Backend only.
create table public.wizard_ai_calls (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  action text not null,
  ok boolean not null,
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index wizard_ai_calls_client_time on public.wizard_ai_calls (client_id, created_at desc);
alter table public.wizard_ai_calls enable row level security;
create policy admin_read_wizard_ai_calls on public.wizard_ai_calls for select using (public.is_admin());
revoke all on table public.wizard_ai_calls from anon, authenticated;
grant select on table public.wizard_ai_calls to authenticated;
grant select, insert on table public.wizard_ai_calls to service_role;

-- ── Wizard settings (one place, so they can change without a deploy) ──────────────────────
create table public.wizard_settings (
  id integer primary key default 1 check (id = 1),
  free_rewrites_per_campaign integer not null default 3,
  hot_rate_lo numeric not null default 0.005,
  hot_rate_hi numeric not null default 0.010,
  free_launches_per_month integer not null default 5,
  default_per_pair_lo integer not null default 25,
  default_per_pair_hi integer not null default 80,
  ai_calls_per_hour integer not null default 30,
  updated_at timestamptz not null default now()
);
insert into public.wizard_settings (id) values (1) on conflict do nothing;
alter table public.wizard_settings enable row level security;
create policy admin_all_wizard_settings on public.wizard_settings for all using (public.is_admin()) with check (public.is_admin());
create policy read_wizard_settings on public.wizard_settings for select using (auth.uid() is not null);
revoke all on table public.wizard_settings from anon;
grant select on table public.wizard_settings to authenticated;
grant select, insert, update on table public.wizard_settings to service_role;

-- ── Estimated prospects ───────────────────────────────────────────────────────────────────
-- Based on how many businesses past campaigns found per search term × area pair: this
-- client's history first, then every client's, then a default. Always a range, capped at
-- the campaign's maximum results.
create or replace function public.estimate_prospects(p_client_id uuid, p_terms integer, p_areas integer, p_max_results integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_pairs integer := greatest(coalesce(p_terms, 1), 1) * greatest(coalesce(p_areas, 1), 1);
  v_per_pair numeric;
  v_source text;
  v_settings public.wizard_settings;
  v_lo integer;
  v_hi integer;
  v_cap integer := greatest(coalesce(p_max_results, 0), 0);
begin
  if not public.can_manage_client(p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  select * into v_settings from public.wizard_settings where id = 1;

  select avg(c.prospect_count::numeric
             / greatest(coalesce(array_length(c.search_queries, 1), 1), 1)
             / greatest(coalesce(jsonb_array_length(nullif(c.target_areas, 'null'::jsonb)), array_length(c.target_locations, 1), 1), 1))
    into v_per_pair
    from public.campaigns c
   where c.client_id = p_client_id and c.last_scraped_at is not null and c.prospect_count > 0;
  v_source := 'client_history';

  if v_per_pair is null then
    select avg(c.prospect_count::numeric
               / greatest(coalesce(array_length(c.search_queries, 1), 1), 1)
               / greatest(coalesce(jsonb_array_length(nullif(c.target_areas, 'null'::jsonb)), array_length(c.target_locations, 1), 1), 1))
      into v_per_pair
      from public.campaigns c
     where c.last_scraped_at is not null and c.prospect_count > 0;
    v_source := 'all_history';
  end if;

  if v_per_pair is null then
    v_lo := v_settings.default_per_pair_lo * v_pairs;
    v_hi := v_settings.default_per_pair_hi * v_pairs;
    v_source := 'default';
  else
    v_lo := floor(v_per_pair * v_pairs * 0.7)::integer;
    v_hi := ceil(v_per_pair * v_pairs * 1.3)::integer;
  end if;

  if v_cap > 0 then
    v_lo := least(v_lo, v_cap);
    v_hi := least(v_hi, v_cap);
  end if;
  -- Round to tens so the range never looks more precise than it is.
  v_lo := (floor(v_lo / 10.0) * 10)::integer;
  v_hi := greatest((ceil(v_hi / 10.0) * 10)::integer, v_lo);
  if v_cap > 0 then v_hi := least(v_hi, v_cap); end if;

  return jsonb_build_object('ok', true, 'lo', v_lo, 'hi', v_hi, 'source', v_source);
end;
$function$;

-- ── Cost line (today's pricing) ───────────────────────────────────────────────────────────
-- The single place the wizard reads credit numbers from. p_items is an ordered array of
-- {lo, hi} prospect ranges; each gets estimated hot leads and a launch line. Free launches
-- left this month are handed out in order, then each launch costs 1 credit. The later pricing
-- project replaces the inside of this function; callers don't change.
create or replace function public.estimate_campaign_cost(p_client_id uuid, p_items jsonb)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_settings public.wizard_settings;
  v_used integer;
  v_free_left integer;
  v_balance integer;
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_lo integer;
  v_hi integer;
  v_kind text;
  v_credits_needed integer := 0;
begin
  if not public.can_manage_client(p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'items_must_be_array');
  end if;
  select * into v_settings from public.wizard_settings where id = 1;
  select coalesce(launch_count, 0) into v_used from public.monthly_launch_usage
   where client_id = p_client_id and month = to_char(now() at time zone 'utc', 'YYYY-MM');
  v_free_left := greatest(v_settings.free_launches_per_month - coalesce(v_used, 0), 0);
  select coalesce(credits_remaining, 0) into v_balance from public.billing_profiles where client_id = p_client_id;
  v_balance := coalesce(v_balance, 0);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_lo := greatest(coalesce((v_item->>'lo')::integer, 0), 0);
    v_hi := greatest(coalesce((v_item->>'hi')::integer, v_lo), v_lo);
    if v_free_left > 0 then
      v_kind := 'free';
      v_free_left := v_free_left - 1;
    else
      v_kind := 'credit';
      v_credits_needed := v_credits_needed + 1;
    end if;
    v_out := v_out || jsonb_build_object(
      'prospects_lo', v_lo,
      'prospects_hi', v_hi,
      'hot_lo', round(v_lo * v_settings.hot_rate_lo)::integer,
      'hot_hi', round(v_hi * v_settings.hot_rate_hi)::integer,
      'launch', v_kind,
      'launch_credits', case when v_kind = 'credit' then 1 else 0 end);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'items', v_out,
    'free_launches_left', greatest(v_settings.free_launches_per_month - coalesce(v_used, 0), 0),
    'free_launches_per_month', v_settings.free_launches_per_month,
    'balance', v_balance,
    'credits_needed', v_credits_needed,
    'short_by', greatest(v_credits_needed - v_balance, 0));
end;
$function$;

-- Same, for saved campaigns (editor, launch step, Launch all).
create or replace function public.campaign_cost_estimate(p_campaign_ids uuid[])
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_client uuid;
  v_items jsonb;
  v_result jsonb;
begin
  select min(client_id::text)::uuid into v_client from public.campaigns where id = any(p_campaign_ids);
  if v_client is null or not public.can_manage_client(v_client)
     or exists (select 1 from public.campaigns where id = any(p_campaign_ids) and client_id <> v_client) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'lo', coalesce(c.est_prospects_lo, 0), 'hi', coalesce(c.est_prospects_hi, c.max_results))
                            order by array_position(p_campaign_ids, c.id)), '[]')
    into v_items from public.campaigns c where c.id = any(p_campaign_ids);
  v_result := public.estimate_campaign_cost(v_client, v_items);
  -- Put the campaign ids back on each line.
  return v_result || jsonb_build_object('items', (
    select coalesce(jsonb_agg(line || jsonb_build_object('campaign_id', v_items->(i - 1)->>'id') order by i), '[]')
      from jsonb_array_elements(v_result->'items') with ordinality as t(line, i)));
end;
$function$;

-- ── Drafts from ideas ─────────────────────────────────────────────────────────────────────
-- Called by the wizard-ai function (service role) after it has written each idea's four
-- emails. Ideas come from the session row, never from the browser. Safe to call twice: an
-- idea that already has a draft is skipped, so a double click never makes duplicates.
create or replace function public.create_wizard_drafts(p_session_id uuid, p_idea_ids text[], p_sequences jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_session public.wizard_sessions;
  v_client public.clients;
  v_idea jsonb;
  v_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_count integer;
  v_areas jsonb;
  v_labels text[];
  v_service uuid;
  v_start date;
begin
  select * into v_session from public.wizard_sessions where id = p_session_id;
  if v_session.id is null or not public.can_manage_client(v_session.client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  select * into v_client from public.clients where id = v_session.client_id;
  select count(*) into v_count from public.campaigns where client_id = v_client.id and status <> 'archived';

  for v_idea in
    select i from jsonb_array_elements(v_session.ideas) i
     where i->>'id' = any(p_idea_ids)
     order by array_position(p_idea_ids, i->>'id')
  loop
    select id into v_id from public.campaigns
     where wizard_session_id = p_session_id and icp->>'idea_id' = v_idea->>'id';
    if v_id is not null then
      v_created := v_created || jsonb_build_object('idea_id', v_idea->>'id', 'campaign_id', v_id, 'existing', true);
      continue;
    end if;
    if v_count >= v_client.max_campaigns then
      v_skipped := v_skipped || jsonb_build_object('idea_id', v_idea->>'id', 'reason', 'campaign_limit');
      continue;
    end if;

    v_areas := coalesce(v_idea->'target_areas', '[]'::jsonb);
    v_labels := array(select e->>'label' from jsonb_array_elements(v_areas) e);
    select id into v_service from public.client_services
     where client_id = v_client.id and lower(btrim(name)) = lower(btrim(coalesce(v_idea->>'service', '')));
    v_start := case when (v_idea->>'suggested_start') ~ '^\d{4}-\d{2}-\d{2}$'
                         and (v_idea->>'suggested_start')::date > current_date
                    then (v_idea->>'suggested_start')::date end;

    perform set_config('app.bypass_campaign_protection', 'true', true);
    insert into public.campaigns (
      client_id, name, description, status, channel, language, country,
      search_queries, target_locations, target_areas, max_results, scrape_enabled,
      origin, service_id, icp, sequence, start_date, wizard_session_id,
      est_prospects_lo, est_prospects_hi, created_by)
    values (
      v_client.id,
      left(btrim(v_idea->>'name'), 120),
      nullif(btrim(coalesce(v_idea->>'reason', '')), ''),
      'draft', 'email',
      coalesce(nullif(v_idea->>'language', ''), 'English'),
      coalesce(v_client.country, 'US'),
      array(select jsonb_array_elements_text(coalesce(v_idea->'search_queries', '[]'::jsonb))),
      v_labels,
      case when jsonb_array_length(v_areas) > 0 then v_areas end,
      greatest(coalesce((v_idea->>'max_results')::integer, 100), 1),
      true,
      case when v_session.entry_point = 'find_new' then 'find_new' else 'wizard' end,
      v_service,
      jsonb_build_object(
        'idea_id', v_idea->>'id',
        'target', v_idea->>'target',
        'business_types', coalesce(v_idea->'business_types', '[]'::jsonb),
        'roles', coalesce(v_idea->'roles', '[]'::jsonb),
        'exclusions', coalesce(v_session.answers #> '{audience,exclusions}', '[]'::jsonb),
        'fit', v_idea->>'fit',
        'goal', v_session.answers #>> '{goal,goal}',
        'cta', v_session.answers #>> '{goal,cta}'),
      case when jsonb_typeof(p_sequences->(v_idea->>'id')) = 'array' then p_sequences->(v_idea->>'id') end,
      v_start,
      p_session_id,
      (v_idea->>'est_lo')::integer,
      (v_idea->>'est_hi')::integer,
      v_session.created_by)
    returning id into v_id;
    perform set_config('app.bypass_campaign_protection', 'false', true);
    v_count := v_count + 1;
    v_created := v_created || jsonb_build_object('idea_id', v_idea->>'id', 'campaign_id', v_id, 'existing', false);
  end loop;

  update public.wizard_sessions
     set status = 'completed', completed_at = now(), selected = p_idea_ids, screen = 3
   where id = p_session_id and jsonb_array_length(v_created) > 0;

  return jsonb_build_object('ok', true, 'created', v_created, 'skipped', v_skipped);
end;
$function$;

-- ── Launch ────────────────────────────────────────────────────────────────────────────────
-- Checks a campaign before launch and lists what still needs fixing. With a future start
-- date the campaign is scheduled instead (sourcing waits); otherwise the app sends it to the
-- WF0a gate, which charges the launch and starts sourcing exactly as for any campaign.
create or replace function public.campaign_launch_problems(p_campaign_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_c public.campaigns;
  v_problems jsonb := '[]'::jsonb;
  v_step jsonb;
  v_i integer := 0;
  v_valid jsonb;
begin
  select * into v_c from public.campaigns where id = p_campaign_id;
  if v_c.id is null or not public.can_manage_client(v_c.client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;

  if v_c.status not in ('draft', 'pending_review', 'scheduled') then
    v_problems := v_problems || jsonb_build_object('code', 'not_a_draft', 'tab', 'launch',
      'message', 'Only a draft can be launched.');
  end if;
  if coalesce(array_length(v_c.search_queries, 1), 0) = 0 then
    v_problems := v_problems || jsonb_build_object('code', 'no_search_terms', 'tab', 'targeting',
      'message', 'Add at least one type of business to search for.');
  end if;
  if coalesce(jsonb_array_length(nullif(v_c.target_areas, 'null'::jsonb)), 0) = 0 and coalesce(array_length(v_c.target_locations, 1), 0) = 0 then
    v_problems := v_problems || jsonb_build_object('code', 'no_area', 'tab', 'targeting',
      'message', 'Add at least one area.');
  end if;
  v_valid := public.validate_campaign_inputs(v_c.search_queries, v_c.target_locations, v_c.max_results, true);
  if coalesce((v_valid->>'valid')::boolean, true) = false then
    v_problems := v_problems || jsonb_build_object('code', 'limits', 'tab', 'targeting',
      'message', 'The search terms, areas or maximum results are over the limits.', 'details', v_valid->'violations');
  end if;
  if v_c.sequence is not null then
    for v_step in select * from jsonb_array_elements(v_c.sequence) loop
      v_i := v_i + 1;
      if btrim(coalesce(v_step->>'subject', '')) = '' or btrim(coalesce(v_step->>'body', '')) = '' then
        v_problems := v_problems || jsonb_build_object('code', 'blank_email', 'tab', 'emails', 'step', v_i,
          'message', format('Email %s needs a subject and a body.', v_i));
      end if;
    end loop;
  end if;
  if not public.client_mailbox_ready(v_c.client_id) then
    v_problems := v_problems || jsonb_build_object('code', 'no_mailbox', 'tab', 'launch',
      'message', 'Connect your Gmail in Settings so we can send from your address.');
  end if;

  return jsonb_build_object('ok', true, 'ready', jsonb_array_length(v_problems) = 0, 'problems', v_problems,
    'scheduled_for', case when v_c.start_date > current_date then v_c.start_date end);
end;
$function$;

-- Schedules a campaign with a future start date (after the same checks). Returns 'scheduled',
-- 'launch_now' (the app then calls the WF0a gate) or the problems.
create or replace function public.prepare_campaign_launch(p_campaign_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_check jsonb;
  v_c public.campaigns;
begin
  v_check := public.campaign_launch_problems(p_campaign_id);
  if not coalesce((v_check->>'ok')::boolean, false) then return v_check; end if;
  if not (v_check->>'ready')::boolean then
    return jsonb_build_object('ok', true, 'result', 'problems', 'problems', v_check->'problems');
  end if;
  select * into v_c from public.campaigns where id = p_campaign_id;
  if v_c.start_date > current_date then
    perform set_config('app.bypass_campaign_protection', 'true', true);
    update public.campaigns set status = 'scheduled', updated_at = now() where id = p_campaign_id;
    perform set_config('app.bypass_campaign_protection', 'false', true);
    return jsonb_build_object('ok', true, 'result', 'scheduled', 'start_date', v_c.start_date);
  end if;
  if v_c.status = 'scheduled' then
    perform set_config('app.bypass_campaign_protection', 'true', true);
    update public.campaigns set status = 'draft', updated_at = now() where id = p_campaign_id;
    perform set_config('app.bypass_campaign_protection', 'false', true);
  end if;
  return jsonb_build_object('ok', true, 'result', 'launch_now');
end;
$function$;

-- Hourly: scheduled campaigns whose start date has come go back to draft and are sent to the
-- WF0a gate, the same call the Launch button makes.
create or replace function public.release_scheduled_campaigns()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in select id from public.campaigns where status = 'scheduled' and start_date <= current_date loop
    perform set_config('app.bypass_campaign_protection', 'true', true);
    update public.campaigns set status = 'draft', updated_at = now() where id = v_id;
    perform set_config('app.bypass_campaign_protection', 'false', true);
    perform net.http_post(
      url := 'https://n8n.shortyharris.com/webhook/wf0-enqueue',
      body := jsonb_build_object('campaign_id', v_id),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 30000);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

do $$
begin
  perform cron.unschedule('release-scheduled-campaigns') where exists (select 1 from cron.job where jobname = 'release-scheduled-campaigns');
  perform cron.schedule('release-scheduled-campaigns', '7 * * * *', $c$select public.release_scheduled_campaigns()$c$);
exception when others then
  raise notice 'pg_cron not available, release_scheduled_campaigns not scheduled: %', sqlerrm;
end $$;

-- ── Lifecycle ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_campaign_lifecycle(p_campaign_id uuid, p_action text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_c public.campaigns;
  v_new text;
begin
  select * into v_c from public.campaigns where id = p_campaign_id;
  if v_c.id is null or not public.can_manage_client(v_c.client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;

  v_new := case
    when p_action = 'pause' and v_c.status = 'active' then 'paused'
    when p_action = 'resume' and v_c.status = 'paused' then 'active'
    when p_action = 'unschedule' and v_c.status = 'scheduled' then 'draft'
    when p_action = 'archive' and v_c.status <> 'archived' then 'archived'
    when p_action = 'restore' and v_c.status = 'archived' then
      case when coalesce(v_c.archived_from_status, 'draft') in ('active', 'paused', 'completed') then 'paused'
           else 'draft' end
  end;
  if v_new is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed', 'status', v_c.status);
  end if;

  perform set_config('app.bypass_campaign_protection', 'true', true);
  update public.campaigns set
    status = v_new,
    archived_at = case when v_new = 'archived' then now() when p_action = 'restore' then null else archived_at end,
    archived_from_status = case when v_new = 'archived' then v_c.status else archived_from_status end,
    updated_at = now()
  where id = p_campaign_id;
  perform set_config('app.bypass_campaign_protection', 'false', true);

  insert into public.audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, old_values, new_values, created_at)
  values (gen_random_uuid(), auth.uid(), case when public.is_admin() then 'admin' else 'client' end,
          'campaign_' || p_action, 'campaign', p_campaign_id,
          jsonb_build_object('status', v_c.status), jsonb_build_object('status', v_new), now());
  return jsonb_build_object('ok', true, 'status', v_new);
end;
$function$;

-- A copy as a new draft (a clone is a new campaign and launches, and is charged, on its own).
create or replace function public.clone_campaign(p_campaign_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_c public.campaigns;
  v_client public.clients;
  v_id uuid;
begin
  select * into v_c from public.campaigns where id = p_campaign_id;
  if v_c.id is null or not public.can_manage_client(v_c.client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  select * into v_client from public.clients where id = v_c.client_id;
  if (select count(*) from public.campaigns where client_id = v_c.client_id and status <> 'archived') >= v_client.max_campaigns then
    return jsonb_build_object('ok', false, 'error', 'campaign_limit');
  end if;
  perform set_config('app.bypass_campaign_protection', 'true', true);
  insert into public.campaigns (
    client_id, name, description, status, channel, language, country, search_queries, target_locations,
    target_areas, max_results, scrape_enabled, origin, service_id, icp, sequence, upfront_sequence,
    est_prospects_lo, est_prospects_hi, cloned_from_id, created_by)
  values (
    v_c.client_id, left('Copy of ' || v_c.name, 120), v_c.description, 'draft', v_c.channel, v_c.language, v_c.country,
    v_c.search_queries, v_c.target_locations, v_c.target_areas, v_c.max_results, true, v_c.origin, v_c.service_id,
    v_c.icp, v_c.sequence, v_c.upfront_sequence, v_c.est_prospects_lo, v_c.est_prospects_hi, v_c.id, auth.uid())
  returning id into v_id;
  perform set_config('app.bypass_campaign_protection', 'false', true);
  return jsonb_build_object('ok', true, 'campaign_id', v_id);
end;
$function$;

-- ── Free AI rewrites ──────────────────────────────────────────────────────────────────────
-- Takes one free rewrite for a campaign if any are left. Called by wizard-ai (service role)
-- only after the AI call succeeded, so a failed rewrite never uses one up.
create or replace function public.use_campaign_rewrite(p_campaign_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_limit integer;
  v_used integer;
begin
  select free_rewrites_per_campaign into v_limit from public.wizard_settings where id = 1;
  update public.campaigns set rewrites_used = rewrites_used + 1
   where id = p_campaign_id and rewrites_used < v_limit
  returning rewrites_used into v_used;
  if v_used is null then
    return jsonb_build_object('ok', false, 'error', 'no_rewrites_left', 'limit', v_limit);
  end if;
  return jsonb_build_object('ok', true, 'used', v_used, 'left', v_limit - v_used, 'limit', v_limit);
end;
$function$;

-- ── Edit log for campaigns that have launched ─────────────────────────────────────────────
-- Edits to a live campaign change only emails not yet written; this keeps a record of each.
create or replace function public.log_campaign_edit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if old.status in ('active', 'paused', 'scheduled', 'completed')
     and (new.sequence is distinct from old.sequence
          or new.search_queries is distinct from old.search_queries
          or new.target_areas is distinct from old.target_areas
          or new.icp is distinct from old.icp
          or new.max_results is distinct from old.max_results
          or new.name is distinct from old.name) then
    insert into public.audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, old_values, new_values, created_at)
    values (gen_random_uuid(), auth.uid(),
            case when public.is_admin() then 'admin' when public.is_trusted_backend() then 'system' else 'client' end,
            'campaign_edited', 'campaign', new.id,
            jsonb_build_object('name', old.name, 'sequence', old.sequence, 'search_queries', old.search_queries,
                               'target_areas', old.target_areas, 'icp', old.icp, 'max_results', old.max_results),
            jsonb_build_object('name', new.name, 'sequence', new.sequence, 'search_queries', new.search_queries,
                               'target_areas', new.target_areas, 'icp', new.icp, 'max_results', new.max_results),
            now());
  end if;
  return new;
end;
$function$;

create trigger trg_log_campaign_edit after update on public.campaigns
  for each row execute function public.log_campaign_edit();

-- The est_* and archive bookkeeping columns are the system's, not the client's.
create or replace function public.protect_campaign_admin_fields()
 returns trigger
 language plpgsql
as $function$
begin
  if not public.is_admin()
     and not public.is_trusted_backend()
     and coalesce(current_setting('app.bypass_campaign_protection', true), 'false') <> 'true' then
    new.status := old.status;
    new.scrape_enabled := old.scrape_enabled;
    new.client_id := old.client_id;
    new.created_by := old.created_by;
    new.channel := old.channel;
    new.origin := old.origin;
    new.rewrites_used := old.rewrites_used;
    new.wizard_session_id := old.wizard_session_id;
    new.cloned_from_id := old.cloned_from_id;
    new.archived_at := old.archived_at;
    new.archived_from_status := old.archived_from_status;
  end if;
  return new;
end;
$function$;

-- ── Grants ────────────────────────────────────────────────────────────────────────────────
revoke execute on function public.estimate_prospects(uuid, integer, integer, integer) from public, anon;
revoke execute on function public.estimate_campaign_cost(uuid, jsonb) from public, anon;
revoke execute on function public.campaign_cost_estimate(uuid[]) from public, anon;
revoke execute on function public.create_wizard_drafts(uuid, text[], jsonb) from public, anon, authenticated;
revoke execute on function public.campaign_launch_problems(uuid) from public, anon;
revoke execute on function public.prepare_campaign_launch(uuid) from public, anon;
revoke execute on function public.release_scheduled_campaigns() from public, anon, authenticated;
revoke execute on function public.set_campaign_lifecycle(uuid, text) from public, anon;
revoke execute on function public.clone_campaign(uuid) from public, anon;
revoke execute on function public.use_campaign_rewrite(uuid) from public, anon, authenticated;
revoke execute on function public.log_campaign_edit() from public, anon;

grant execute on function public.estimate_prospects(uuid, integer, integer, integer) to authenticated, service_role;
grant execute on function public.estimate_campaign_cost(uuid, jsonb) to authenticated, service_role;
grant execute on function public.campaign_cost_estimate(uuid[]) to authenticated, service_role;
grant execute on function public.create_wizard_drafts(uuid, text[], jsonb) to service_role;
grant execute on function public.campaign_launch_problems(uuid) to authenticated, service_role;
grant execute on function public.prepare_campaign_launch(uuid) to authenticated, service_role;
grant execute on function public.release_scheduled_campaigns() to service_role;
grant execute on function public.set_campaign_lifecycle(uuid, text) to authenticated, service_role;
grant execute on function public.clone_campaign(uuid) to authenticated, service_role;
grant execute on function public.use_campaign_rewrite(uuid) to service_role;
