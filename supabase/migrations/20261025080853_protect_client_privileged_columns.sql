create or replace function public.protect_client_privileged_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(public.is_admin(), false) or coalesce(public.is_trusted_backend(), false) then
    return new;
  end if;
  if new.allow_generic_mailboxes is distinct from old.allow_generic_mailboxes
     or new.is_internal is distinct from old.is_internal
     or new.monthly_prospect_limit is distinct from old.monthly_prospect_limit
     or new.max_campaigns is distinct from old.max_campaigns then
    raise exception 'Only an administrator can change this setting.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_client_privileged_columns on public.clients;
create trigger trg_protect_client_privileged_columns
before update on public.clients
for each row execute function public.protect_client_privileged_columns();