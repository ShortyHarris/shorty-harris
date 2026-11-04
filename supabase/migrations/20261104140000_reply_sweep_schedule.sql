-- Applied to production 2026-11-04.
--
-- pg_net is enabled so Postgres can call edge functions directly. This is how
-- the reply sweep is triggered: it needs no n8n workflow, so the live sending
-- path is untouched.
create extension if not exists pg_net with schema extensions;

-- Catch-up for WF4's reply poll.
--
-- WF4 asks Gmail only for "after: now - 10 minutes", every 2 minutes, and never
-- looks back. A failed poll, or a message Gmail indexes late, is missed
-- permanently. This sweep re-walks recent threads so a missed bounce costs at
-- most two hours of follow-ups instead of thirteen days.
--
-- NOTE: this is a safety net, not the fix. The fix is a per-client
-- last-polled-at timestamp in WF4 so its window stretches after a failure
-- instead of skipping. Until that lands, do not remove this job.
select cron.schedule(
  'gmail-reply-sweep',
  '23 */2 * * *',
  $job$
  select net.http_post(
    url := 'https://lxoeotyibsalbxgbjfxo.supabase.co/functions/v1/gmail-reply-sweep',
    body := jsonb_build_object('days_back', 2),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- publishable anon key; the function itself uses the service role internally
      'Authorization', 'Bearer ' || current_setting('app.anon_key', true)
    ),
    timeout_milliseconds := 180000
  );
  $job$
);

select cron.schedule('reply-health-monitor', '41 5 * * *', 'select public.log_reply_health();');

-- The deployed job embeds the anon key literally rather than reading
-- app.anon_key. If this migration is replayed on a fresh database, set the key
-- first or edit the job afterwards:
--   select cron.alter_job((select jobid from cron.job where jobname = 'gmail-reply-sweep'), command := '...');
