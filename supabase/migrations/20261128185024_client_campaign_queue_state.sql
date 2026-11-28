-- Applied live as 20261128185024.

-- Clients can see whether their own campaigns are waiting in, or being worked by, the scrape queue.
--
-- discovery_queue is readable by admins only (20261031040936), so a client's Campaigns page
-- could not tell "launched and queued" from "never launched": a campaign waited six days as
-- "Active · Never scraped" in Nov 2026 while the dispatcher was failing, and nothing on the
-- client's page showed it. This returns only what the page needs, for one client's campaigns:
-- the in-flight state, when it was requested, and how many jobs are ahead of it.
--
-- Read-only and security definer so the table itself stays closed to clients; access is the
-- same can_manage_client check approved_queue uses (the client, an admin, or an admin viewing
-- as that client). Another client's id returns nothing.

create or replace function public.client_campaign_queue_state(p_client_id uuid)
returns table (campaign_id uuid, status text, requested_at timestamptz, started_at timestamptz, ahead integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select q.campaign_id, q.status, q.requested_at, q.started_at,
         case when q.status = 'queued' then
           (select count(*)::int from discovery_queue o
             where o.status = 'queued' and o.requested_at < q.requested_at)
         end as ahead
    from discovery_queue q
    join campaigns c on c.id = q.campaign_id
   where c.client_id = p_client_id
     and q.status in ('queued', 'running')
     and public.can_manage_client(p_client_id);
$function$;

revoke all on function public.client_campaign_queue_state(uuid) from public, anon;
grant execute on function public.client_campaign_queue_state(uuid) to authenticated, service_role;
