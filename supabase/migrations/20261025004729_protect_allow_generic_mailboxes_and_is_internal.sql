
alter table public.clients add column if not exists is_internal boolean not null default false;
update public.clients set is_internal = true where lower(contact_email) = 'hello@shortyharris.com';

create or replace function public.protect_client_admin_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then
    new.status := old.status;
    new.monthly_prospect_limit := old.monthly_prospect_limit;
    new.max_campaigns := old.max_campaigns;
    new.auto_approve_campaigns := old.auto_approve_campaigns;
    new.allow_generic_mailboxes := old.allow_generic_mailboxes;
    new.is_internal := old.is_internal;
  end if;
  return new;
end;
$$;
