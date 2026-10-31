-- Same defect as protect_campaign_admin_fields had: this guard checks only
-- is_admin(), which requires a real user JWT with an admin profile. The n8n
-- backend has no user session, so its writes to status, monthly_prospect_limit,
-- max_campaigns, auto_approve_campaigns, allow_generic_mailboxes and
-- is_internal were silently reverted with no error raised. Nothing depends on
-- it today, which is the only reason it has not surfaced, and a silent revert
-- is the hardest kind of failure to diagnose.
--
-- can_manage_client() already trusts the backend; this brings the guard in line.
-- Client-role users remain blocked from these columns exactly as before.
-- representative_name is deliberately NOT protected: clients may set the name
-- that signs their own outgoing email.
create or replace function public.protect_client_admin_fields()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() and not public.is_trusted_backend() then
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