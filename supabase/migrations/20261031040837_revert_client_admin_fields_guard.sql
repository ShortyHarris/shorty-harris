-- Reverting my own change from minutes ago. I widened this guard to trust
-- is_trusted_backend(), mirroring the fix on protect_campaign_admin_fields.
-- That fix was justified: WF0a genuinely must write campaigns.status, and the
-- silent revert was breaking a live code path.
--
-- There is no equivalent need here. No backend workflow writes any of these
-- columns. The only effect of widening it would be to loosen the guard on
-- allow_generic_mailboxes, which enforces the EU generic-mailbox send rule, and
-- on monthly_prospect_limit and max_campaigns, which are billing controls, in
-- exchange for nothing. If a backend write to these is ever needed, widen it
-- then, deliberately, with that caller in hand.
create or replace function public.protect_client_admin_fields()
returns trigger
language plpgsql
as $$
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