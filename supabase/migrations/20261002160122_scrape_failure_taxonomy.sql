alter table public.campaigns
  add column if not exists scrape_failure_reason text,
  add column if not exists scrape_attempt_count integer not null default 0,
  add column if not exists scrape_finished_at timestamptz;

alter table public.campaigns
  drop constraint if exists campaigns_scrape_failure_reason_check;

alter table public.campaigns
  add constraint campaigns_scrape_failure_reason_check
  check (
    scrape_failure_reason is null
    or scrape_failure_reason in (
      'apify_start_failed',
      'apify_run_failed',
      'apify_poll_timeout',
      'apify_fetch_failed',
      'import_failed',
      'stalled',
      'no_search_terms',
      'no_locations',
      'limits_exceeded',
      'unknown'
    )
  );

comment on column public.campaigns.scrape_failure_reason is
  'Machine-readable failure code when scrape_status = failed. Frontend maps it to a message plus a suggested fix. Null whenever scrape_status is not failed.';
comment on column public.campaigns.scrape_attempt_count is
  'Number of times a scrape has been started for this campaign. Lets the UI flag repeatedly failing campaigns.';
comment on column public.campaigns.scrape_finished_at is
  'When the last scrape reached a terminal state (complete or failed). Paired with scrape_started_at this gives real run durations.';

create index if not exists idx_campaigns_scrape_running
  on public.campaigns (scrape_started_at)
  where scrape_status = 'running';

alter table public.error_logs drop constraint if exists error_logs_source_check;

alter table public.error_logs
  add constraint error_logs_source_check
  check (source = any (array[
    'wf0_discovery','wf1_import','wf2_generation','wf2_5_approval','wf3_send',
    'wf4_classification','wf5_follow_up','wf6_hot_lead','stripe_webhook',
    'frontend','edge_function','other'
  ]));