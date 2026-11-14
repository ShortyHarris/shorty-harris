-- approvals_schedule took ~3.2 s for TUTEL (260 unsent drafts) with the database idle, and past
-- the 8 s statement timeout under load (13 Nov 2026). Profiled with track_functions: only 0.24 s
-- was its own code. The rest was helpers called thousands of times:
--   is_send_day 6,075 calls 1.96 s, can_manage_client 3,244 calls 0.73 s,
--   send_country 6,335 calls 0.65 s, is_business_day 7,489 calls 0.57 s.
--
-- Cause 1 (also slows approved_queue): message_block_reasons excludes sendable rows with
--   NOT EXISTS (SELECT 1 FROM sendable_messages s WHERE s.id = m.id)
-- The caller's client filter never reaches inside sendable_messages, so every call worked out
-- sendability for every approved unsent draft on the platform (825 rows, each calling
-- is_send_day, client_mailbox_ready and, for follow-ups, add_business_days). Also matching on
-- client_id lets the planner push the filter in: 699 ms -> 149 ms for TUTEL. The result is
-- unchanged, since s.id = m.id is the same row and therefore the same client.
--
-- Cause 2: approvals_schedule checked "held" with a per-row EXISTS on the view keyed only by
-- message_id, and called send_country() per row. It now reads the client's held ids from the
-- view once, and takes the send country from a join. Output is unchanged.

create or replace view public.message_block_reasons as
 SELECT m.id AS message_id,
    m.client_id,
    m.prospect_id,
    m.campaign_id,
        CASE
            WHEN NOT COALESCE(( SELECT ps.unsubscribe_ok
               FROM platform_settings ps
              WHERE ps.id = 1), true) THEN 'unsubscribe_unhealthy'::text
            WHEN p.pipeline_status = ANY (ARRAY['replied'::text, 'hot_lead'::text, 'won'::text, 'lost'::text, 'called'::text, 'bounced'::text]) THEN 'prospect_status'::text
            WHEN p.sequence_paused THEN 'sequence_paused'::text
            WHEN m.message_type <> 'initial'::text AND p.followups_stopped THEN 'followups_stopped'::text
            WHEN COALESCE(c.status, 'active'::text) = ANY (ARRAY['paused'::text, 'cancelled'::text, 'draft'::text]) THEN 'campaign_inactive'::text
            WHEN (EXISTS ( SELECT 1
               FROM do_not_contact d
              WHERE lower(d.email) = lower(p.email))) THEN 'do_not_contact'::text
            WHEN (COALESCE(c.language, ''::text) = 'Czech'::text OR is_eu_country(COALESCE(c.country, cl.country))) AND is_freemail(p.email) THEN 'freemail_address'::text
            WHEN (COALESCE(c.language, ''::text) = 'Czech'::text OR is_eu_country(COALESCE(c.country, cl.country))) AND is_generic_mailbox(p.email) AND NOT COALESCE(cl.allow_generic_mailboxes, false) THEN 'generic_mailbox'::text
            WHEN (EXISTS ( SELECT 1
               FROM country_send_holds h
              WHERE h.cleared = false AND h.country = upper(COALESCE(c.country, cl.country, ''::text)))) THEN 'country_hold'::text
            WHEN NOT client_mailbox_ready(m.client_id) THEN 'no_gmail'::text
            WHEN m.send_retry_at > now() THEN 'retrying_send'::text
            WHEN NOT is_send_day(m.client_id, m.campaign_id) THEN 'not_a_send_day'::text
            ELSE 'waiting_followup_timing'::text
        END AS reason
   FROM messages m
     JOIN prospects p ON p.id = m.prospect_id
     LEFT JOIN campaigns c ON c.id = m.campaign_id
     LEFT JOIN clients cl ON cl.id = m.client_id
  WHERE m.approval_status = 'approved'::text AND m.send_status = 'not_sent'::text AND NOT (EXISTS ( SELECT 1
           FROM sendable_messages s
          -- client_id: lets a caller's client filter reach sendable_messages (see header).
          WHERE s.id = m.id AND s.client_id = m.client_id)) AND can_manage_client(m.client_id);

CREATE OR REPLACE FUNCTION public.approvals_schedule(p_client_id uuid)
 RETURNS TABLE(message_id uuid, prospect_id uuid, message_type text, step_label text, approval_status text, pending_since timestamp with time zone, estimated_send_at timestamp with time zone, is_confirmed boolean, basis text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_tz text; v_ctry text; v_client_ctry text; v_cap int; v_sent_today int; v_now_local timestamp;
  v_day date; v_used int; v_first_day date; v_slot timestamp;
  r record; v_map jsonb := '{}'::jsonb;
  v_type text; v_prev_type text; v_gap int; v_label text;
  v_prev_sent timestamptz; v_base timestamptz; v_est timestamptz; v_local timestamp;
  v_conf boolean; v_basis text; v_stopped boolean;
  v_terminal text[] := array['replied','hot_lead','won','lost','called','bounced'];
  v_held uuid[];
begin
  if not public.can_manage_client(p_client_id) then return; end if;

  select coalesce(nullif(c.send_timezone,''),'America/Chicago'), upper(coalesce(nullif(c.country,''),'US')), nullif(c.country,'')
    into v_tz, v_ctry, v_client_ctry from public.clients c where c.id = p_client_id;
  if v_tz is null then return; end if;

  -- Held = blocked by a rule; waiting for a business day or a follow-up date is not held.
  -- Read once for this client (the view is client-scoped), instead of once per row.
  v_held := array(select b.message_id from public.message_block_reasons b
                   where b.client_id = p_client_id
                     and b.reason not in ('waiting_followup_timing', 'not_a_send_day'));

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
           -- Same as send_country(m.campaign_id, m.client_id), without a call per row.
           upper(coalesce(nullif(ca.country, ''), v_client_ctry, 'US')) as ctry,
           (m.approval_status = 'approved' and m.id = any(v_held)) as held
      from public.messages m join public.prospects p on p.id = m.prospect_id
      left join public.campaigns ca on ca.id = m.campaign_id
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
             upper(coalesce(nullif(ca.country, ''), v_client_ctry, 'US')) as ctry,
             (m.approval_status = 'approved' and m.id = any(v_held)) as held
        from public.messages m join public.prospects p on p.id = m.prospect_id
        left join public.campaigns ca on ca.id = m.campaign_id
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
$function$;
