-- Single shared source of truth for "how many prospects does this campaign
-- have": a denormalised counter column on campaigns, maintained by a trigger
-- on prospects. Both the admin and client UIs read this column directly off
-- the campaigns row they already fetch, instead of each running their own
-- separate `prospects` count query (which could only ever be as fresh as
-- each side's own React Query cache — the two UIs were drifting apart after
-- a scrape because they refreshed on different triggers/timers).

alter table public.campaigns
  add column if not exists prospect_count integer not null default 0;

update public.campaigns c
set prospect_count = (
  select count(*) from public.prospects p where p.campaign_id = c.id
);

create or replace function public.recalc_campaign_prospect_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update campaigns set prospect_count = (
      select count(*) from prospects where campaign_id = new.campaign_id
    ) where id = new.campaign_id;
    return new;
  elsif tg_op = 'DELETE' then
    update campaigns set prospect_count = (
      select count(*) from prospects where campaign_id = old.campaign_id
    ) where id = old.campaign_id;
    return old;
  else -- UPDATE
    if new.campaign_id is distinct from old.campaign_id then
      update campaigns set prospect_count = (
        select count(*) from prospects where campaign_id = old.campaign_id
      ) where id = old.campaign_id;
      update campaigns set prospect_count = (
        select count(*) from prospects where campaign_id = new.campaign_id
      ) where id = new.campaign_id;
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_recalc_campaign_prospect_count on public.prospects;
create trigger trg_recalc_campaign_prospect_count
  after insert or update of campaign_id or delete on public.prospects
  for each row execute function public.recalc_campaign_prospect_count();
