-- create or replace view in sandbox_excluded_from_optout_stats_and_mailbox_health reset
-- the view's options; restore security_invoker as set in 20260719061346 / 20261013220240.
alter view public.optout_stats set (security_invoker = true);
