-- 1. is_send_rule_held becomes SECURITY DEFINER.
-- approved_queue is SECURITY INVOKER, so this helper was evaluating its left
-- joins to campaigns and clients under the caller's RLS. A role that can read
-- messages but not those rows would get nulls, the predicate would return
-- false, and held drafts would be shown. Failing OPEN on a privacy rule is the
-- wrong direction. It returns only a boolean, so definer rights leak nothing.
create or replace function public.is_send_rule_held(p_email text, p_campaign_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
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

-- 2. approve_sequences must honour the same rule.
-- It approved every pending message for the prospect ids it was given, with no
-- send-rule check. Hiding held drafts in the UI alone would leave a client able
-- to approve them by calling this RPC with a known prospect id. The gate has to
-- live where the write happens, not only where the list is drawn.
create or replace function public.approve_sequences(p_client_id uuid, p_prospect_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_emails int; v_prospects int;
begin
  if not public.can_manage_client(p_client_id) then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  if p_prospect_ids is null or array_length(p_prospect_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_prospects'); end if;
  with upd as (
    update public.messages m set approval_status = 'approved', approved_at = now(), approved_by = auth.uid(), updated_at = now()
    from public.prospects p
    where p.id = m.prospect_id and m.client_id = p_client_id and m.prospect_id = any (p_prospect_ids)
      and m.approval_status = 'pending' and m.send_status = 'not_sent'
      and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
      and (public.is_admin()
           or not public.is_send_rule_held(p.email, m.campaign_id, m.client_id))
    returning m.prospect_id)
  select count(*), count(distinct prospect_id) into v_emails, v_prospects from upd;
  return jsonb_build_object('ok', true, 'emails_approved', v_emails, 'prospects', v_prospects);
end; $function$;

-- 3. approved_queue gains a 'pending' tab.
-- Held drafts were hidden once approved but visible while pending, so a client
-- could approve a draft that then vanished and approved_today read 0 after a
-- real approval. One gate, one place: pending now runs through the same
-- function and the same is_send_rule_held predicate.
create or replace function public.approved_queue(
  p_client_id    uuid,
  p_tab          text default 'approved',
  p_reason       text default null,
  p_message_type text default null,
  p_sort         text default 'approved_desc',
  p_limit        int  default 10,
  p_offset       int  default 0
) returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  v_admin boolean; v_tz text; v_day_start timestamptz;
  v_limit int; v_offset int; v_result jsonb;
begin
  if not public.can_manage_client(p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if p_tab not in ('approved', 'blocked', 'pending') then
    return jsonb_build_object('ok', false, 'error', 'bad_tab');
  end if;
  if p_sort not in ('approved_desc', 'approved_asc', 'prospect_asc', 'prospect_desc') then
    return jsonb_build_object('ok', false, 'error', 'bad_sort');
  end if;

  v_admin  := public.is_admin();
  v_limit  := least(greatest(coalesce(p_limit, 10), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  select coalesce(nullif(cl.send_timezone, ''), 'America/Chicago') into v_tz
    from public.clients cl where cl.id = p_client_id;
  v_tz := coalesce(v_tz, 'America/Chicago');
  v_day_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;

  with app_base as (
    select m.id, m.prospect_id, m.campaign_id, m.channel, m.subject, m.body, m.message_type,
           m.approval_status, m.created_at, m.pending_since, m.approved_at,
           m.angle, m.observation, m.observation_source_url,
           r.reason, c.status as campaign_status,
           p.business_name, p.contact_name, p.email, p.phone, p.category, p.location,
           p.pipeline_status,
           public.is_send_rule_held(p.email, m.campaign_id, m.client_id) as policy_held,
           case when r.reason is null then 'sendable'
                when r.reason = 'waiting_followup_timing' then 'scheduled'
                else 'blocked' end as cat
      from public.messages m
      join public.prospects p on p.id = m.prospect_id
      left join public.campaigns c on c.id = m.campaign_id
      left join (select message_id, reason from public.message_block_reasons where client_id = p_client_id) r
             on r.message_id = m.id
     where m.client_id = p_client_id and m.approval_status = 'approved' and m.send_status = 'not_sent'
  ),
  pend_base as (
    select m.id, m.prospect_id, m.campaign_id, m.channel, m.subject, m.body, m.message_type,
           m.approval_status, m.created_at, m.pending_since, m.approved_at,
           null::text as reason, c.status as campaign_status,
           p.business_name, p.contact_name, p.email, p.phone, p.category, p.location,
           p.pipeline_status,
           public.is_send_rule_held(p.email, m.campaign_id, m.client_id) as policy_held,
           'pending'::text as cat
      from public.messages m
      join public.prospects p on p.id = m.prospect_id
      left join public.campaigns c on c.id = m.campaign_id
     where m.client_id = p_client_id and m.approval_status = 'pending' and m.send_status = 'not_sent'
  ),
  visible as (select * from app_base where v_admin or not policy_held),
  pend_visible as (select * from pend_base where v_admin or not policy_held),
  chosen as (
    select * from visible where p_tab in ('approved', 'blocked')
    union all
    select * from pend_visible where p_tab = 'pending'
  ),
  filtered as (
    select * from chosen u
     where (p_tab <> 'blocked' or u.cat = 'blocked')
       and (p_reason is null or p_tab = 'pending' or u.reason = p_reason)
       and (p_message_type is null or u.message_type = p_message_type)
  ),
  numbered as (
    select f.*, row_number() over (
      order by
        case when p_tab = 'pending' then f.created_at end asc,
        case when p_tab <> 'pending' and p_sort = 'approved_asc'  then f.approved_at end asc,
        case when p_tab <> 'pending' and p_sort = 'approved_desc' then f.approved_at end desc,
        case when p_tab <> 'pending' and p_sort = 'prospect_asc'  then lower(f.business_name) end asc,
        case when p_tab <> 'pending' and p_sort = 'prospect_desc' then lower(f.business_name) end desc,
        f.id) as rn
      from filtered f
  )
  select jsonb_build_object(
    'ok', true,
    'is_admin', v_admin,
    'time_zone', v_tz,
    'counts', jsonb_build_object(
        'approved',    (select count(*) from visible),
        'sendable',    (select count(*) from visible where cat = 'sendable'),
        'scheduled',   (select count(*) from visible where cat = 'scheduled'),
        'blocked',     (select count(*) from visible where cat = 'blocked'),
        'policy_held', (select count(*) from visible where policy_held),
        'pending',     (select count(*) from pend_visible),
        'pending_policy_held', (select count(*) from pend_visible where policy_held),
        'awaiting_prospects', (select count(distinct prospect_id) from pend_visible
                                where pipeline_status not in
                                  ('replied','hot_lead','won','lost','called','bounced'))),
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'prospect_id', n.prospect_id, 'campaign_id', n.campaign_id,
        'channel', n.channel, 'subject', n.subject, 'body', n.body,
        'message_type', n.message_type, 'approval_status', n.approval_status,
        'created_at', n.created_at, 'pending_since', n.pending_since, 'approved_at', n.approved_at,
        'angle', n.angle, 'observation', n.observation, 'observation_source_url', n.observation_source_url,
        'block_reason', n.reason, 'campaign_status', n.campaign_status,
        'policy_held', n.policy_held,
        'prospect', jsonb_build_object(
          'id', n.prospect_id, 'business_name', n.business_name, 'contact_name', n.contact_name,
          'email', n.email, 'phone', n.phone, 'category', n.category, 'location', n.location)
      ) order by n.rn)
      from numbered n where n.rn > v_offset and n.rn <= v_offset + v_limit), '[]'::jsonb),
    'stats', jsonb_build_object(
      'pending', (select count(*) from pend_visible),
      'approved_today', (select count(*) from public.messages x
                          where x.client_id = p_client_id and x.approval_status = 'approved'
                            and x.approved_at >= v_day_start
                            and (x.send_status <> 'not_sent' or x.id in (select id from visible))),
      'sent_today', (select count(*) from public.messages x
                      where x.client_id = p_client_id and x.send_status = 'sent' and x.sent_at >= v_day_start),
      'rejected_today', (select count(*) from public.messages x
                          where x.client_id = p_client_id and x.approval_status = 'rejected'
                            and x.rejected_at >= v_day_start and x.rejected_by is not null),
      'rejected_total', (select count(*) from public.messages x
                          where x.client_id = p_client_id and x.approval_status = 'rejected'))
  ) into v_result;

  return v_result;
end; $function$;

revoke all on function public.approved_queue(uuid, text, text, text, text, int, int) from public, anon;
grant execute on function public.approved_queue(uuid, text, text, text, text, int, int) to authenticated, service_role;