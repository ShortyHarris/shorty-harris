-- Applied to production 2026-11-04.
--
-- WF4 polled Gmail every 2 minutes asking only for "after: now - 10 minutes",
-- and never looked back. A failed poll, or a message Gmail indexed late, was
-- missed permanently: that is how a hard bounce on 22 Oct went unseen for 13
-- days while follow-ups kept going to a dead address.
--
-- Recording when each mailbox was last successfully polled lets the window
-- stretch to cover a gap instead of skipping over it. WF4's "Fetch Client
-- Replies" now derives after_epoch from this column, clamped so it always
-- overlaps the last 10 minutes and never reaches back more than 24 hours (the
-- Gmail read is capped at 50 messages per call, so an unbounded window would
-- silently truncate). WF4's "Mark Client Polled" node stamps it once a client's
-- replies have been processed, on both the "no new replies" and "replies done"
-- paths.
alter table public.client_email_credentials
  add column if not exists last_reply_poll_at timestamptz;

update public.client_email_credentials
   set last_reply_poll_at = now() - interval '10 minutes'
 where last_reply_poll_at is null;
