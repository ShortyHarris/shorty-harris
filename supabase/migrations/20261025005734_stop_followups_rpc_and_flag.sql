
alter table public.prospects add column if not exists followups_stopped boolean not null default false;

create or replace function public.stop_followups(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_client uuid; v_n int;
begin
  select client_id into v_client from public.prospects where id = p_prospect_id;
  if v_client is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.can_manage_client(v_client) then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  update public.prospects set followups_stopped = true, updated_at = now() where id = p_prospect_id;
  with u as (update public.messages set approval_status = 'rejected', updated_at = now()
             where prospect_id = p_prospect_id and message_type <> 'initial'
               and send_status = 'not_sent' and approval_status <> 'rejected' returning 1)
  select count(*) into v_n from u;
  update public.follow_up_schedules set status = 'cancelled', updated_at = now()
    where prospect_id = p_prospect_id and status in ('pending','generating','generated')
      and not exists (select 1 from public.messages m where m.prospect_id = p_prospect_id and m.message_type <> 'initial' and m.send_status = 'sent' and m.sent_at >= follow_up_schedules.due_at - interval '1 day');
  return jsonb_build_object('ok', true, 'followups_cancelled', v_n);
end; $$;
revoke all on function public.stop_followups(uuid) from public, anon;
grant execute on function public.stop_followups(uuid) to authenticated;

create or replace view public.sendable_messages as
 SELECT m.id, m.prospect_id, m.campaign_id, m.client_id, m.channel, m.subject, m.body, m.message_type,
    m.approval_status, m.approved_by, m.approved_at, m.send_status, m.scheduled_for, m.sent_at,
    m.gmail_message_id, m.gmail_thread_id, m.created_at, m.updated_at, m.opened_at, m.open_count,
    m.last_opened_at, m.send_claimed_at
   FROM messages m
     JOIN prospects p ON p.id = m.prospect_id
     LEFT JOIN campaigns c ON c.id = m.campaign_id
     LEFT JOIN clients cl ON cl.id = m.client_id
  WHERE m.approval_status = 'approved'::text AND m.send_status = 'not_sent'::text
    AND coalesce((SELECT ps.unsubscribe_ok FROM platform_settings ps WHERE ps.id = 1), true)
    AND (p.pipeline_status <> ALL (ARRAY['replied','hot_lead','won','lost','called','bounced']))
    AND p.sequence_paused = false
    AND (m.message_type = 'initial' OR p.followups_stopped = false)
    AND (COALESCE(c.status, 'active') <> ALL (ARRAY['paused','cancelled','draft']))
    AND NOT (EXISTS (SELECT 1 FROM do_not_contact d WHERE lower(d.email) = lower(p.email)))
    AND NOT ((COALESCE(c.language, '') = 'Czech' OR is_eu_country(COALESCE(c.country, cl.country)))
             AND ((is_generic_mailbox(p.email) AND NOT coalesce(cl.allow_generic_mailboxes, false)) OR is_freemail(p.email)))
    AND NOT (EXISTS (SELECT 1 FROM country_send_holds h WHERE h.cleared = false AND h.country = upper(COALESCE(c.country, cl.country, ''))))
    AND (m.message_type = 'initial' OR (EXISTS (
          SELECT 1 FROM messages prev
          WHERE prev.prospect_id = m.prospect_id AND prev.send_status = 'sent'
            AND prev.message_type = CASE m.message_type WHEN 'follow_up_d3' THEN 'initial' WHEN 'follow_up_d7' THEN 'follow_up_d3' WHEN 'follow_up_d14' THEN 'follow_up_d7' ELSE NULL END
            AND add_business_days(prev.sent_at, CASE m.message_type WHEN 'follow_up_d3' THEN 3 WHEN 'follow_up_d7' THEN 5 ELSE 7 END) <= now())));

create or replace view public.message_block_reasons as
select m.id as message_id, m.client_id, m.prospect_id, m.campaign_id,
  case
    when not coalesce((select ps.unsubscribe_ok from platform_settings ps where ps.id=1), true) then 'unsubscribe_unhealthy'
    when p.pipeline_status in ('replied','hot_lead','won','lost','called','bounced') then 'prospect_status'
    when p.sequence_paused then 'sequence_paused'
    when m.message_type <> 'initial' and p.followups_stopped then 'followups_stopped'
    when coalesce(c.status,'active') in ('paused','cancelled','draft') then 'campaign_inactive'
    when exists (select 1 from do_not_contact d where lower(d.email)=lower(p.email)) then 'do_not_contact'
    when (coalesce(c.language,'')='Czech' or is_eu_country(coalesce(c.country,cl.country))) and is_freemail(p.email) then 'freemail_address'
    when (coalesce(c.language,'')='Czech' or is_eu_country(coalesce(c.country,cl.country))) and is_generic_mailbox(p.email) and not coalesce(cl.allow_generic_mailboxes,false) then 'generic_mailbox'
    when exists (select 1 from country_send_holds h where h.cleared=false and h.country=upper(coalesce(c.country,cl.country,''))) then 'country_hold'
    else 'waiting_followup_timing'
  end as reason
from messages m
join prospects p on p.id=m.prospect_id
left join campaigns c on c.id=m.campaign_id
left join clients cl on cl.id=m.client_id
where m.approval_status='approved' and m.send_status='not_sent'
  and not exists (select 1 from sendable_messages s where s.id=m.id)
  and public.can_manage_client(m.client_id);
grant select on public.message_block_reasons to authenticated;
