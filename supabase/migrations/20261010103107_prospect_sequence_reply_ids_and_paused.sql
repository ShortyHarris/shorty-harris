create or replace function public.prospect_sequence(p_prospect_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
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
      'pipeline_status', v_prospect.pipeline_status,
      'sequence_paused', coalesce(v_prospect.sequence_paused, false)),
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
        'id', r.id, 'received_at', r.received_at, 'intent', r.intent, 'body', r.body)
        order by r.received_at), '[]'::jsonb)
      from public.replies r where r.prospect_id = p_prospect_id),
    'steps', coalesce(v_steps, '[]'::jsonb));
end;
$function$;