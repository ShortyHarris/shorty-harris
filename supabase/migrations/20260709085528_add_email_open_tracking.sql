alter table messages add column if not exists opened_at timestamptz;
alter table messages add column if not exists open_count integer not null default 0;

create or replace function record_email_open(p_message_id uuid)
returns void
language sql
security definer
as $$
  update messages
  set opened_at = coalesce(opened_at, now()),
      open_count = open_count + 1
  where id = p_message_id;
$$;

grant execute on function record_email_open(uuid) to anon, authenticated, service_role;