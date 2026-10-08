-- Sequence status label for prospects.
--
-- First match wins:
--   1. do_not_contact reason opt_out / stop_request  -> 'unsubscribed'
--   2. do_not_contact reason bounce, or pipeline_status = 'bounced' -> 'hard_bounce'
--   3. latest reply intent automated / auto_reply / out_of_office   -> 'automated_reply'
--   4. any reply with a human intent (classified, not automated, not bounced) -> 'human_reply'
--   5. otherwise NULL (the UI falls back to pipeline_status)
--
-- No new columns or endpoints: client_pipeline and prospect_sequence are
-- extended in place (same signatures). client_pipeline gains a per-row
-- 'sequence_status', a 'counts_by_sequence_status' map, and accepts
-- p_status = 'seq:<value>' to filter on it. prospect_sequence gains
-- 'sequence_status' at the top level.

-- Single source of truth for the rules above. Internal only: callable by the
-- SECURITY DEFINER RPCs (which run as the owner) but not exposed over the API.
create or replace function public.prospect_sequence_status(
  p_prospect_id uuid, p_email text, p_pipeline_status text
) returns text
language sql
stable
set search_path to 'public'
as $$
  select case
    when exists (select 1 from public.do_not_contact d
                 where lower(d.email) = lower(p_email)
                   and d.reason in ('opt_out', 'stop_request'))
      then 'unsubscribed'
    when p_pipeline_status = 'bounced'
      or exists (select 1 from public.do_not_contact d
                 where lower(d.email) = lower(p_email) and d.reason = 'bounce')
      then 'hard_bounce'
    when (select r.intent from public.replies r
          where r.prospect_id = p_prospect_id
          order by r.received_at desc nulls last, r.created_at desc
          limit 1) in ('automated', 'auto_reply', 'out_of_office')
      then 'automated_reply'
    when exists (select 1 from public.replies r
                 where r.prospect_id = p_prospect_id
                   and r.intent is not null
                   and r.intent not in ('automated', 'auto_reply', 'out_of_office', 'bounced'))
      then 'human_reply'
    else null
  end;
$$;

revoke execute on function public.prospect_sequence_status(uuid, text, text) from public, anon, authenticated;

create or replace function public.client_pipeline(
  p_client_id uuid, p_status text default null, p_search text default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_rows jsonb;
  v_total integer;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.is_admin() and not public.is_trusted_backend()
     and p_client_id is distinct from public.current_client_id()
     and p_client_id is distinct from public.impersonating_client_id() then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;

  with scoped as (
    select p.*, public.prospect_sequence_status(p.id, p.email, p.pipeline_status) as seq_status
    from public.prospects p
    where p.client_id = p_client_id
      and coalesce(p.is_sandbox, false) = false
  ),
  filtered as (
    select s.* from scoped s
    where (p_status is null
           or (p_status like 'seq:%' and s.seq_status = substr(p_status, 5))
           or (p_status not like 'seq:%' and s.pipeline_status = p_status))
      and (p_search is null or btrim(p_search) = '' or
           s.business_name ilike '%' || btrim(p_search) || '%' or
           s.email ilike '%' || btrim(p_search) || '%' or
           s.contact_name ilike '%' || btrim(p_search) || '%')
  )
  select count(*) into v_total from filtered;

  with scoped as (
    select p.*, public.prospect_sequence_status(p.id, p.email, p.pipeline_status) as seq_status
    from public.prospects p
    where p.client_id = p_client_id
      and coalesce(p.is_sandbox, false) = false
  ),
  filtered as (
    select s.* from scoped s
    where (p_status is null
           or (p_status like 'seq:%' and s.seq_status = substr(p_status, 5))
           or (p_status not like 'seq:%' and s.pipeline_status = p_status))
      and (p_search is null or btrim(p_search) = '' or
           s.business_name ilike '%' || btrim(p_search) || '%' or
           s.email ilike '%' || btrim(p_search) || '%' or
           s.contact_name ilike '%' || btrim(p_search) || '%')
    order by s.updated_at desc nulls last, s.created_at desc
    limit v_limit offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'prospect_id', f.id,
    'business_name', f.business_name,
    'contact_name', f.contact_name,
    'email', f.email,
    'phone', f.phone,
    'website', f.website,
    'category', f.category,
    'location', f.location,
    'pipeline_status', f.pipeline_status,
    'sequence_status', f.seq_status,
    'call_outcome', f.call_outcome,
    'call_outcome_at', f.call_outcome_at,
    'client_note', f.client_note,
    'created_at', f.created_at,
    'campaign', (select c.name from public.campaigns c where c.id = f.campaign_id),
    'emails_sent', (select count(*) from public.messages m
                    where m.prospect_id = f.id and m.send_status = 'sent'),
    'last_sent_at', (select max(m.sent_at) from public.messages m
                     where m.prospect_id = f.id and m.send_status = 'sent'),
    'awaiting_approval', (select count(*) from public.messages m
                          where m.prospect_id = f.id
                            and m.send_status = 'not_sent'
                            and m.approval_status = 'pending'),
    'opened', (select coalesce(sum(m.open_count), 0) from public.messages m
               where m.prospect_id = f.id),
    'replies', (select count(*) from public.replies r where r.prospect_id = f.id),
    'last_reply_at', (select max(r.received_at) from public.replies r
                      where r.prospect_id = f.id),
    'hot_lead_id', (select h.id from public.hot_leads h where h.prospect_id = f.id limit 1),
    'hot_lead_status', (select h.status from public.hot_leads h
                        where h.prospect_id = f.id limit 1),
    'suppressed', exists (select 1 from public.do_not_contact d
                          where lower(d.email) = lower(f.email))
  ) order by f.updated_at desc nulls last), '[]'::jsonb)
  into v_rows from filtered f;

  return jsonb_build_object(
    'ok', true,
    'total', v_total,
    'limit', v_limit,
    'offset', greatest(coalesce(p_offset, 0), 0),
    'rows', v_rows,
    'counts_by_status', (
      select coalesce(jsonb_object_agg(s.pipeline_status, s.n), '{}'::jsonb)
      from (select p.pipeline_status, count(*) as n
            from public.prospects p
            where p.client_id = p_client_id and coalesce(p.is_sandbox, false) = false
            group by 1) s),
    'counts_by_sequence_status', (
      select coalesce(jsonb_object_agg(s.seq_status, s.n), '{}'::jsonb)
      from (select public.prospect_sequence_status(p.id, p.email, p.pipeline_status) as seq_status,
                   count(*) as n
            from public.prospects p
            where p.client_id = p_client_id and coalesce(p.is_sandbox, false) = false
            group by 1) s
      where s.seq_status is not null));
end;
$function$;

create or replace function public.prospect_sequence(p_prospect_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_client uuid;
  v_prospect public.prospects;
  v_steps jsonb;
begin
  select * into v_prospect from public.prospects where id = p_prospect_id;
  if v_prospect.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_client := v_prospect.client_id;

  if not public.is_admin() and not public.is_trusted_backend()
     and v_client is distinct from public.current_client_id()
     and v_client is distinct from public.impersonating_client_id() then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;

  select jsonb_agg(x.s order by x.sort_order) into v_steps
  from (
    select
      t.sort_order,
      jsonb_build_object(
        'step', t.label,
        'message_type', t.message_type,
        'day', t.day,
        'message_id', m.id,
        'subject', m.subject,
        'body', m.body,
        'approval_status', m.approval_status,
        'send_status', m.send_status,
        'scheduled_for', m.scheduled_for,
        'sent_at', m.sent_at,
        'opened', coalesce(m.open_count, 0),
        'last_opened_at', m.last_opened_at,
        -- Planned date for a step not yet written, from the schedule row.
        'due_at', f.due_at,
        'schedule_status', f.status,
        'state', case
          when m.send_status = 'sent' then 'sent'
          when m.send_status = 'blocked_hot_lead' then 'stopped_hot_lead'
          when m.send_status = 'blocked_dnc' then 'stopped_unsubscribed'
          when m.send_status = 'failed' then 'failed'
          when f.status = 'cancelled' then 'cancelled'
          when m.id is not null and m.approval_status = 'pending' then 'awaiting_approval'
          when m.id is not null and m.approval_status = 'rejected' then 'rejected'
          when m.id is not null then 'ready'
          when f.id is not null then 'scheduled'
          else 'not_written'
        end
      ) as s
    from (
      values ('Initial email', 'initial', 0, 1),
             ('Follow-up 1', 'follow_up_d3', 3, 2),
             ('Follow-up 2', 'follow_up_d7', 7, 3),
             ('Follow-up 3', 'follow_up_d14', 14, 4)
    ) as t(label, message_type, day, sort_order)
    left join lateral (
      select m.* from public.messages m
      where m.prospect_id = p_prospect_id and m.message_type = t.message_type
      order by (m.send_status = 'sent') desc, m.created_at desc
      limit 1
    ) m on true
    left join lateral (
      select f.* from public.follow_up_schedules f
      where f.prospect_id = p_prospect_id and f.follow_up_day = nullif(t.day, 0)
      order by f.created_at desc limit 1
    ) f on true
  ) x;

  return jsonb_build_object(
    'ok', true,
    'prospect', jsonb_build_object(
      'prospect_id', v_prospect.id,
      'business_name', v_prospect.business_name,
      'contact_name', v_prospect.contact_name,
      'email', v_prospect.email,
      'pipeline_status', v_prospect.pipeline_status),
    'sequence_status', public.prospect_sequence_status(
      v_prospect.id, v_prospect.email, v_prospect.pipeline_status),
    'stopped_because', case
      when exists (select 1 from public.hot_leads h where h.prospect_id = p_prospect_id
                     and h.status in ('new','viewed','contacted','won'))
        then 'they_replied_with_interest'
      when exists (select 1 from public.do_not_contact d
                     where lower(d.email) = lower(v_prospect.email))
        then 'unsubscribed_or_bounced'
      else null end,
    'replies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'received_at', r.received_at, 'intent', r.intent, 'body', r.body)
        order by r.received_at), '[]'::jsonb)
      from public.replies r where r.prospect_id = p_prospect_id),
    'steps', coalesce(v_steps, '[]'::jsonb));
end;
$function$;
