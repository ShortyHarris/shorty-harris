create or replace view public.mailbox_events_pending with (security_invoker = true) as
select e.id, e.client_id, c.business_name, e.event_type, e.detail, e.created_at
from public.mailbox_events e join public.clients c on c.id = e.client_id
where e.alerted_at is null;
revoke all on public.mailbox_events_pending from anon, authenticated;
grant select on public.mailbox_events_pending to service_role;
grant select, update on public.mailbox_events to service_role;

create or replace view public.mailbox_auth_targets with (security_invoker = true) as
select cec.client_id, cec.email_address, lower(split_part(cec.email_address, '@', 2)) as domain
from public.client_email_credentials cec
where cec.status = 'active'
  and lower(split_part(cec.email_address, '@', 2)) not in ('gmail.com', 'googlemail.com');
revoke all on public.mailbox_auth_targets from anon, authenticated;
grant select on public.mailbox_auth_targets to service_role;

create or replace function public.set_mailbox_auth(p_client_id uuid, p_result jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update public.client_email_credentials
     set auth_check = p_result, auth_checked_at = now()
   where client_id = p_client_id and status = 'active';
  ok := coalesce((p_result->>'spf')::boolean, false)
        and coalesce((p_result->>'dkim')::boolean, false)
        and coalesce((p_result->>'dmarc')::boolean, false);
  if not ok and not exists (
    select 1 from public.mailbox_events
     where client_id = p_client_id and event_type = 'auth_warning' and created_at > now() - interval '7 days'
  ) then
    insert into public.mailbox_events (client_id, event_type, detail)
    values (p_client_id, 'auth_warning', p_result);
  end if;
end $$;
revoke execute on function public.set_mailbox_auth(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_mailbox_auth(uuid, jsonb) to service_role;