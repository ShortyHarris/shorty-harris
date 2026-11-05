-- WF4 polls Gmail every 2 minutes asking only for "after: now - 10 minutes",
-- and never looks back. A failed poll, or a message Gmail indexes late, is
-- missed permanently. Recording when each mailbox was last successfully polled
-- lets the window stretch to cover a gap instead of skipping over it.
alter table public.client_email_credentials
  add column if not exists last_reply_poll_at timestamptz;

-- Seed so the first run after deploy asks for a sane window rather than
-- everything since the epoch.
update public.client_email_credentials
   set last_reply_poll_at = now() - interval '10 minutes'
 where last_reply_poll_at is null;;
