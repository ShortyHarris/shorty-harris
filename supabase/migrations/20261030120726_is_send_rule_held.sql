create or replace function public.is_send_rule_held(p_email text, p_campaign_id uuid, p_client_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (coalesce(c.language, '') = 'Czech' or public.is_eu_country(coalesce(c.country, cl.country)))
    and (public.is_freemail(p_email)
         or (public.is_generic_mailbox(p_email) and not coalesce(cl.allow_generic_mailboxes, false))),
    false)
  from (select 1) one
  left join public.campaigns c on c.id = p_campaign_id
  left join public.clients cl on cl.id = p_client_id;
$function$;

revoke all on function public.is_send_rule_held(text, uuid, uuid) from public, anon;
grant execute on function public.is_send_rule_held(text, uuid, uuid) to authenticated, service_role;