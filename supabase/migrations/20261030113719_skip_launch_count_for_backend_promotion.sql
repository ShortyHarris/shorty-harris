-- count_campaign_launch() increments monthly_launch_usage on any draft->active
-- transition. WF0a already counts the launch explicitly in its own nodes, at
-- the point where it makes the billing decision. Now that WF0a also promotes
-- the campaign out of draft, both would fire and every launch would consume two
-- of the client's five monthly free launches.
--
-- WF0a stays the single source of truth for launch accounting, because it is
-- the only place that knows whether the launch was free or paid by credit. So
-- the trigger stands down for trusted-backend writes. A human admin flipping
-- status in the UI likewise should not silently consume a client's free launch.
-- Client-role transitions are unaffected and still counted.
create or replace function public.count_campaign_launch()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_backend() then
    return new;
  end if;

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