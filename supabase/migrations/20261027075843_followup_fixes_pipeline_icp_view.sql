create extension if not exists unaccent with schema extensions;

create or replace function public.client_pipeline(p_client_id uuid, p_status text default null, p_search text default null, p_limit integer default 50, p_offset integer default 0)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
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
           or (p_status not like 'seq:%' and s.pipeline_status = p_status))
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
           or (p_status not like 'seq:%' and s.pipeline_status = p_status))
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
      where s.seq_status is not null));
end;
$function$;

-- save_client_icp: an emptied list is not a hand edit, so rebuild may refill it.
create or replace function public.save_client_icp(p_client_id uuid, p_patch jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_field text;
  v_allowed text[] := array['target_business_types','target_locations','decision_maker_roles','pain_points','value_props','suggested_search_terms','notes'];
  v_edited text[];
  v_count int;
begin
  if not public.is_admin() and p_client_id is distinct from public.current_client_id() then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'patch_must_be_object');
  end if;

  insert into public.client_icp (client_id) values (p_client_id) on conflict (client_id) do nothing;
  select coalesce(edited_fields, '{}') into v_edited from public.client_icp where client_id = p_client_id;

  for v_field in select jsonb_object_keys(p_patch) loop
    if not (v_field = any(v_allowed)) then
      return jsonb_build_object('ok', false, 'error', 'unknown_field', 'field', v_field);
    end if;

    if v_field = 'notes' then
      update public.client_icp set notes = p_patch->>'notes', updated_at = now() where client_id = p_client_id;
    else
      if jsonb_typeof(p_patch->v_field) <> 'array' then
        return jsonb_build_object('ok', false, 'error', 'field_must_be_array', 'field', v_field);
      end if;

      execute format(
        'update public.client_icp set %I = (select coalesce(array_agg(btrim(x)), ''{}''::text[]) '
        || 'from jsonb_array_elements_text($1) x where btrim(x) <> ''''), updated_at = now() '
        || 'where client_id = $2', v_field)
      using p_patch->v_field, p_client_id;

      execute format('select coalesce(array_length(%I, 1), 0) from public.client_icp where client_id = $1', v_field)
        into v_count using p_client_id;

      if v_count = 0 then
        v_edited := array_remove(v_edited, v_field);
      elsif not (v_field = any(v_edited)) then
        v_edited := v_edited || v_field;
      end if;
    end if;
  end loop;

  update public.client_icp set edited_fields = v_edited, updated_at = now() where client_id = p_client_id;
  return jsonb_build_object('ok', true, 'edited_fields', v_edited);
end;
$function$;

-- Admin queue can read pending_since directly.
create or replace view public.messages_with_sender as
 SELECT m.id, m.prospect_id, m.campaign_id, m.client_id, m.channel, m.subject, m.body, m.message_type,
    m.approval_status, m.approved_by, m.approved_at, m.send_status, m.scheduled_for, m.sent_at,
    m.gmail_message_id, m.gmail_thread_id, m.created_at, m.updated_at, m.opened_at, m.open_count,
    cec.email_address AS sender_email, cec.status AS sender_status, c.business_name AS client_name,
    m.pending_since
   FROM ((messages m
     LEFT JOIN client_email_credentials cec ON ((cec.client_id = m.client_id)))
     LEFT JOIN clients c ON ((c.id = m.client_id)))