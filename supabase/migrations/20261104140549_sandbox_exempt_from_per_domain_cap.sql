-- The per-domain cap exists so a client cannot pile 15 prospects onto one
-- organisation and get the sending domain blocked. Every sandbox address is the
-- tester's own mailbox plus-addressed, so they necessarily share one domain and
-- the rule is meaningless there: it silently dropped 18 of 20 seeded prospects,
-- returning NULL per row with no error, which is the worst possible failure
-- shape for someone trying to understand why their sandbox looks empty.
--
-- The blacklist check above it still applies.
create or replace function public.admit_prospect_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_domain text;
  v_cap integer;
  v_existing integer;
begin
  if new.email is null then return new; end if;

  -- 1. Blacklist. Returning NULL silently skips the row, so the scraper gets no
  -- prospect instead of an error and prospect_count stays correct.
  if public.is_domain_blacklisted(new.email, new.client_id) then
    return null;
  end if;

  -- 1b. Sandbox clients are exempt from the per-domain cap: all their addresses
  -- are one mailbox by design, and nothing they send leaves the tester's inbox.
  if coalesce((select is_sandbox from public.clients where id = new.client_id), false) then
    return new;
  end if;

  -- 2. Per-domain cap. Prevents the illinoisstate.edu-style cluster (15 prospects
  -- at one university) that gets a sending domain blocked org-wide.
  select max_prospects_per_domain into v_cap from public.scrape_limits where id = 1;
  v_cap := coalesce(v_cap, 0);
  if v_cap = 0 then return new; end if;

  v_domain := public.normalize_domain(new.email);
  if v_domain is null then return new; end if;

  -- Per CLIENT, across all their campaigns: two campaigns each adding "only two"
  -- at the same university is still four people at one place.
  select count(*) into v_existing
  from public.prospects p
  where p.client_id = new.client_id
    and p.email is not null
    and public.normalize_domain(p.email) = v_domain;

  if v_existing >= v_cap then return null; end if;

  return new;
end; $function$;;
