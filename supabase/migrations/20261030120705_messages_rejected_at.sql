alter table public.messages add column if not exists rejected_at timestamptz;
alter table public.messages add column if not exists rejected_by uuid;

create or replace function public.messages_set_rejected_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.approval_status = 'rejected' then
      new.rejected_at := coalesce(new.rejected_at, now());
      new.rejected_by := coalesce(new.rejected_by, case when pg_trigger_depth() = 1 then auth.uid() end);
    end if;
  elsif new.approval_status = 'rejected' and old.approval_status is distinct from 'rejected' then
    new.rejected_at := now();
    new.rejected_by := case when pg_trigger_depth() = 1 then auth.uid() end;
  elsif new.approval_status is distinct from 'rejected' and old.approval_status = 'rejected' then
    new.rejected_at := null;
    new.rejected_by := null;
  end if;
  return new;
end; $function$;

drop trigger if exists trg_messages_rejected_at on public.messages;
create trigger trg_messages_rejected_at
  before insert or update of approval_status on public.messages
  for each row execute function public.messages_set_rejected_at();

update public.messages
   set rejected_at = updated_at
 where approval_status = 'rejected' and rejected_at is null;

create index if not exists messages_client_rejected_at_idx
  on public.messages (client_id, rejected_at)
  where approval_status = 'rejected';