-- Send queue: review, edit, move back to pending, or cancel emails that are approved but not sent.
--
-- Why: approved emails wait in the queue (daily cap, warm-up, follow-up dates) and until now
-- nobody could open them again. TUTEL follow-ups with off-topic copy could only be rejected.
--
-- 1. send_queue(): one page of approved, unsent emails with the estimated send time
--    (approvals_schedule, the same estimate Approvals shows), filterable by client (admin),
--    campaign, send window (today / tomorrow / later / not scheduled) and email type.
--    A client never sees emails held by the shared/personal-address rules, as in approved_queue.
-- 2. edit_queued_message(): change subject/body and keep the approval.
--    unapprove_queued_messages(): back to Pending. cancel_queued_messages(): rejected (manual),
--    which, as every reject does, also cancels that prospect's remaining follow-ups.
--    All three lock the row and refuse once the sender has claimed it (send_claimed_at set):
--    from that moment the email is being handed to Gmail and can no longer be changed.
--    Impersonation (view as client) is read-only here, as it is for the messages table.
-- 3. claim_message_for_send() now only claims an email that is still approved, and returns the
--    subject and body it claimed. WF3 sends that copy, so an edit or cancellation made at any
--    point before the claim is what goes out (or does not), even inside today's cap window.

alter table public.messages
  add column if not exists queue_edited_at timestamptz,
  add column if not exists queue_edited_by uuid;

comment on column public.messages.queue_edited_at is 'Last time the copy was edited after approval, in the send queue.';
comment on column public.messages.queue_edited_by is 'Who made that edit (auth user id).';

-- Who may change a queued email: an admin (not impersonating), the client's own users, or the backend.
-- View-as-client (impersonation) is deliberately not included: it is read-only.
create or replace function public.can_edit_client_messages(p_client_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    public.is_admin()
    or public.is_trusted_backend()
    or (p_client_id is not null and p_client_id = public.current_client_id()),
    false);
$function$;
revoke all on function public.can_edit_client_messages(uuid) from public, anon;
grant execute on function public.can_edit_client_messages(uuid) to authenticated, service_role;

-- ── 1. The queue ─────────────────────────────────────────────────────────────────────────────
create or replace function public.send_queue(
  p_client_id uuid default null,
  p_campaign_id uuid default null,
  p_window text default 'all',
  p_message_type text default null,
  p_sort text default 'send_asc',
  p_limit integer default 25,
  p_offset integer default 0)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_admin boolean := public.is_admin();
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  -- All clients at once is for admins only; one client for anyone who may see it.
  if p_client_id is null then
    if not v_admin then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  elsif not public.can_manage_client(p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if coalesce(p_window, 'all') not in ('all', 'today', 'tomorrow', 'later', 'unscheduled') then
    return jsonb_build_object('ok', false, 'error', 'bad_window');
  end if;
  if coalesce(p_sort, 'send_asc') not in ('send_asc', 'send_desc', 'approved_desc', 'prospect_asc') then
    return jsonb_build_object('ok', false, 'error', 'bad_sort');
  end if;

  with base as (
    select m.id, m.client_id, m.prospect_id, m.campaign_id, m.channel, m.subject, m.body, m.message_type,
           m.approved_at, m.approved_by, m.created_at, m.angle, m.observation, m.observation_source_url,
           m.queue_edited_at, (m.send_claimed_at is not null) as sending,
           cl.business_name as client_name,
           coalesce(nullif(cl.send_timezone, ''), 'America/Chicago') as tz,
           cl.representative_name,
           c.name as campaign_name, c.status as campaign_status,
           p.business_name, p.contact_name, p.email, p.phone, p.category, p.location,
           r.reason,
           public.is_send_rule_held(p.email, m.campaign_id, m.client_id) as policy_held
      from public.messages m
      join public.prospects p on p.id = m.prospect_id
      join public.clients cl on cl.id = m.client_id
      left join public.campaigns c on c.id = m.campaign_id
      left join public.message_block_reasons r on r.message_id = m.id
     where (p_client_id is null or m.client_id = p_client_id)
       and m.approval_status = 'approved' and m.send_status = 'not_sent'
  ),
  visible as (select * from base where v_admin or not policy_held),
  sched as (
    select s.message_id, s.estimated_send_at, s.is_confirmed, s.basis
      from (select distinct client_id from visible) vc
      cross join lateral public.approvals_schedule(vc.client_id) s
  ),
  enriched as (
    select v.*, s.estimated_send_at, coalesce(s.is_confirmed, false) as is_confirmed, s.basis,
           case when v.reason is null then 'sendable'
                when v.reason in ('waiting_followup_timing', 'not_a_send_day') then 'scheduled'
                else 'blocked' end as cat,
           case when v.sending then 'today'
                when s.estimated_send_at is null then 'unscheduled'
                when (s.estimated_send_at at time zone v.tz)::date <= (now() at time zone v.tz)::date then 'today'
                when (s.estimated_send_at at time zone v.tz)::date = (now() at time zone v.tz)::date + 1 then 'tomorrow'
                else 'later' end as send_window
      from visible v left join sched s on s.message_id = v.id
  ),
  scoped as (
    select * from enriched e
     where (p_campaign_id is null or e.campaign_id = p_campaign_id)
       and (p_message_type is null or e.message_type = p_message_type)
  ),
  filtered as (
    select * from scoped where coalesce(p_window, 'all') = 'all' or send_window = p_window
  ),
  numbered as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'send_asc'  then f.sending end desc nulls last,
        case when p_sort = 'send_asc'  then f.estimated_send_at end asc nulls last,
        case when p_sort = 'send_desc' then f.estimated_send_at end desc nulls last,
        case when p_sort = 'approved_desc' then f.approved_at end desc,
        case when p_sort = 'prospect_asc'  then lower(f.business_name) end asc,
        f.approved_at, f.id) as rn
      from filtered f
  )
  select jsonb_build_object(
    'ok', true,
    'is_admin', v_admin,
    'total', (select count(*) from filtered),
    -- Window counts respect the client/campaign/type filters but not the window itself,
    -- so the window chips can show how many each one holds.
    'windows', jsonb_build_object(
      'all',         (select count(*) from scoped),
      'today',       (select count(*) from scoped where send_window = 'today'),
      'tomorrow',    (select count(*) from scoped where send_window = 'tomorrow'),
      'later',       (select count(*) from scoped where send_window = 'later'),
      'unscheduled', (select count(*) from scoped where send_window = 'unscheduled')),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.campaign_id, 'name', x.campaign_name,
                                          'client_id', x.client_id, 'count', x.n) order by x.n desc, x.campaign_name)
        from (select campaign_id, campaign_name, client_id, count(*) as n
                from enriched where campaign_id is not null
               group by campaign_id, campaign_name, client_id) x), '[]'::jsonb),
    'clients', case when p_client_id is null then coalesce((
      select jsonb_agg(jsonb_build_object('id', x.client_id, 'name', x.client_name, 'count', x.n) order by x.n desc, x.client_name)
        from (select client_id, client_name, count(*) as n from enriched group by client_id, client_name) x), '[]'::jsonb)
      else '[]'::jsonb end,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'client_id', n.client_id, 'client_name', n.client_name, 'time_zone', n.tz,
        'prospect_id', n.prospect_id, 'campaign_id', n.campaign_id, 'campaign_name', n.campaign_name,
        'campaign_status', n.campaign_status,
        'channel', n.channel, 'subject', n.subject, 'body', n.body, 'message_type', n.message_type,
        'approval_status', 'approved', 'approved_at', n.approved_at, 'created_at', n.created_at,
        'angle', n.angle, 'observation', n.observation, 'observation_source_url', n.observation_source_url,
        'queue_edited_at', n.queue_edited_at, 'sending', n.sending,
        'block_reason', n.reason, 'policy_held', n.policy_held, 'category', n.cat,
        'estimated_send_at', n.estimated_send_at, 'is_confirmed', n.is_confirmed, 'basis', n.basis,
        'send_window', n.send_window,
        'sign_off_missing_name', not public.sign_off_has_name(n.body, n.representative_name),
        'prospect', jsonb_build_object(
          'id', n.prospect_id, 'business_name', n.business_name, 'contact_name', n.contact_name,
          'email', n.email, 'phone', n.phone, 'category', n.category, 'location', n.location)
      ) order by n.rn)
      from numbered n where n.rn > v_offset and n.rn <= v_offset + v_limit), '[]'::jsonb)
  ) into v_result;

  return v_result;
end; $function$;
revoke all on function public.send_queue(uuid, uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.send_queue(uuid, uuid, text, text, text, integer, integer) to authenticated, service_role;

-- ── 2. Actions ───────────────────────────────────────────────────────────────────────────────
-- Why a queued email cannot be changed, or null when it can. Expects the row locked.
create or replace function public.queued_message_lock_state(p_message_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare m record;
begin
  select id, client_id, approval_status, send_status, send_claimed_at into m
    from public.messages where id = p_message_id for update;
  if not found then return 'not_found'; end if;
  if not public.can_edit_client_messages(m.client_id) then return 'not_permitted'; end if;
  if m.send_status = 'sent' then return 'already_sent'; end if;
  if m.send_claimed_at is not null then return 'sending'; end if;
  if m.approval_status <> 'approved' or m.send_status <> 'not_sent' then return 'not_queued'; end if;
  return null;
end; $function$;
revoke all on function public.queued_message_lock_state(uuid) from public, anon, authenticated;
grant execute on function public.queued_message_lock_state(uuid) to service_role;

create or replace function public.edit_queued_message(p_message_id uuid, p_subject text default null, p_body text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_state text; v_row record;
begin
  if p_subject is null and p_body is null then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save');
  end if;
  if p_body is not null and btrim(p_body) = '' then
    return jsonb_build_object('ok', false, 'error', 'empty_body');
  end if;
  v_state := public.queued_message_lock_state(p_message_id);
  if v_state is not null then return jsonb_build_object('ok', false, 'error', v_state); end if;

  update public.messages
     set subject = coalesce(p_subject, subject),
         body = coalesce(p_body, body),
         queue_edited_at = now(),
         queue_edited_by = auth.uid(),
         updated_at = now()
   where id = p_message_id
  returning id, subject, body, queue_edited_at into v_row;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'subject', v_row.subject, 'body', v_row.body,
                            'queue_edited_at', v_row.queue_edited_at);
end; $function$;
revoke all on function public.edit_queued_message(uuid, text, text) from public, anon;
grant execute on function public.edit_queued_message(uuid, text, text) to authenticated, service_role;

-- Shared by unapprove and cancel: applies p_action to each id it may change, and reports
-- how many were changed and why the rest were not.
create or replace function public.queued_messages_action(p_ids uuid[], p_action text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid; v_state text; v_done int := 0;
  v_skipped jsonb := '{}'::jsonb; v_changed uuid[] := '{}';
begin
  if p_action not in ('unapprove', 'cancel') then
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', true, 'done', 0, 'requested', 0, 'skipped', '{}'::jsonb, 'ids', '[]'::jsonb);
  end if;
  if array_length(p_ids, 1) > 500 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  -- Fixed order, so two people acting on overlapping selections cannot deadlock.
  for v_id in select distinct u from unnest(p_ids) u order by u loop
    v_state := public.queued_message_lock_state(v_id);
    if v_state is not null then
      v_skipped := jsonb_set(v_skipped, array[v_state], to_jsonb(coalesce((v_skipped ->> v_state)::int, 0) + 1));
      continue;
    end if;
    if p_action = 'unapprove' then
      update public.messages
         set approval_status = 'pending', approved_at = null, approved_by = null, updated_at = now()
       where id = v_id;
    else
      update public.messages
         set approval_status = 'rejected', reject_reason = 'manual', updated_at = now()
       where id = v_id;
    end if;
    v_done := v_done + 1;
    v_changed := v_changed || v_id;
  end loop;

  return jsonb_build_object('ok', true, 'done', v_done, 'requested', array_length(p_ids, 1),
                            'skipped', v_skipped, 'ids', to_jsonb(v_changed));
end; $function$;
revoke all on function public.queued_messages_action(uuid[], text) from public, anon, authenticated;
grant execute on function public.queued_messages_action(uuid[], text) to service_role;

create or replace function public.unapprove_queued_messages(p_ids uuid[])
 returns jsonb
 language sql
 security definer
 set search_path to 'public'
as $function$ select public.queued_messages_action(p_ids, 'unapprove'); $function$;
revoke all on function public.unapprove_queued_messages(uuid[]) from public, anon;
grant execute on function public.unapprove_queued_messages(uuid[]) to authenticated, service_role;

create or replace function public.cancel_queued_messages(p_ids uuid[])
 returns jsonb
 language sql
 security definer
 set search_path to 'public'
as $function$ select public.queued_messages_action(p_ids, 'cancel'); $function$;
revoke all on function public.cancel_queued_messages(uuid[]) from public, anon;
grant execute on function public.cancel_queued_messages(uuid[]) to authenticated, service_role;

-- ── 3. The send claim honours the queue ──────────────────────────────────────────────────────
-- Same claim as before, plus: the email must still be approved, and the claimed copy is returned.
-- The claim and the edit/unapprove/cancel functions above take the same row lock, so whichever
-- comes second sees the first one's result: an edit before the claim is sent, an edit after it
-- is refused ('sending').
create or replace function public.claim_message_for_send(p_message_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid; v_subject text; v_body text;
begin
  update messages
     set send_claimed_at = now(), updated_at = now()
   where id = p_message_id
     and send_claimed_at is null
     and send_status <> 'sent'
     and approval_status = 'approved'
  returning id, subject, body into v_id, v_subject, v_body;
  return jsonb_build_object('claimed', v_id is not null, 'subject', v_subject, 'body', v_body);
end;
$function$;
revoke all on function public.claim_message_for_send(uuid) from public, anon, authenticated;
grant execute on function public.claim_message_for_send(uuid) to service_role;
