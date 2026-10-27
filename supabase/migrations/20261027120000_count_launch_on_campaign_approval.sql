-- Count a "launch" when a campaign is approved (draft / pending_review -> active).
--
-- monthly_launch_usage backed the "N of 5 launches used" counter on the client
-- Campaigns page, but nothing ever wrote to it, so it always read 0 and the
-- monthly limit was never enforced. Approval is the one point every launch
-- passes through: an admin approving, or auto_approve_client_campaign
-- elevating a new campaign for an auto-approve client.
--
-- Only the first activation counts: pausing and re-activating a campaign
-- (paused -> active) is not a new launch. The month key is UTC 'YYYY-MM' to
-- match the client's `new Date().toISOString().slice(0, 7)`.

create or replace function public.count_campaign_launch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and old.status in ('draft', 'pending_review') then
    insert into public.monthly_launch_usage (client_id, month, launch_count)
    values (new.client_id, to_char(now() at time zone 'utc', 'YYYY-MM'), 1)
    on conflict (client_id, month)
    do update set launch_count = public.monthly_launch_usage.launch_count + 1,
                  updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_count_campaign_launch on public.campaigns;
create trigger trg_count_campaign_launch
  after update of status on public.campaigns
  for each row
  execute function public.count_campaign_launch();
