-- Additive only. Existing keys and filter values behave exactly as before.
--
-- client_funnel: adds per-prospect counts so the Results flow uses one unit
-- throughout. messages_generated and sent count emails (follow-ups included),
-- which made "Emails written" exceed "Prospects found".
--
-- client_pipeline: adds the 'flag:awaiting_approval' filter and the
-- awaiting_approval_prospects count. Both use the Approvals banner's rules (approved_queue
-- awaiting_prospects): finished prospects and, for clients, send-rule-held drafts are
-- excluded. Sandbox prospects are excluded too, like everywhere else in these RPCs.

CREATE OR REPLACE FUNCTION public.client_funnel(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not public.is_admin() and not public.is_trusted_backend()
     and p_client_id is distinct from public.current_client_id()
     and p_client_id is distinct from public.impersonating_client_id() then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;

  with base as (
    select p.id, p.email
    from public.prospects p
    where p.client_id = p_client_id and coalesce(p.is_sandbox, false) = false
  ),
  msg as (
    select m.prospect_id, m.send_status, m.approval_status
    from public.messages m
    where m.client_id = p_client_id
  ),
  rep as (
    select r.prospect_id,
      bool_or(r.intent = 'bounced') as bounced,
      bool_or(r.intent in ('automated','auto_reply','out_of_office')) as robot,
      bool_or(r.intent in ('interested','maybe')) as positive,
      bool_or(r.intent not in ('automated','auto_reply','out_of_office','bounced')) as human
    from public.replies r where r.client_id = p_client_id group by 1
  )
  select jsonb_build_object(
    'prospects', (select count(*) from base),
    'with_email', (select count(*) from base where email is not null and btrim(email) <> ''),
    'messages_generated', (select count(*) from msg),
    'awaiting_approval', (select count(*) from msg
      where send_status = 'not_sent' and approval_status = 'pending'),
    'rejected', (select count(*) from msg where approval_status = 'rejected'),
    'sent', (select count(*) from msg where send_status = 'sent'),
    'blocked', (select count(*) from msg where send_status in ('blocked_dnc','blocked_hot_lead')),
    'failed', (select count(*) from msg where send_status = 'failed'),
    'bounced', (select count(*) from rep where bounced),
    'auto_replies', (select count(*) from rep where robot),
    'human_replies', (select count(*) from rep where human),
    'positive_replies', (select count(*) from rep where positive),
    'hot_leads', (select count(*) from public.hot_leads where client_id = p_client_id),
    'hot_leads_open', (select count(*) from public.hot_leads
      where client_id = p_client_id and status in ('new','viewed')),
    'won', (select count(*) from public.hot_leads
      where client_id = p_client_id and status = 'won'),
    'prospects_written', (select count(distinct msg.prospect_id) from msg join base on base.id = msg.prospect_id),
    'prospects_awaiting', (select count(distinct m.prospect_id) from public.messages m
      join public.prospects p on p.id = m.prospect_id
      where m.client_id = p_client_id and coalesce(p.is_sandbox, false) = false
        and m.send_status = 'not_sent' and m.approval_status = 'pending'
        and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
        and (public.is_admin() or not public.is_send_rule_held(p.email, m.campaign_id, m.client_id))),
    'prospects_emailed', (select count(distinct msg.prospect_id) from msg join base on base.id = msg.prospect_id
      where msg.send_status = 'sent')
  ) into v;

  return jsonb_build_object('ok', true, 'funnel', v);
end;
$function$;

CREATE OR REPLACE FUNCTION public.client_pipeline(p_client_id uuid, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows jsonb;
  v_total integer;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
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
           or (p_status = 'flag:awaiting_approval' and exists (
                 select 1 from public.messages m
                 where m.prospect_id = s.id and m.send_status = 'not_sent' and m.approval_status = 'pending'
                   and (public.is_admin() or not public.is_send_rule_held(s.email, m.campaign_id, m.client_id)))
           and s.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced'))
           or (p_status not like 'seq:%' and p_status not like 'flag:%' and s.pipeline_status = p_status))
      and (v_q is null or
           s.business_name ilike '%' || v_q || '%' or
           s.email ilike '%' || v_q || '%' or
           s.contact_name ilike '%' || v_q || '%' or
           extensions.unaccent(coalesce(s.business_name,'')) ilike '%' || extensions.unaccent(v_q) || '%' or
           extensions.unaccent(coalesce(s.contact_name,'')) ilike '%' || extensions.unaccent(v_q) || '%')
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
           or (p_status = 'flag:awaiting_approval' and exists (
                 select 1 from public.messages m
                 where m.prospect_id = s.id and m.send_status = 'not_sent' and m.approval_status = 'pending'
                   and (public.is_admin() or not public.is_send_rule_held(s.email, m.campaign_id, m.client_id)))
           and s.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced'))
           or (p_status not like 'seq:%' and p_status not like 'flag:%' and s.pipeline_status = p_status))
      and (v_q is null or
           s.business_name ilike '%' || v_q || '%' or
           s.email ilike '%' || v_q || '%' or
           s.contact_name ilike '%' || v_q || '%' or
           extensions.unaccent(coalesce(s.business_name,'')) ilike '%' || extensions.unaccent(v_q) || '%' or
           extensions.unaccent(coalesce(s.contact_name,'')) ilike '%' || extensions.unaccent(v_q) || '%')
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
    'emails_sent', (select count(*) from public.messages m where m.prospect_id = f.id and m.send_status = 'sent'),
    'last_sent_at', (select max(m.sent_at) from public.messages m where m.prospect_id = f.id and m.send_status = 'sent'),
    'awaiting_approval', (select count(*) from public.messages m where m.prospect_id = f.id and m.send_status = 'not_sent' and m.approval_status = 'pending'),
    'opened', (select coalesce(sum(m.open_count), 0) from public.messages m where m.prospect_id = f.id),
    'replies', (select count(*) from public.replies r where r.prospect_id = f.id),
    'last_reply_at', (select max(r.received_at) from public.replies r where r.prospect_id = f.id),
    'hot_lead_id', (select h.id from public.hot_leads h where h.prospect_id = f.id limit 1),
    'hot_lead_status', (select h.status from public.hot_leads h where h.prospect_id = f.id limit 1),
    'suppressed', exists (select 1 from public.do_not_contact d where lower(d.email) = lower(f.email)),
    'followups_stopped', coalesce(f.followups_stopped, false),
    'sequence_paused', coalesce(f.sequence_paused, false)
  ) order by f.updated_at desc nulls last), '[]'::jsonb)
  into v_rows from filtered f;

  return jsonb_build_object(
    'ok', true, 'total', v_total, 'limit', v_limit,
    'offset', greatest(coalesce(p_offset, 0), 0),
    'rows', v_rows,
    'counts_by_status', (
      select coalesce(jsonb_object_agg(s.pipeline_status, s.n), '{}'::jsonb)
      from (select p.pipeline_status, count(*) as n from public.prospects p
            where p.client_id = p_client_id and coalesce(p.is_sandbox, false) = false group by 1) s),
    'counts_by_sequence_status', (
      select coalesce(jsonb_object_agg(s.seq_status, s.n), '{}'::jsonb)
      from (select public.prospect_sequence_status(p.id, p.email, p.pipeline_status) as seq_status, count(*) as n
            from public.prospects p
            where p.client_id = p_client_id and coalesce(p.is_sandbox, false) = false group by 1) s
      where s.seq_status is not null),
    'awaiting_approval_prospects', (
      select count(*) from public.prospects p
      where p.client_id = p_client_id and coalesce(p.is_sandbox, false) = false
        and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
        and exists (select 1 from public.messages m
                    where m.prospect_id = p.id and m.send_status = 'not_sent' and m.approval_status = 'pending'
                      and (public.is_admin() or not public.is_send_rule_held(p.email, m.campaign_id, m.client_id)))));
end;
$function$;
