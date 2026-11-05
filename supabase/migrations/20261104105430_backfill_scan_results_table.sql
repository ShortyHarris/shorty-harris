-- Scratch table for the one-off recovery of replies and bounces that the old
-- "category:primary" Gmail query dropped. Nothing reads it in the app; it exists
-- so the scan can be reviewed before anything is written to replies/do_not_contact.
create table if not exists public.backfill_scan_results (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  thread_id text not null,
  gmail_message_id text not null,
  from_addr text,
  subject text,
  date_header text,
  internal_date bigint,
  snippet text,
  body text,
  already_in_replies boolean not null default false,
  created_at timestamptz not null default now(),
  unique (client_id, gmail_message_id)
);

alter table public.backfill_scan_results enable row level security;

drop policy if exists backfill_scan_results_admin_all on public.backfill_scan_results;
create policy backfill_scan_results_admin_all
  on public.backfill_scan_results for all
  using (public.is_admin()) with check (public.is_admin());

create index if not exists backfill_scan_results_client_idx
  on public.backfill_scan_results (client_id, internal_date);;
