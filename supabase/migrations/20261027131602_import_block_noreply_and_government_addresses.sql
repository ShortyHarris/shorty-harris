create or replace function public.bad_target_reason(p_email text)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when coalesce(p_email,'') = '' then null
    when split_part(lower(p_email),'@',1) ~ '^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|noreply|mailer[-_.]?daemon|postmaster|webmaster|abuse|bounce|bounces|unsubscribe|privacy|legal|compliance|security|billing|invoices?)([._+-].*)?$'
      then 'no_reply_or_system_address'
    when split_part(lower(p_email),'@',2) ~ '(^|\.)(gov|mil)$' or split_part(lower(p_email),'@',2) ~ '\.(gov|mil)\.[a-z]{2}$'
      then 'government_address'
    when split_part(lower(p_email),'@',1) ~ 'acct|account[-_]?ww'
      then 'corporate_system_address'
    else null end
$$;

create or replace function public.import_block_reason(p_campaign_id uuid, p_email text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case
    when public.bad_target_reason(p_email) is not null
      then jsonb_build_object('blocked', true, 'reason', public.bad_target_reason(p_email))
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
$$