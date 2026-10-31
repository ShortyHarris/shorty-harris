create or replace function public.approvals_schedule(p_client_id uuid)
returns table(
  message_id uuid, prospect_id uuid, message_type text, step_label text, approval_status text,
  pending_since timestamptz, estimated_send_at timestamptz, is_confirmed boolean, basis text)
language plpgsql stable security definer set search_path to 'public' as $fn$
#variable_conflict use_column
declare
  v_tz text; v_ctry text; v_cap int; v_sent_today int; v_now_local timestamp;
  v_day date; v_used int; v_first_day date; v_slot timestamp;
  r record; v_map jsonb := '{}'::jsonb;
  v_type text; v_prev_type text; v_gap int; v_label text;
  v_prev_sent timestamptz; v_base timestamptz; v_est timestamptz; v_local timestamp;
  v_conf boolean; v_basis text; v_stopped boolean;
  v_terminal text[] := array['replied','hot_lead','won','lost','called','bounced'];
begin
  if not public.can_manage_client(p_client_id) then return; end if;

  select coalesce(nullif(c.send_timezone,''),'America/Chicago'), upper(coalesce(nullif(c.country,''),'US'))
    into v_tz, v_ctry from public.clients c where c.id = p_client_id;
  if v_tz is null then return; end if;

  v_cap := coalesce(public.mailbox_daily_cap(p_client_id), 40);
  v_now_local := now() at time zone v_tz;
  select count(*) into v_sent_today from public.messages m
   where m.client_id = p_client_id and m.send_status = 'sent'
     and (m.sent_at at time zone v_tz)::date = v_now_local::date;

  -- First slot: today if still inside the 9-17 window with capacity left, otherwise the next business day.
  v_day := v_now_local::date; v_used := v_sent_today;
  if v_cap > 0 and (not public.is_business_day(v_day, v_ctry) or v_now_local::time >= time '17:00' or v_used >= v_cap) then
    v_day := v_day + 1;
    while not public.is_business_day(v_day, v_ctry) loop v_day := v_day + 1; end loop;
    v_used := 0;
  end if;
  v_first_day := v_day;

  -- Pass 1: first touches, in the same order the sender uses (approved first, oldest first), spread by daily cap.
  for r in
    select m.id, m.prospect_id, m.approval_status, coalesce(m.pending_since, m.created_at) as ps,
           p.pipeline_status, p.sequence_paused,
           (m.approval_status = 'approved' and not exists (select 1 from public.sendable_messages s where s.id = m.id)) as held
      from public.messages m join public.prospects p on p.id = m.prospect_id
     where m.client_id = p_client_id and m.message_type = 'initial' and m.send_status = 'not_sent'
       and m.approval_status in ('approved','pending','edited')
     order by (m.approval_status = 'approved') desc, m.created_at, m.id
  loop
    if r.pipeline_status = any(v_terminal) or r.sequence_paused then
      return query select r.id, r.prospect_id, 'initial'::text, 'First Touch'::text, r.approval_status, r.ps, null::timestamptz, false, 'prospect_stopped'::text;
    elsif r.held then
      return query select r.id, r.prospect_id, 'initial'::text, 'First Touch'::text, r.approval_status, r.ps, null::timestamptz, false, 'held_by_send_rules'::text;
    elsif v_cap <= 0 then
      return query select r.id, r.prospect_id, 'initial'::text, 'First Touch'::text, r.approval_status, r.ps, null::timestamptz, false, 'mailbox_paused'::text;
    else
      if v_used >= v_cap then
        v_day := v_day + 1;
        while not public.is_business_day(v_day, v_ctry) loop v_day := v_day + 1; end loop;
        v_used := 0;
      end if;
      v_slot := (v_day + time '09:00') + (v_used * 480.0 / v_cap) * interval '1 minute';
      if v_day = v_now_local::date and v_slot < v_now_local then v_slot := v_now_local; end if;
      v_est := v_slot at time zone v_tz;
      v_used := v_used + 1;
      v_map := v_map || jsonb_build_object(r.prospect_id::text || ':initial', v_est);
      return query select r.id, r.prospect_id, 'initial'::text, 'First Touch'::text, r.approval_status, r.ps, v_est,
                          (r.approval_status = 'approved' and v_day = v_first_day), 'queue_position_and_daily_cap'::text;
    end if;
  end loop;

  -- Pass 2: follow-ups, each anchored to the previous email's real send time, or to its estimate if unsent.
  foreach v_type in array array['follow_up_d3','follow_up_d7','follow_up_d14'] loop
    v_prev_type := case v_type when 'follow_up_d3' then 'initial' when 'follow_up_d7' then 'follow_up_d3' else 'follow_up_d7' end;
    v_gap := case v_type when 'follow_up_d3' then 3 when 'follow_up_d7' then 5 else 7 end;
    v_label := case v_type when 'follow_up_d3' then 'Follow-Up 1' when 'follow_up_d7' then 'Follow-Up 2' else 'Follow-Up 3' end;

    for r in
      select m.id, m.prospect_id, m.approval_status, coalesce(m.pending_since, m.created_at) as ps,
             p.pipeline_status, p.sequence_paused, p.followups_stopped,
             (m.approval_status = 'approved' and not exists (select 1 from public.sendable_messages s where s.id = m.id)
               and exists (select 1 from public.messages x where x.prospect_id = m.prospect_id and x.message_type = v_prev_type and x.send_status = 'sent'
                           and public.add_business_days(x.sent_at, v_gap, v_tz, v_ctry) <= now())) as held
        from public.messages m join public.prospects p on p.id = m.prospect_id
       where m.client_id = p_client_id and m.message_type = v_type and m.send_status = 'not_sent'
         and m.approval_status in ('approved','pending','edited')
       order by m.created_at, m.id
    loop
      v_stopped := r.pipeline_status = any(v_terminal) or r.sequence_paused or r.followups_stopped;
      if v_stopped then
        return query select r.id, r.prospect_id, v_type, v_label, r.approval_status, r.ps, null::timestamptz, false, 'prospect_stopped'::text;
        continue;
      end if;
      if r.held then
        return query select r.id, r.prospect_id, v_type, v_label, r.approval_status, r.ps, null::timestamptz, false, 'held_by_send_rules'::text;
        continue;
      end if;

      select max(x.sent_at) into v_prev_sent from public.messages x
       where x.prospect_id = r.prospect_id and x.message_type = v_prev_type and x.send_status = 'sent';

      v_base := null; v_conf := false; v_basis := null;
      if v_prev_sent is not null then
        v_base := v_prev_sent; v_conf := (r.approval_status = 'approved'); v_basis := 'previous_email_sent';
      elsif v_map ? (r.prospect_id::text || ':' || v_prev_type) then
        v_base := (v_map ->> (r.prospect_id::text || ':' || v_prev_type))::timestamptz; v_basis := 'depends_on_unsent_email';
      end if;

      if v_base is null then
        return query select r.id, r.prospect_id, v_type, v_label, r.approval_status, r.ps, null::timestamptz, false, 'previous_step_missing'::text;
        continue;
      end if;

      v_est := public.add_business_days(v_base, v_gap, v_tz, v_ctry);
      v_local := v_est at time zone v_tz;
      if v_local::time < time '09:00' then v_local := v_local::date + time '09:00';
      elsif v_local::time >= time '17:00' then v_local := (v_local::date + 1) + time '09:00'; end if;
      while not public.is_business_day(v_local::date, v_ctry) loop v_local := (v_local::date + 1) + time '09:00'; end loop;
      v_est := v_local at time zone v_tz;
      v_map := v_map || jsonb_build_object(r.prospect_id::text || ':' || v_type, v_est);

      return query select r.id, r.prospect_id, v_type, v_label, r.approval_status, r.ps, v_est, v_conf, v_basis;
    end loop;
  end loop;
end;
$fn$;

revoke all on function public.approvals_schedule(uuid) from public, anon;
grant execute on function public.approvals_schedule(uuid) to authenticated, service_role;

comment on function public.approvals_schedule(uuid) is 'Per-message estimated send time for the Approvals page. is_confirmed is true only when the time follows from real data (a follow-up whose previous email was actually sent, or a first touch in the very next send slot). Follow-up dates ignore the daily cap, so they are earliest eligible times, not guarantees. Overdue = estimated_send_at < now().'