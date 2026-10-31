alter table campaigns
  add column scrape_status text not null default 'idle'
    check (scrape_status in ('idle', 'running', 'complete', 'failed')),
  add column scrape_started_at timestamp with time zone,
  add column scrape_error text;

comment on column campaigns.scrape_status is 'idle = never scraped or not currently running, running = WF0 in progress, complete = last scrape finished successfully, failed = last scrape errored';
comment on column campaigns.scrape_started_at is 'timestamp when the current/last scrape was kicked off; used by frontend to detect stale/stuck runs';
comment on column campaigns.scrape_error is 'error message if scrape_status = failed';