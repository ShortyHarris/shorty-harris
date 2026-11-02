-- Additive only.
--
-- client_pipeline: adds the flag:drafts_rejected filter and drafts_rejected_prospects count:
-- prospects whose drafts were all rejected, with nothing pending, approved or sent.
--
-- client_analytics: new. Analytics used to count in the browser from raw rows, which the
-- API caps at 1000 per request. Counts per prospect (the unit the Results flow uses) and
-- uses the same reply rule as client_funnel human_replies.

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
           or (p_status = 'flag:drafts_rejected'
               and exists (select 1 from public.messages m where m.prospect_id = s.id and m.approval_status = 'rejected')
               and not exists (select 1 from public.messages m where m.prospect_id = s.id
                               and (m.approval_status in ('pending','approved') or m.send_status = 'sent')))
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
           or (p_status = 'flag:drafts_rejected'
               and exists (select 1 from public.messages m where m.prospect_id = s.id and m.approval_status = 'rejected')
               and not exists (select 1 from public.messages m where m.prospect_id = s.id
                               and (m.approval_status in ('pending','approved') or m.send_status = 'sent')))
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
                      and (public.is_admin() or not public.is_send_rule_held(p.email, m.campaign_id, m.client_id)))),
    'drafts_rejected_prospects', (
      select count(*) from public.prospects p
      where p.client_id = p_client_id and coalesce(p.is_sandbox, false) = false
        and exists (select 1 from public.messages m where m.prospect_id = p.id and m.approval_status = 'rejected')
        and not exists (select 1 from public.messages m where m.prospect_id = p.id
                        and (m.approval_status in ('pending','approved') or m.send_status = 'sent'))));
end;
$function$;

CREATE OR REPLACE FUNCTION public.client_analytics(p_client_id uuid)
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

  with pros as (
    select p.id, p.campaign_id
    from public.prospects p
    where p.client_id = p_client_id and coalesce(p.is_sandbox, false) = false and p.campaign_id is not null
  ),
  sent as (
    select m.prospect_id, pros.campaign_id, m.sent_at, m.opened_at, coalesce(m.open_count, 0) as open_count
    from public.messages m join pros on pros.id = m.prospect_id
    where m.client_id = p_client_id and m.send_status = 'sent'
  ),
  rep as (
    -- Same "real reply" rule as client_funnel human_replies.
    select r.prospect_id, pros.campaign_id, r.intent, r.classified_at,
      (r.intent is not null and r.intent not in ('automated','auto_reply','out_of_office','bounced')) as human
    from public.replies r join pros on pros.id = r.prospect_id
    where r.client_id = p_client_id
  ),
  dnc as (
    select distinct d.source_prospect_id as prospect_id
    from public.do_not_contact d join pros on pros.id = d.source_prospect_id
  ),
  per_prospect as (
    select pros.id, pros.campaign_id,
      (select count(*) from sent s where s.prospect_id = pros.id) as emails_sent,
      exists (select 1 from sent s where s.prospect_id = pros.id and s.open_count > 0) as opened,
      exists (select 1 from rep where rep.prospect_id = pros.id and rep.human) as replied,
      exists (select 1 from rep where rep.prospect_id = pros.id and rep.intent = 'bounced') as bounced,
      exists (select 1 from dnc where dnc.prospect_id = pros.id) as opted_out
    from pros
  ),
  emailed as (select * from per_prospect where emails_sent > 0),
  by_c as (
    select e.campaign_id, coalesce(c.name, 'Untitled campaign') as name,
      count(*) as emailed, sum(e.emails_sent) as emails_sent,
      count(*) filter (where e.opened) as opened, count(*) filter (where e.replied) as replied,
      count(*) filter (where e.bounced) as bounced, count(*) filter (where e.opted_out) as opt_outs
    from emailed e left join public.campaigns c on c.id = e.campaign_id
    group by e.campaign_id, c.name
  ),
  weeks as (
    select generate_series(date_trunc('week', now() at time zone 'UTC') - interval '7 weeks',
                           date_trunc('week', now() at time zone 'UTC'), interval '1 week')::date as wk
  ),
  activity as (
    select date_trunc('week', s.sent_at at time zone 'UTC')::date as week_start, s.campaign_id, 'sent' as kind
      from sent s where s.sent_at is not null
    union all
    select date_trunc('week', s.opened_at at time zone 'UTC')::date, s.campaign_id, 'opened'
      from sent s where s.opened_at is not null
    union all
    select date_trunc('week', rep.classified_at at time zone 'UTC')::date, rep.campaign_id, 'replied'
      from rep where rep.human and rep.classified_at is not null
  )
  select jsonb_build_object(
    'ok', true,
    'overall', (select jsonb_build_object(
        'emailed', count(*), 'emails_sent', coalesce(sum(emails_sent), 0),
        'opened', count(*) filter (where opened), 'replied', count(*) filter (where replied),
        'bounced', count(*) filter (where bounced), 'opt_outs', count(*) filter (where opted_out))
      from emailed),
    'by_campaign', (select coalesce(jsonb_agg(jsonb_build_object(
        'campaign_id', campaign_id, 'campaign_name', name, 'emailed', emailed, 'emails_sent', emails_sent,
        'opened', opened, 'replied', replied, 'bounced', bounced, 'opt_outs', opt_outs) order by emailed desc), '[]'::jsonb)
      from by_c),
    'weeks', (select jsonb_agg(wk order by wk) from weeks),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object(
        'week_start', a.week_start, 'campaign_id', a.campaign_id, 'kind', a.kind, 'n', a.n)), '[]'::jsonb)
      from (select week_start, campaign_id, kind, count(*) as n from activity
            where week_start >= (select min(wk) from weeks) group by 1, 2, 3) a)
  ) into v;

  return v;
end;
$function$;
