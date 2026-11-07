-- Holidays and countries in the send rules (regression-test plan issues 5 and 7).
--
-- 7. First emails could go out on a public holiday: WF2.5's window checks Mon-Fri 9-17 only and
--    the send gate only counted holidays for follow-up intervals. The gate now also requires
--    today to be a business day in the email's send country (campaign country, else client
--    country, else US), in the client's time zone, on the sandbox clock for sandboxes; a sandbox
--    in fast testing mode is exempt, as it is from the send window. WF2.5 reads the gate, so no
--    n8n change is needed. Approvals shows these as Scheduled (reason not_a_send_day).
-- 5. approvals_schedule counted holidays by the client's country while the gate and the stored
--    follow-up due date use the campaign's country first, so Approvals could show a date the
--    gate would not send on (live: US campaigns of a CZ client). It now uses the same country
--    per email, and treats "waiting for a business day / follow-up date" as not held.

create or replace function public.send_country(p_campaign_id uuid, p_client_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select upper(coalesce(nullif((select c.country from public.campaigns c where c.id = p_campaign_id), ''),
                        nullif((select cl.country from public.clients cl where cl.id = p_client_id), ''),
                        'US'));
$function$;
revoke all on function public.send_country(uuid, uuid) from public, anon;
grant execute on function public.send_country(uuid, uuid) to authenticated, service_role;

create or replace function public.is_send_day(p_client_id uuid, p_campaign_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select (cl.is_sandbox and not cl.sandbox_warmup)
        or public.is_business_day(
             ((now() + public.sandbox_clock_offset(cl.id)) at time zone coalesce(nullif(cl.send_timezone, ''), 'America/Chicago'))::date,
             public.send_country(p_campaign_id, p_client_id))
      from public.clients cl where cl.id = p_client_id), true);
$function$;
revoke all on function public.is_send_day(uuid, uuid) from public, anon;
grant execute on function public.is_send_day(uuid, uuid) to authenticated, service_role;

do $mig$
declare d text := rtrim(pg_get_viewdef('public.sendable_messages'), E'; \n');
begin
  if position('is_send_day' in d) > 0 then raise exception 'sendable_messages: already applied'; end if;
  execute 'create or replace view public.sendable_messages as ' || d
    || ' AND is_send_day(m.client_id, m.campaign_id)';
end $mig$;

do $mig$
declare d text := rtrim(pg_get_viewdef('public.message_block_reasons'), E'; \n');
  a text := 'ELSE ''waiting_followup_timing''::text';
begin
  if position(a in d) = 0 then raise exception 'message_block_reasons: anchor not found'; end if;
  d := replace(d, a, 'WHEN (NOT is_send_day(m.client_id, m.campaign_id)) THEN ''not_a_send_day''::text ' || a);
  execute 'create or replace view public.message_block_reasons as ' || d;
end $mig$;

do $mig$
declare d text := pg_get_functiondef('public.approved_queue(uuid,text,text,text,text,integer,integer)'::regprocedure);
  a text := 'when r.reason = ''waiting_followup_timing'' then ''scheduled''';
begin
  if position(a in d) = 0 then raise exception 'approved_queue: anchor not found'; end if;
  execute replace(d, a, 'when r.reason in (''waiting_followup_timing'', ''not_a_send_day'') then ''scheduled''');
end $mig$;

create or replace function public.approvals_schedule(p_client_id uuid)
 RETURNS TABLE(message_id uuid, prospect_id uuid, message_type text, step_label text, approval_status text, pending_since timestamp with time zone, estimated_send_at timestamp with time zone, is_confirmed boolean, basis text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- The mailbox's timeline counts weekdays; each email is then moved off its own send
  -- country's holidays (campaign country first, as the send gate does).
  if v_cap > 0 and (extract(isodow from v_day) > 5 or v_now_local::time >= time '17:00' or v_used >= v_cap) then
    v_day := v_day + 1;
    while extract(isodow from v_day) > 5 loop v_day := v_day + 1; end loop;
    v_used := 0;
  end if;
  v_first_day := v_day;

  -- Pass 1: first touches, in the same order the sender uses (approved first, oldest first), spread by daily cap.
  for r in
    select m.id, m.prospect_id, m.approval_status, coalesce(m.pending_since, m.created_at) as ps,
           p.pipeline_status, p.sequence_paused,
           public.send_country(m.campaign_id, m.client_id) as ctry,
           -- Held = blocked by a rule; waiting for a business day or a follow-up date is not held.
           (m.approval_status = 'approved' and exists (select 1 from public.message_block_reasons b
              where b.message_id = m.id and b.reason not in ('waiting_followup_timing', 'not_a_send_day'))) as held
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
        while extract(isodow from v_day) > 5 loop v_day := v_day + 1; end loop;
        v_used := 0;
      end if;
      v_slot := (v_day + time '09:00') + (v_used * 480.0 / v_cap) * interval '1 minute';
      if v_day = v_now_local::date and v_slot < v_now_local then v_slot := v_now_local; end if;
      while not public.is_business_day(v_slot::date, r.ctry) loop v_slot := (v_slot::date + 1) + time '09:00'; end loop;
      v_est := v_slot at time zone v_tz;
      v_used := v_used + 1;
      v_map := v_map || jsonb_build_object(r.prospect_id::text || ':initial', v_est);
      return query select r.id, r.prospect_id, 'initial'::text, 'First Touch'::text, r.approval_status, r.ps, v_est,
                          (r.approval_status = 'approved' and v_slot::date = v_first_day), 'queue_position_and_daily_cap'::text;
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
             public.send_country(m.campaign_id, m.client_id) as ctry,
             (m.approval_status = 'approved' and exists (select 1 from public.message_block_reasons b
                where b.message_id = m.id and b.reason not in ('waiting_followup_timing', 'not_a_send_day'))) as held
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

      v_est := public.add_business_days(v_base, v_gap, v_tz, r.ctry);
      v_local := v_est at time zone v_tz;
      if v_local::time < time '09:00' then v_local := v_local::date + time '09:00';
      elsif v_local::time >= time '17:00' then v_local := (v_local::date + 1) + time '09:00'; end if;
      while not public.is_business_day(v_local::date, r.ctry) loop v_local := (v_local::date + 1) + time '09:00'; end loop;
      v_est := v_local at time zone v_tz;
      v_map := v_map || jsonb_build_object(r.prospect_id::text || ':' || v_type, v_est);

      return query select r.id, r.prospect_id, v_type, v_label, r.approval_status, r.ps, v_est, v_conf, v_basis;
    end loop;
  end loop;
end;
$function$
;