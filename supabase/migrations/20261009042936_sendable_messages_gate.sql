create or replace function public.add_business_days(p_start timestamptz, p_days integer)
returns timestamptz language plpgsql stable set search_path to 'public' as $$
declare d timestamptz := p_start; left_days integer := p_days; local_d date;
begin
  while left_days > 0 loop
    d := d + interval '1 day';
    local_d := (d at time zone 'America/Denver')::date;
    if extract(isodow from local_d) < 6
       and not exists (select 1 from public.holidays h where h.holiday_date = local_d) then
      left_days := left_days - 1;
    end if;
  end loop;
  return d;
end; $$;
revoke execute on function public.add_business_days(timestamptz, integer) from public, anon, authenticated;

-- What the sender may pick up: approved, unsent, and (for follow-ups) the previous
-- step already sent and its business-day wait over. Prospects who replied, bounced
-- or were suppressed are excluded, so an approved follow-up can never go out to them.
create or replace view public.sendable_messages as
select m.*
from public.messages m
join public.prospects p on p.id = m.prospect_id
where m.approval_status = 'approved'
  and m.send_status = 'not_sent'
  and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
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