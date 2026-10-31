-- Launch accounting was attached to the campaign draft->active transition, which
-- is the wrong event twice over: it misses a re-launch of an already-active
-- campaign, and it fires on any status edit that happens to cross that boundary.
-- monthly_launch_usage was empty for October despite three PostKing launches.
--
-- The actual launch event is the scrape being enqueued. That is also precisely
-- what refund_campaign_launch() reverses when a scrape fails, so counting here
-- makes the charge and the refund symmetrical, and it works no matter which
-- path enqueued the scrape.
--
-- Free-vs-paid: the first 5 launches per client per month are free, beyond that
-- WF0a deducts a credit before enqueueing. So the free counter is incremented
-- only while the client is still inside the free allowance; past it the credit
-- has already been taken and must not also consume a free launch. The 5 mirrors
-- the limit in WF0a's Check Launch Limit node; if one changes, change both.
create or replace function public.count_launch_on_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_month text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_count integer;
begin
  select client_id into v_client_id from public.campaigns where id = new.campaign_id;
  if v_client_id is null then
    return new;
  end if;

  select coalesce(launch_count, 0) into v_count
  from public.monthly_launch_usage
  where client_id = v_client_id and month = v_month;

  if coalesce(v_count, 0) >= 5 then
    return new;
  end if;

  insert into public.monthly_launch_usage (client_id, month, launch_count)
  values (v_client_id, v_month, 1)
  on conflict (client_id, month)
  do update set launch_count = public.monthly_launch_usage.launch_count + 1,
                updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_count_launch_on_enqueue on public.discovery_queue;
create trigger trg_count_launch_on_enqueue
  after insert on public.discovery_queue
  for each row execute function public.count_launch_on_enqueue();

-- Retire the status-based counter so a launch is not counted twice.
drop trigger if exists trg_count_campaign_launch on public.campaigns;