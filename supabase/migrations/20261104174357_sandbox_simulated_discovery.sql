-- Sandbox campaign launches used to fail outright (refuse_sandbox_discovery raised),
-- so a tester could never see what a launch produces. Now, for a sandbox client, the
-- discovery_queue insert is completed in place without Apify:
--   * up to 8 made-up businesses per launch, spread over the campaign's search terms
--     and locations, shaped like Apify Google Maps items (title, email, phone,
--     categoryName, city);
--   * every address is derived from the sandbox's own connected mailbox
--     (local+sbx-d<run><nn>@domain), so sandbox_address_allowed still holds;
--   * they go through the REAL import: rows in raw_scrapes, then a scrape_import_jobs
--     insert, whose trigger runs import_raw_scrapes (blacklist, do-not-contact and
--     duplicate checks, prospect insert) exactly as WF0 does after Apify;
--   * the campaign gets the same scrape_status / last_scrape_summary WF0 writes, and
--     the queue row is marked done so WF0b never calls Apify for it.
-- WF2's normal sweep then writes the first emails, as for any imported prospect.
--
-- Applied live as 20261104174357. Same day: the sandbox client's website_url was set
-- to https://shortyharris.com (data, not schema) so "Refresh from your website" works.

create or replace function public.simulate_sandbox_discovery()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_client uuid; v_sandbox boolean; v_camp record;
  v_mailbox text; v_local text; v_domain text;
  v_queries text[]; v_locs text[];
  v_n int; v_run text; v_items jsonb := '[]'::jsonb; v_i int;
  v_q text; v_loc text; v_result jsonb;
  v_suffix text[] := array['Studio','Group','Partners','& Co','Works','Collective','Centre','Hub'];
begin
  select c.client_id, cl.is_sandbox into v_client, v_sandbox
    from campaigns c join clients cl on cl.id = c.client_id where c.id = new.campaign_id;
  if not coalesce(v_sandbox, false) then
    return new;  -- real clients: untouched, WF0b picks the row up as before
  end if;

  select lower(email_address) into v_mailbox from client_email_credentials
   where client_id = v_client and status = 'active' limit 1;
  if v_mailbox is null then
    raise exception 'Connect a Gmail account for this sandbox first: simulated prospects are addressed to it.'
      using errcode = 'check_violation';
  end if;
  v_local := split_part(v_mailbox, '@', 1);
  v_domain := split_part(v_mailbox, '@', 2);

  select * into v_camp from campaigns where id = new.campaign_id;
  v_queries := coalesce(nullif(array_remove(v_camp.search_queries, ''), '{}'), array['business']);
  v_locs := coalesce(nullif(array_remove(v_camp.target_locations, ''), '{}'), array['Testville']);
  v_n := greatest(1, least(coalesce(v_camp.max_results, 8), 8));
  -- A short per-launch tag keeps every relaunch's addresses unique (prospects are
  -- unique by email per client), while staying derived from the sandbox mailbox.
  v_run := substr(md5(new.campaign_id::text || clock_timestamp()::text), 1, 5);

  for v_i in 1..v_n loop
    v_q := v_queries[1 + ((v_i - 1) % array_length(v_queries, 1))];
    v_loc := v_locs[1 + ((v_i - 1) % array_length(v_locs, 1))];
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'title', initcap(v_q) || ' ' || v_suffix[1 + ((v_i - 1) % array_length(v_suffix, 1))] || ' ' || v_i,
      'email', v_local || '+sbx-d' || v_run || lpad(v_i::text, 2, '0') || '@' || v_domain,
      'phone', '+1 555 01' || lpad(v_i::text, 2, '0'),
      'categoryName', v_q,
      'city', v_loc,
      'sandbox_simulated', true));
  end loop;

  update campaigns set scrape_status = 'running', scrape_started_at = now(), scrape_error = null,
         scrape_failure_reason = null, scrape_finished_at = null,
         scrape_attempt_count = coalesce(scrape_attempt_count, 0) + 1
   where id = new.campaign_id;

  insert into raw_scrapes (campaign_id, apify_dataset_id, location, raw_data, import_status)
  values (new.campaign_id, 'sandbox-' || v_run, v_locs[1], v_items, 'pending');

  insert into scrape_import_jobs (campaign_id) values (new.campaign_id)
  returning result into v_result;

  update campaigns set last_scraped_at = now(), scrape_status = 'complete', scrape_error = null,
         scrape_failure_reason = null, scrape_finished_at = now(), last_scrape_summary = v_result
   where id = new.campaign_id;

  new.status := 'done';
  new.started_at := now();
  new.finished_at := now();
  new.result := coalesce(v_result, '{}'::jsonb) || jsonb_build_object('sandbox_simulated', true);
  return new;
end;
$function$;

drop trigger if exists trg_refuse_sandbox_discovery on public.discovery_queue;
create trigger trg_simulate_sandbox_discovery
  before insert on public.discovery_queue
  for each row execute function public.simulate_sandbox_discovery();
