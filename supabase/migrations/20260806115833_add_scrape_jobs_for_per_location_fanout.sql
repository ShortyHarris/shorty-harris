create table scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  run_id uuid not null,
  location text not null,
  status text not null default 'pending' check (status in ('pending','running','complete','failed')),
  error text,
  prospects_imported integer default 0,
  places_found integer default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_scrape_jobs_run on scrape_jobs(run_id);
create index idx_scrape_jobs_campaign on scrape_jobs(campaign_id);

comment on table scrape_jobs is 'One row per (campaign run, location). Lets WF0 fan out each location into its own short-lived execution and detect overall completion when the last location finishes.';
comment on column scrape_jobs.run_id is 'Groups all location jobs belonging to a single campaign trigger, so a re-trigger does not get confused with an earlier run.';