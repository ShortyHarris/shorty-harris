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
security definer
set search_path to 'public'
as $function$
declare
  v_admin boolean; v_tz text; v_day_start timestamptz;
  v_limit int; v_offset int; v_result jsonb;
begin
  if not public.can_manage_client(p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if p_tab not in ('approved', 'blocked') then
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

  with base as (
    select m.id, m.prospect_id, m.campaign_id, m.channel, m.subject, m.body, m.message_type,
           m.approval_status, m.created_at, m.pending_since, m.approved_at,
           m.angle, m.observation, m.observation_source_url,
           r.reason, c.status as campaign_status,
           p.business_name, p.contact_name, p.email, p.phone, p.category, p.location,
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
  visible as (
    select * from base where v_admin or not policy_held
  ),
  filtered as (
    select * from visible v
     where (p_tab = 'approved' or v.cat = 'blocked')
       and (p_reason is null or v.reason = p_reason)
       and (p_message_type is null or v.message_type = p_message_type)
  ),
  numbered as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'approved_asc'  then f.approved_at end asc,
        case when p_sort = 'approved_desc' then f.approved_at end desc,
        case when p_sort = 'prospect_asc'  then lower(f.business_name) end asc,
        case when p_sort = 'prospect_desc' then lower(f.business_name) end desc,
        f.id) as rn
      from filtered f
  )
  select jsonb_build_object(
    'ok', true,
    'is_admin', v_admin,
    'time_zone', v_tz,
    'counts', (select jsonb_build_object(
        'approved',    count(*),
        'sendable',    count(*) filter (where cat = 'sendable'),
        'scheduled',   count(*) filter (where cat = 'scheduled'),
        'blocked',     count(*) filter (where cat = 'blocked'),
        'policy_held', count(*) filter (where policy_held))
       from visible),
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
      'pending', (select count(*) from public.messages x
                   where x.client_id = p_client_id and x.approval_status = 'pending'),
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