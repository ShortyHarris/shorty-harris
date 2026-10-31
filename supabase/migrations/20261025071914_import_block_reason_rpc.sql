create or replace function public.import_block_reason(p_campaign_id uuid, p_email text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.id is null then jsonb_build_object('blocked', false, 'reason', null)
    when public.is_eu_country(c.country) and not coalesce(cl.allow_generic_mailboxes, false) and public.is_freemail(p_email)
      then jsonb_build_object('blocked', true, 'reason', 'freemail_address')
    when public.is_eu_country(c.country) and not coalesce(cl.allow_generic_mailboxes, false) and public.is_generic_mailbox(p_email)
      then jsonb_build_object('blocked', true, 'reason', 'generic_mailbox')
    else jsonb_build_object('blocked', false, 'reason', null)
  end
  from (select 1) x
  left join public.campaigns c on c.id = p_campaign_id
  left join public.clients cl on cl.id = c.client_id;
$$;
revoke all on function public.import_block_reason(uuid, text) from public;
grant execute on function public.import_block_reason(uuid, text) to anon, authenticated, service_role;