alter table public.messages add column if not exists pending_since timestamptz;

comment on column public.messages.pending_since is 'When this draft entered the approval queue. Set on insert, and reset whenever an edited or rejected draft is resubmitted as pending. Use this, not created_at, for the Pending Since column.';

-- Backfill only drafts still in the queue, from their creation time.
update public.messages set pending_since = created_at
 where pending_since is null and send_status = 'not_sent' and approval_status in ('pending','approved','edited');

create or replace function public.messages_set_pending_since()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.pending_since := coalesce(new.pending_since, now());
  elsif new.approval_status = 'pending' and old.approval_status is distinct from 'pending' then
    new.pending_since := now();
  end if;
  return new;
end; $$;

drop trigger if exists trg_messages_pending_since on public.messages;
create trigger trg_messages_pending_since before insert or update of approval_status on public.messages
  for each row execute function public.messages_set_pending_since()