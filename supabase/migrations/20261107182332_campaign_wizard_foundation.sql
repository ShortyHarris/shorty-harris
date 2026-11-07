-- Campaign Wizard, milestone 1: the data the wizard needs, and the switch that turns it on.
-- See docs/CAMPAIGN_WIZARD_BUILD_PLAN.md.
--
--   clients.wizard_enabled     per-client pilot switch, admin-only (like auto_approve_campaigns)
--   client_services            the client's confirmed services (screen 2)
--   client_icp (+ columns)     industry, description, company size, exclusions, goal, call to action
--   wizard_sessions            autosaved answers, one open session per client
--   campaigns (+ columns)      where a campaign came from, its ICP, its four-email template, start date
--   confirm_wizard_profile()   screen 2 -> the client's saved profile (client_icp + client_services)
--
-- Launch rule (Ian, Oct 30: no staff approval): a campaign from a wizard-enabled client skips
-- the admin review, exactly as auto_approve_campaigns already does. Clients that are not in the
-- pilot behave as before.

-- ── Pilot switch ──────────────────────────────────────────────────────────────────────────
alter table public.clients add column if not exists wizard_enabled boolean not null default false;

create or replace function public.protect_client_admin_fields()
 returns trigger
 language plpgsql
as $function$
begin
  if not public.is_admin() then
    new.status := old.status;
    new.monthly_prospect_limit := old.monthly_prospect_limit;
    new.max_campaigns := old.max_campaigns;
    new.auto_approve_campaigns := old.auto_approve_campaigns;
    new.allow_generic_mailboxes := old.allow_generic_mailboxes;
    new.is_internal := old.is_internal;
    new.is_sandbox := old.is_sandbox;
    new.wizard_enabled := old.wizard_enabled;
  end if;
  return new;
end;
$function$;

-- ── Services ──────────────────────────────────────────────────────────────────────────────
create table public.client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  seasonal_months smallint[] not null default '{}',
  source text not null default 'user',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_services_name_check check (btrim(name) <> '' and length(name) <= 120),
  constraint client_services_months_check check (seasonal_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  constraint client_services_source_check check (source in ('user', 'website', 'description'))
);
create unique index client_services_client_name on public.client_services (client_id, lower(btrim(name)));

alter table public.client_services enable row level security;
create policy admin_all_client_services on public.client_services for all
  using (public.is_admin()) with check (public.is_admin());
create policy client_own_client_services on public.client_services for all
  using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy impersonation_read_client_services on public.client_services for select
  using (client_id = public.impersonating_client_id());

-- ── Profile fields the wizard adds ────────────────────────────────────────────────────────
alter table public.client_icp
  add column if not exists industry text,
  add column if not exists business_description text,
  add column if not exists company_size text,
  add column if not exists exclusions text[] not null default '{}',
  add column if not exists goal text,
  add column if not exists cta text,
  add column if not exists confirmed_at timestamptz;

alter table public.client_icp add constraint client_icp_goal_check
  check (goal is null or goal in ('quotes', 'meetings', 'calls', 'replies'));

-- ── Wizard sessions ───────────────────────────────────────────────────────────────────────
create table public.wizard_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by uuid default auth.uid(),
  entry_point text not null default 'new_campaign',
  screen smallint not null default 1,
  answers jsonb not null default '{}'::jsonb,
  ideas jsonb not null default '[]'::jsonb,
  selected text[] not null default '{}',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint wizard_sessions_entry_check check (entry_point in ('onboarding', 'new_campaign', 'find_new')),
  constraint wizard_sessions_screen_check check (screen between 1 and 3),
  constraint wizard_sessions_status_check check (status in ('open', 'completed', 'abandoned')),
  constraint wizard_sessions_answers_check check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 65536),
  constraint wizard_sessions_ideas_check check (jsonb_typeof(ideas) = 'array' and octet_length(ideas::text) <= 131072)
);
-- "Continue where you left off": at most one open session per client.
create unique index wizard_sessions_one_open on public.wizard_sessions (client_id) where status = 'open';

alter table public.wizard_sessions enable row level security;
create policy admin_all_wizard_sessions on public.wizard_sessions for all
  using (public.is_admin()) with check (public.is_admin());
create policy client_own_wizard_sessions on public.wizard_sessions for all
  using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy impersonation_read_wizard_sessions on public.wizard_sessions for select
  using (client_id = public.impersonating_client_id());

create or replace function public.wizard_touch_updated_at()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create trigger trg_wizard_sessions_updated_at before update on public.wizard_sessions
  for each row execute function public.wizard_touch_updated_at();
create trigger trg_client_services_updated_at before update on public.client_services
  for each row execute function public.wizard_touch_updated_at();

-- ── Campaign fields ───────────────────────────────────────────────────────────────────────
alter table public.campaigns
  add column if not exists origin text not null default 'manual',
  add column if not exists service_id uuid references public.client_services(id) on delete set null,
  add column if not exists icp jsonb,
  add column if not exists sequence jsonb,
  add column if not exists start_date date,
  add column if not exists rewrites_used integer not null default 0,
  add column if not exists wizard_session_id uuid references public.wizard_sessions(id) on delete set null,
  add column if not exists cloned_from_id uuid references public.campaigns(id) on delete set null;

alter table public.campaigns
  add constraint campaigns_origin_check check (origin in ('manual', 'wizard', 'find_new')),
  add constraint campaigns_icp_check check (icp is null or jsonb_typeof(icp) = 'object'),
  add constraint campaigns_sequence_check check (sequence is null or (jsonb_typeof(sequence) = 'array' and jsonb_array_length(sequence) <= 4)),
  add constraint campaigns_rewrites_used_check check (rewrites_used >= 0);

-- Clients may now save a campaign as a draft (the wizard creates drafts). They still cannot
-- insert a running campaign: launching stays a separate, checked step.
drop policy if exists client_own_campaigns_insert on public.campaigns;
create policy client_own_campaigns_insert on public.campaigns for insert
  with check (client_id = public.current_client_id() and status in ('pending_review', 'draft'));

-- Where a campaign came from and how many free rewrites it used are not the client's to change.
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
  end if;
  return new;
end;
$function$;

-- No staff approval for pilot clients: same path as auto_approve_campaigns.
create or replace function public.auto_approve_client_campaign()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  should_auto_approve boolean;
begin
  if new.status = 'pending_review' then
    select auto_approve_campaigns or wizard_enabled into should_auto_approve
    from public.clients
    where id = new.client_id;

    if should_auto_approve then
      perform set_config('app.bypass_campaign_protection', 'true', true); -- true = local to this transaction only
      update public.campaigns set status = 'active' where id = new.id;
      perform set_config('app.bypass_campaign_protection', 'false', true);
    end if;
  end if;
  return new;
end;
$function$;

-- ── Screen 2 -> saved profile ─────────────────────────────────────────────────────────────
-- Reads the session's answers, checks the required fields, and writes the client's profile:
-- client_icp (business types, roles, areas, exclusions, goal...) and client_services. Safe to
-- call again: services are matched by name, removed ones are deleted, edits overwrite.
--
-- answers shape (app/src/lib/wizardSession.ts):
--   business { name, industry, description }
--   services [ { name, seasonal_months[], source } ]
--   audience { business_types[], roles[], company_size, exclusions[] }
--   area     { areas: TargetArea[] }
--   goal     { goal, cta }
create or replace function public.confirm_wizard_profile(p_session_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_session public.wizard_sessions;
  v_a jsonb;
  v_missing text[] := '{}';
  v_types text[];
  v_roles text[];
  v_excl text[];
  v_areas text[];
  v_services jsonb;
  v_names text[];
  v_svc jsonb;
  v_pos int := 0;
  v_goal text;
begin
  select * into v_session from public.wizard_sessions where id = p_session_id;
  if v_session.id is null or not public.can_manage_client(v_session.client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if v_session.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'session_closed');
  end if;

  v_a := v_session.answers;
  v_types := array(select btrim(x) from jsonb_array_elements_text(coalesce(v_a #> '{audience,business_types}', '[]')) x where btrim(x) <> '');
  v_roles := array(select btrim(x) from jsonb_array_elements_text(coalesce(v_a #> '{audience,roles}', '[]')) x where btrim(x) <> '');
  v_excl  := array(select btrim(x) from jsonb_array_elements_text(coalesce(v_a #> '{audience,exclusions}', '[]')) x where btrim(x) <> '');
  v_areas := array(select btrim(e->>'label') from jsonb_array_elements(coalesce(v_a #> '{area,areas}', '[]')) e where btrim(coalesce(e->>'label', '')) <> '');
  v_services := coalesce((select jsonb_agg(s) from jsonb_array_elements(coalesce(v_a->'services', '[]')) s
                          where btrim(coalesce(s->>'name', '')) <> ''), '[]');
  v_goal := nullif(btrim(coalesce(v_a #>> '{goal,goal}', '')), '');

  if btrim(coalesce(v_a #>> '{business,name}', '')) = '' then v_missing := array_append(v_missing, 'business_name'); end if;
  if jsonb_array_length(v_services) = 0 then v_missing := array_append(v_missing, 'service'); end if;
  if cardinality(v_types) = 0 then v_missing := array_append(v_missing, 'business_type'); end if;
  if cardinality(v_areas) = 0 then v_missing := array_append(v_missing, 'area'); end if;
  if v_goal is null then v_missing := array_append(v_missing, 'goal'); end if;
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_fields', 'missing', to_jsonb(v_missing));
  end if;
  if v_goal not in ('quotes', 'meetings', 'calls', 'replies') then
    return jsonb_build_object('ok', false, 'error', 'invalid_goal');
  end if;

  insert into public.client_icp (client_id) values (v_session.client_id) on conflict (client_id) do nothing;
  update public.client_icp set
    industry = nullif(btrim(coalesce(v_a #>> '{business,industry}', '')), ''),
    business_description = nullif(btrim(coalesce(v_a #>> '{business,description}', '')), ''),
    target_business_types = v_types,
    decision_maker_roles = v_roles,
    target_locations = v_areas,
    exclusions = v_excl,
    company_size = nullif(btrim(coalesce(v_a #>> '{audience,company_size}', '')), ''),
    goal = v_goal,
    cta = nullif(btrim(coalesce(v_a #>> '{goal,cta}', '')), ''),
    edited_fields = (select array_agg(distinct f) from unnest(coalesce(edited_fields, '{}') ||
                      array['target_business_types', 'decision_maker_roles', 'target_locations']) f),
    confirmed_at = now(),
    updated_at = now()
  where client_id = v_session.client_id;

  v_names := array(select lower(btrim(s->>'name')) from jsonb_array_elements(v_services) s);
  delete from public.client_services
   where client_id = v_session.client_id and not (lower(btrim(name)) = any(v_names));

  for v_svc in select s from jsonb_array_elements(v_services) s loop
    insert into public.client_services (client_id, name, seasonal_months, source, position)
    values (
      v_session.client_id,
      btrim(v_svc->>'name'),
      coalesce((select array_agg(distinct m::smallint order by m::smallint)
                from jsonb_array_elements_text(coalesce(v_svc->'seasonal_months', '[]')) m
                where m ~ '^\d{1,2}$' and m::int between 1 and 12), '{}'),
      case when v_svc->>'source' in ('user', 'website', 'description') then v_svc->>'source' else 'user' end,
      v_pos)
    on conflict (client_id, lower(btrim(name))) do update
      set seasonal_months = excluded.seasonal_months, position = excluded.position, updated_at = now();
    v_pos := v_pos + 1;
  end loop;

  update public.wizard_sessions set screen = greatest(screen, 3) where id = p_session_id;
  return jsonb_build_object('ok', true, 'services', v_pos);
end;
$function$;

-- ── Grants ────────────────────────────────────────────────────────────────────────────────
revoke all on table public.client_services, public.wizard_sessions from anon;
grant select, insert, update, delete on table public.client_services to authenticated, service_role;
grant select, insert, update, delete on table public.wizard_sessions to authenticated, service_role;
revoke execute on function public.confirm_wizard_profile(uuid) from public, anon;
grant execute on function public.confirm_wizard_profile(uuid) to authenticated, service_role;
revoke execute on function public.wizard_touch_updated_at() from public, anon;
