-- RLS was enabled on discovery_queue with no policies at all, so only
-- service_role could read it. Nothing in the app read the table before, which
-- is why that went unnoticed. The admin Campaigns screen now reads it to show
-- queued state that survives a refresh, so it needs a read path.
--
-- Admin read only. Clients have no view that shows the queue, and the launch
-- outcome they care about already reaches them through campaigns.scrape_status.
-- No insert, update or delete policy: only WF0a and WF0b write here, under
-- service_role, and leaving writes closed keeps the launch-counting trigger
-- impossible to fire from a browser.
create policy admin_read_discovery_queue
  on public.discovery_queue
  for select
  using (public.is_admin());