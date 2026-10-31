
alter table public.raw_scrapes enable row level security;
alter table public.scrape_jobs enable row level security;

create policy admin_all_raw_scrapes on public.raw_scrapes
  for all
  using (is_admin());

create policy admin_all_scrape_jobs on public.scrape_jobs
  for all
  using (is_admin());
