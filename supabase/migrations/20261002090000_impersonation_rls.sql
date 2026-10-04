-- Admin "View as client" read-only impersonation.
--
-- is_admin() currently grants every admin_all_* policy blanket ALL access
-- with no client_id scoping (confirmed live: FOR ALL USING (is_admin())
-- WITH CHECK (is_admin()) on clients/campaigns/prospects/messages/
-- hot_leads/billing_profiles/replies/do_not_contact/credit_transactions/
-- payments) — reusing an admin's own session for impersonation would give
-- RLS nothing to block, since is_admin() is true regardless of which
-- client_id the frontend happens to be looking at.
--
-- Instead, impersonation uses a short-lived JWT (minted by the
-- start-impersonation edge function, signed with the project's JWT secret)
-- carrying the admin's own `sub` plus two custom claims:
-- { client_id: <target>, impersonating: true }. This migration teaches
-- Postgres about that claim:
--   - is_admin() now returns false whenever the claim is set, which
--     neuters every admin_all_* policy at the source — one change, not nine.
--   - a new SELECT-only policy per table grants access scoped to the
--     impersonated client_id. No corresponding insert/update/delete policy
--     exists for the claim anywhere — impersonation is read-only by
--     construction, not by convention.
--
-- warm_prospects and client_usage are security_invoker views over
-- prospects/messages/campaigns/clients, so they inherit this scoping
-- automatically — no separate policy needed for them.

create or replace function public.impersonating_client_id()
returns uuid
language sql stable
set search_path to 'public'
as $$
  select case
    when coalesce((auth.jwt() ->> 'impersonating')::boolean, false)
      then (auth.jwt() ->> 'client_id')::uuid
    else null
  end;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    and not coalesce((auth.jwt() ->> 'impersonating')::boolean, false);
$$;

create policy impersonation_read_clients on public.clients
  for select using (id = impersonating_client_id());

create policy impersonation_read_campaigns on public.campaigns
  for select using (client_id = impersonating_client_id());

create policy impersonation_read_prospects on public.prospects
  for select using (client_id = impersonating_client_id());

create policy impersonation_read_messages on public.messages
  for select using (client_id = impersonating_client_id());

create policy impersonation_read_hot_leads on public.hot_leads
  for select using (client_id = impersonating_client_id());

create policy impersonation_read_billing_profiles on public.billing_profiles
  for select using (client_id = impersonating_client_id());

create policy impersonation_read_replies on public.replies
  for select using (client_id = impersonating_client_id());

create policy impersonation_read_credit_transactions on public.credit_transactions
  for select using (client_id = impersonating_client_id());

create policy impersonation_read_payments on public.payments
  for select using (client_id = impersonating_client_id());

create policy impersonation_read_do_not_contact on public.do_not_contact
  for select using (
    exists (
      select 1 from public.prospects p
      where p.id = do_not_contact.source_prospect_id
        and p.client_id = impersonating_client_id()
    )
  );
