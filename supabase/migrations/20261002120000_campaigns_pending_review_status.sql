-- 'draft' was overloaded: client-submitted campaigns awaiting admin approval
-- and campaigns an admin intentionally saves as draft both used status='draft',
-- distinguished only by a client-side heuristic (creator role). Split them:
-- client submissions now land in 'pending_review'; 'draft' is admin-only.
-- No existing rows are in 'draft' today, so no data backfill is needed.

alter table public.campaigns
  drop constraint campaigns_status_check,
  add constraint campaigns_status_check
    check (status = any (array['pending_review', 'draft', 'active', 'paused', 'completed']));

drop policy if exists client_own_campaigns_insert on public.campaigns;
create policy client_own_campaigns_insert on public.campaigns
  for insert
  with check (client_id = current_client_id() and status = 'pending_review');

create or replace function public.auto_approve_client_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  should_auto_approve boolean;
begin
  if new.status = 'pending_review' then
    select auto_approve_campaigns into should_auto_approve
    from public.clients
    where id = new.client_id;

    if should_auto_approve then
      perform set_config('app.bypass_campaign_protection', 'true', true); -- true = local to this transaction only
      update public.campaigns set status = 'active' where id = new.id;
    end if;
  end if;
  return new;
end;
$$;
