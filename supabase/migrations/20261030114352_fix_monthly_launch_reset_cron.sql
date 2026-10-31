-- The monthly reset ran "UPDATE monthly_launch_usage SET launch_count = 0" with
-- no WHERE clause. Rows are keyed by (client_id, month), so a new month already
-- starts from a fresh row and no reset is needed. What the job actually did was
-- zero every historical month's row on the 1st, destroying the launch history
-- and any ability to audit or dispute past billing.
--
-- Replaced with retention: keep 12 months, drop older rows.
select cron.unschedule('reset-monthly-launch-counts');

select cron.schedule(
  'prune-monthly-launch-usage',
  '0 0 1 * *',
  $cron$
    delete from public.monthly_launch_usage
    where month < to_char((now() at time zone 'utc') - interval '12 months', 'YYYY-MM')
  $cron$
);