create or replace function public.reset_input_scrape_failure()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.scrape_status = 'failed'
     and old.scrape_failure_reason in ('limits_exceeded', 'no_search_terms', 'no_locations')
     and new.scrape_status = 'failed'
     and ( new.search_queries is distinct from old.search_queries
        or new.target_locations is distinct from old.target_locations
        or new.target_areas is distinct from old.target_areas
        or new.max_results is distinct from old.max_results ) then
    new.scrape_status := 'idle';
    new.scrape_failure_reason := null;
    new.scrape_error := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_reset_input_scrape_failure on public.campaigns;
create trigger trg_reset_input_scrape_failure
  before update on public.campaigns
  for each row execute function public.reset_input_scrape_failure();