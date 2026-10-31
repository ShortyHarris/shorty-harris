-- Per-client usage caps.
-- monthly_prospect_limit: prospects created (post-dedupe) in the current
-- calendar month, across all of that client's campaigns. Resets on the 1st.
-- max_campaigns: how many campaigns a client may have at once.
alter table public.clients
  add column if not exists monthly_prospect_limit integer not null default 1000,
  add column if not exists max_campaigns integer not null default 3;

alter table public.clients
  add constraint clients_monthly_prospect_limit_nonneg check (monthly_prospect_limit >= 0),
  add constraint clients_max_campaigns_nonneg check (max_campaigns >= 0);

-- Usage view: one row per client with current-month consumption and the
-- remaining headroom WF0 needs before it starts a scrape.
create or replace view public.client_usage as
select
  c.id                                as client_id,
  c.business_name,
  c.monthly_prospect_limit,
  c.max_campaigns,
  coalesce(p.used_this_month, 0)      as prospects_this_month,
  greatest(c.monthly_prospect_limit - coalesce(p.used_this_month, 0), 0)
                                      as prospects_remaining,
  coalesce(cm.campaign_count, 0)      as campaign_count,
  greatest(c.max_campaigns - coalesce(cm.campaign_count, 0), 0)
                                      as campaigns_remaining,
  date_trunc('month', now()) + interval '1 month' as limit_resets_at
from public.clients c
left join (
  select client_id, count(*) as used_this_month
  from public.prospects
  where created_at >= date_trunc('month', now())
  group by client_id
) p on p.client_id = c.id
left join (
  select client_id, count(*) as campaign_count
  from public.campaigns
  group by client_id
) cm on cm.client_id = c.id;

comment on view public.client_usage is
  'Current calendar-month prospect usage and campaign counts per client. Read by WF0 before scraping and by the admin client page.';