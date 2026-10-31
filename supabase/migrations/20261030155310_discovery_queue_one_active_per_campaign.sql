-- Nothing stopped a second launch of a campaign that was already queued or
-- running. A double click inserted a second queue row, which now also means a
-- second launch counted by trg_count_launch_on_enqueue and, past the 5 free
-- launches, a second credit deducted for one intended launch.
--
-- Disabling the button is not enough: the UI is only one caller, the request can
-- be replayed, and two admins can click at once. This makes it impossible at the
-- source. The insert fails instead of silently charging twice, and the caller
-- gets a unique-violation it can surface as "already queued".
--
-- Scoped to in-flight states only, so re-launching a campaign whose previous
-- scrape finished ('done') or failed ('error') is still allowed.
create unique index if not exists discovery_queue_one_active_per_campaign
  on public.discovery_queue (campaign_id)
  where status in ('queued', 'running');