-- The campaign admin-field guard protected against client-role users editing
-- status, scrape_enabled, client_id, created_by and channel. It checked only
-- is_admin(), which needs a real user JWT, so the n8n backend (service_role)
-- was treated as untrusted: its writes to these columns were silently reverted
-- with no error. That is why launching a campaign never promoted it out of
-- draft. can_manage_client() already trusts the backend; this brings the guard
-- in line with it. Client-role users remain blocked exactly as before.
create or replace function public.protect_campaign_admin_fields()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin()
     and not public.is_trusted_backend()
     and coalesce(current_setting('app.bypass_campaign_protection', true), 'false') <> 'true' then
    new.status := old.status;
    new.scrape_enabled := old.scrape_enabled;
    new.client_id := old.client_id;
    new.created_by := old.created_by;
    new.channel := old.channel;
  end if;
  return new;
end;
$$;