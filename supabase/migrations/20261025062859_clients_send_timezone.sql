alter table public.clients add column if not exists send_timezone text not null default 'America/Chicago';

create or replace function public.validate_send_timezone() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.send_timezone) then
    raise exception 'Invalid send_timezone: %', new.send_timezone;
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_send_timezone on public.clients;
create trigger trg_validate_send_timezone before insert or update of send_timezone on public.clients
for each row execute function public.validate_send_timezone();

update public.clients set send_timezone = 'Europe/Prague' where id = '40d3f053-dc07-49d6-a3c7-3ecba00f7c88';