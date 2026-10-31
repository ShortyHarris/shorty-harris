alter table public.prospects add column if not exists sequence_paused boolean not null default false;

create or replace view public.sendable_messages as
select m.*
from public.messages m
join public.prospects p on p.id = m.prospect_id
left join public.campaigns c on c.id = m.campaign_id
where m.approval_status = 'approved'
  and m.send_status = 'not_sent'
  and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
  and p.sequence_paused = false
  and coalesce(c.status, 'active') not in ('paused','cancelled','draft')
  and not exists (select 1 from public.do_not_contact d where lower(d.email) = lower(p.email))
  and (
    m.message_type = 'initial'
    or exists (
      select 1 from public.messages prev
      where prev.prospect_id = m.prospect_id
        and prev.send_status = 'sent'
        and prev.message_type = case m.message_type
              when 'follow_up_d3' then 'initial'
              when 'follow_up_d7' then 'follow_up_d3'
              when 'follow_up_d14' then 'follow_up_d7' end
        and public.add_business_days(prev.sent_at, case m.message_type
              when 'follow_up_d3' then 3 when 'follow_up_d7' then 5 else 7 end) <= now()
    )
  );
revoke all on public.sendable_messages from public, anon, authenticated;

create or replace function public.can_manage_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.is_admin() or public.is_trusted_backend()
      or p_client_id = public.current_client_id()
      or p_client_id = public.impersonating_client_id();
$$;
revoke execute on function public.can_manage_client(uuid) from public, anon;
grant execute on function public.can_manage_client(uuid) to authenticated;

-- How many prospects and emails an approval would cover, before the client confirms.
create or replace function public.sequence_approval_preview(p_client_id uuid, p_prospect_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.can_manage_client(p_client_id) then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  return (
    select jsonb_build_object('ok', true,
      'prospects', count(distinct m.prospect_id),
      'emails', count(*),
      'by_step', coalesce(jsonb_object_agg(t.message_type, t.n) filter (where t.message_type is not null), '{}'::jsonb))
    from (select m.*, 1 from public.messages m) m
    join public.prospects p on p.id = m.prospect_id
    left join lateral (select m.message_type, count(*) n) t on false
    where m.client_id = p_client_id and m.approval_status = 'pending' and m.send_status = 'not_sent'
      and coalesce(p.is_sandbox, false) = false
      and (p_prospect_ids is null or m.prospect_id = any (p_prospect_ids)));
end; $$;
revoke execute on function public.sequence_approval_preview(uuid, uuid[]) from public, anon;
grant execute on function public.sequence_approval_preview(uuid, uuid[]) to authenticated;