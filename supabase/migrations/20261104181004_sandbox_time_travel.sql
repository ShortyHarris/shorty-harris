-- Time travel for sandbox accounts, so cadence, follow-ups, approval reminders and
-- overdue approvals can be tested without waiting days.
--
-- sandbox_advance_time(client, days) moves the sandbox account's whole timeline
-- back by N days: every timestamptz column on its rows in the tables below. All
-- of production's own time rules then run unmodified against it: the 3/5/7
-- business-day gap in sendable_messages, WF5's due check, WF18 approval
-- reminders, and the recalculation that happens because WF3 schedules each next
-- follow-up from the actual send time. An unapproved draft simply becomes N days
-- overdue. Only status-change triggers exist on these tables, so shifting
-- timestamps cannot cancel, reject or block anything by itself.
--
-- This replaces two shortcuts that bypassed the rules instead of exercising them:
--  * sendable_messages no longer lets sandbox follow-ups skip the 3/5/7 rule;
--  * sandbox_next_step step 4 ("Skip to next follow-up") advances the clock to the
--    prospect's next follow-up due date instead of moving that one schedule.
--
-- Applied live as 20261104181004 (view and two functions as in-place edits); full
-- resulting definitions below.

alter table public.clients add column if not exists sandbox_days_advanced integer not null default 0;

create or replace function public.sandbox_advance_time(p_client_id uuid, p_days integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sandbox boolean;
  v_tbl text;
  v_set text;
  v_rows bigint;
  v_shifted bigint := 0;
  v_total integer;
  v_due integer;
  v_weekend boolean;
  v_tables text[] := array['messages','follow_up_schedules','replies','hot_leads','prospects',
                           'notifications','approval_reminder_log','credit_transactions',
                           'payments','campaigns','mailbox_events'];
begin
  select is_sandbox into v_sandbox from clients where id = p_client_id;
  if not coalesce(v_sandbox, false) then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_client');
  end if;
  if not (public.is_admin() or public.can_manage_client(p_client_id) or public.is_trusted_backend()) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if p_days is null or p_days < 1 or p_days > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_days', 'detail', 'Advance between 1 and 60 days.');
  end if;

  foreach v_tbl in array v_tables loop
    select string_agg(format('%I = %I - make_interval(days => %s)', c.column_name, c.column_name, p_days), ', ')
      into v_set
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = v_tbl
       and c.data_type = 'timestamp with time zone';
    if v_set is not null and exists (select 1 from information_schema.columns
                                      where table_schema = 'public' and table_name = v_tbl and column_name = 'client_id') then
      execute format('update public.%I set %s where client_id = $1', v_tbl, v_set) using p_client_id;
      get diagnostics v_rows = row_count;
      v_shifted := v_shifted + v_rows;
    end if;
  end loop;

  update clients set sandbox_days_advanced = sandbox_days_advanced + p_days
   where id = p_client_id returning sandbox_days_advanced into v_total;

  select count(*) into v_due from follow_up_schedules
   where client_id = p_client_id and status = 'pending' and due_at <= now();

  -- WF5 writes the due follow-ups. It only works on business days (real calendar),
  -- so on a weekend the drafts appear on Monday's run.
  perform public.sandbox_fire('wf5-run', jsonb_build_object('client_id', p_client_id));
  v_weekend := extract(isodow from now() at time zone 'America/Chicago') > 5;

  return jsonb_build_object('ok', true, 'days', p_days, 'total_days_advanced', v_total,
    'rows_shifted', v_shifted, 'follow_ups_due', v_due,
    'detail', 'Moved ' || p_days || ' day' || case when p_days = 1 then '' else 's' end || ' forward (' || v_total
           || ' in total). ' || case when v_due > 0
             then v_due || ' follow-up' || case when v_due = 1 then ' is' else 's are' end || ' now due'
                  || case when v_weekend then ': the follow-up engine only runs on business days, so the drafts appear on Monday.'
                          else ' and the follow-up engine was run. Drafts appear in Approvals shortly.' end
             else 'No follow-ups are due yet.' end);
end;
$function$;
revoke all on function public.sandbox_advance_time(uuid, integer) from public, anon;
grant execute on function public.sandbox_advance_time(uuid, integer) to authenticated, service_role;

create or replace view public.sendable_messages as
 SELECT m.id,
    m.prospect_id,
    m.campaign_id,
    m.client_id,
    m.channel,
    m.subject,
    m.body,
    m.message_type,
    m.approval_status,
    m.approved_by,
    m.approved_at,
    m.send_status,
    m.scheduled_for,
    m.sent_at,
    m.gmail_message_id,
    m.gmail_thread_id,
    m.created_at,
    m.updated_at,
    m.opened_at,
    m.open_count,
    m.last_opened_at,
    m.send_claimed_at
   FROM messages m
     JOIN prospects p ON p.id = m.prospect_id
     LEFT JOIN campaigns c ON c.id = m.campaign_id
     LEFT JOIN clients cl ON cl.id = m.client_id
  WHERE m.approval_status = 'approved'::text AND m.send_status = 'not_sent'::text AND COALESCE(( SELECT ps.unsubscribe_ok
           FROM platform_settings ps
          WHERE ps.id = 1), true) AND COALESCE(cl.status, 'active'::text) = 'active'::text AND sandbox_address_allowed(m.client_id, p.email) AND (p.pipeline_status <> ALL (ARRAY['replied'::text, 'hot_lead'::text, 'won'::text, 'lost'::text, 'called'::text, 'bounced'::text])) AND p.sequence_paused = false AND (m.message_type = 'initial'::text OR p.followups_stopped = false) AND (COALESCE(c.status, 'active'::text) <> ALL (ARRAY['paused'::text, 'cancelled'::text, 'draft'::text])) AND NOT (EXISTS ( SELECT 1
           FROM do_not_contact d
          WHERE lower(d.email) = lower(p.email))) AND NOT ((COALESCE(c.language, ''::text) = 'Czech'::text OR is_eu_country(COALESCE(c.country, cl.country))) AND (is_generic_mailbox(p.email) AND NOT COALESCE(cl.allow_generic_mailboxes, false) OR is_freemail(p.email))) AND NOT (EXISTS ( SELECT 1
           FROM country_send_holds h
          WHERE h.cleared = false AND h.country = upper(COALESCE(c.country, cl.country, ''::text)))) AND (m.message_type = 'initial'::text OR (EXISTS ( SELECT 1
           FROM messages prev
          WHERE prev.prospect_id = m.prospect_id AND prev.send_status = 'sent'::text AND prev.message_type =
                CASE m.message_type
                    WHEN 'follow_up_d3'::text THEN 'initial'::text
                    WHEN 'follow_up_d7'::text THEN 'follow_up_d3'::text
                    WHEN 'follow_up_d14'::text THEN 'follow_up_d7'::text
                    ELSE NULL::text
                END AND add_business_days(prev.sent_at,
                CASE m.message_type
                    WHEN 'follow_up_d3'::text THEN 3
                    WHEN 'follow_up_d7'::text THEN 5
                    ELSE 7
                END, COALESCE(cl.send_timezone, 'America/Chicago'::text), upper(COALESCE(NULLIF(c.country, ''::text), NULLIF(cl.country, ''::text), 'US'::text))) <= now())));

CREATE OR REPLACE FUNCTION public.sandbox_next_step(p_prospect_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client uuid;
  v_p record;
  v_msg record;
  v_sent record;
  v_due timestamptz;
begin
  v_client := public.sandbox_guard(p_prospect_id);
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_prospect_or_not_permitted');
  end if;

  select * into v_p from prospects where id = p_prospect_id;

  if v_p.pipeline_status in ('bounced','won','lost') then
    return jsonb_build_object('ok', false, 'error', 'finished',
      'detail', 'This prospect is ' || v_p.pipeline_status || '. Press Reset to start again.');
  end if;

  if v_p.pipeline_status in ('hot_lead', 'called') then
    return jsonb_build_object('ok', false, 'error', 'followups_stopped',
      'detail', case v_p.pipeline_status
        when 'hot_lead' then 'This prospect is a hot lead, so follow-ups stop automatically. In real use the client replies to them personally.'
        else 'This prospect was marked as called, so follow-ups stop.' end);
  end if;
  if exists (select 1 from do_not_contact where lower(email) = lower(v_p.email)) then
    return jsonb_build_object('ok', false, 'error', 'do_not_contact',
      'detail', 'This address is on the do-not-contact list, so every future email to it is blocked.');
  end if;
  if v_p.pipeline_status = 'replied' then
    return jsonb_build_object('ok', false, 'error', 'replied',
      'detail', 'They wrote back, so nothing more is sent automatically. In real use the client answers them personally.');
  end if;
  if v_p.followups_stopped and exists (select 1 from messages where prospect_id = p_prospect_id and send_status = 'sent') then
    return jsonb_build_object('ok', false, 'error', 'followups_stopped',
      'detail', 'Follow-ups are stopped for this prospect, for example after a not-interested reply.');
  end if;

  -- 1. Nothing written yet: ask WF2 for the first email.
  if not exists (select 1 from messages where prospect_id = p_prospect_id) then
    perform public.sandbox_fire('wf2-generate', jsonb_build_object('prospect_id', p_prospect_id));
    return jsonb_build_object('ok', true, 'did', 'generating_first_email',
      'detail', 'Gemini is writing the first email. It appears in Approvals in a few seconds.');
  end if;

  -- 2. A draft is waiting for approval: approve it.
  select id into v_msg from messages
  where prospect_id = p_prospect_id and approval_status = 'pending' and send_status = 'not_sent'
  order by created_at limit 1;
  if v_msg.id is not null then
    update messages set approval_status = 'approved', approved_at = now(), updated_at = now()
    where id = v_msg.id;
    return jsonb_build_object('ok', true, 'did', 'approved_draft', 'message_id', v_msg.id,
      'detail', 'Approved. Press again to send it.');
  end if;

  -- 3. Something is approved and unsent: send it through WF3, the real send path.
  select id into v_msg from messages
  where prospect_id = p_prospect_id and approval_status = 'approved' and send_status = 'not_sent'
  order by created_at limit 1;
  if v_msg.id is not null then
    perform public.sandbox_fire('wf3-send-outreach', jsonb_build_object('message_id', v_msg.id));
    return jsonb_build_object('ok', true, 'did', 'sending', 'message_id', v_msg.id,
      'detail', 'Sending now. It lands in the mailbox connected to this sandbox.');
  end if;

  -- 4. Everything sent: make the next follow-up due and run the engine.
  select id, sent_at into v_sent from messages
  where prospect_id = p_prospect_id and send_status = 'sent'
  order by sent_at desc limit 1;
  if v_sent.id is not null then
    -- Advance the whole sandbox clock to this prospect's next follow-up due date, so
    -- the real 3/5/7 business-day rule, WF5 and the reminders all run unmodified.
    select due_at into v_due from follow_up_schedules
     where prospect_id = p_prospect_id and status = 'pending' order by due_at limit 1;
    if v_due is null then
      return jsonb_build_object('ok', false, 'error', 'no_follow_up_scheduled',
        'detail', 'No follow-up is scheduled for this prospect. Its sequence may be finished.');
    end if;
    if v_due <= now() then
      perform public.sandbox_fire('wf5-run', jsonb_build_object('prospect_id', p_prospect_id));
      return jsonb_build_object('ok', true, 'did', 'follow_up_due',
        'detail', 'The follow-up is already due; the follow-up engine was run. The draft appears in Approvals shortly.');
    end if;
    return public.sandbox_advance_time(v_client, greatest(1, ceil(extract(epoch from (v_due - now())) / 86400.0)::int));
  end if;

  return jsonb_build_object('ok', false, 'error', 'nothing_to_do');
end;
$function$;

CREATE OR REPLACE FUNCTION public.sandbox_reset(p_client_id uuid, p_prospects integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sandbox boolean;
  v_mailbox text;
  v_local text;
  v_domain text;
  v_campaign uuid;
  v_inserted integer;
  v_n integer := greatest(1, least(coalesce(p_prospects, 20), 25));
  v_names text[] := array[
    'Alpine Dental Studio','Bluegate Accounting','Cedar Park Physio','Dovetail Joinery',
    'Eastside Veterinary','Fernwood Landscaping','Granite Fitness','Harbour Law',
    'Ironside Roofing','Juniper Interiors','Kestrel Security','Lakeview Optometry',
    'Maple Street Bakery','Northwind Logistics','Orchard Lane Nursery','Pinecrest Plumbing',
    'Quarry Road Garage','Riverbend Catering','Stonebridge Estates','Thornhill Tutors',
    'Umbra Photography','Vantage Surveying','Westgate Pharmacy','Yarrow Wellness',
    'Zenith Electrical'];
  v_cats text[] := array[
    'dentist','accountant','physiotherapist','joinery','veterinary','landscaping','gym','law firm',
    'roofing','interior design','security','optometrist','bakery','logistics','garden centre',
    'plumbing','car repair','catering','estate agent','tutoring','photography','surveying',
    'pharmacy','wellness','electrician'];
begin
  select is_sandbox into v_sandbox from clients where id = p_client_id;
  if v_sandbox is null then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;
  if not v_sandbox then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_client');
  end if;
  if not (public.is_admin() or public.can_manage_client(p_client_id) or public.is_trusted_backend()) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;

  select lower(email_address) into v_mailbox
  from client_email_credentials
  where client_id = p_client_id and status = 'active'
  limit 1;
  if v_mailbox is null then
    return jsonb_build_object('ok', false, 'error', 'no_mailbox_connected',
      'hint', 'Connect a Gmail account for this sandbox client first. Its test '
           || 'prospects are addressed to that mailbox, so there is nowhere to send until it exists.');
  end if;
  v_local  := split_part(v_mailbox, '@', 1);
  v_domain := split_part(v_mailbox, '@', 2);

  delete from notifications where client_id = p_client_id;
  delete from credit_transactions where client_id = p_client_id;
  delete from payments where client_id = p_client_id;
  update clients set sandbox_days_advanced = 0 where id = p_client_id;
  delete from approval_reminder_log where client_id = p_client_id;
  delete from monthly_launch_usage where client_id = p_client_id;
  delete from mailbox_events where client_id = p_client_id;
  delete from do_not_contact where lower(email) like (v_local || '+sbx-%@' || v_domain);
  delete from campaigns where client_id = p_client_id;

  insert into billing_profiles (client_id, credits_remaining, sms_credits_remaining)
  values (p_client_id, 10000, 0)
  on conflict (client_id) do update set credits_remaining = 10000, updated_at = now();

  insert into campaigns (client_id, name, description, status, channel,
                         search_queries, target_locations, max_results, language, country)
  values (p_client_id, 'Sandbox campaign',
          'Seeded by sandbox_reset. Every prospect is addressed to this account''s own mailbox.',
          'active', 'email', array['sandbox test'], array['Testville'], 50, 'English',
          coalesce((select country from clients where id = p_client_id), 'US'))
  returning id into v_campaign;

  -- prospects.is_sandbox defaults TRUE and about twenty views and RPCs filter
  -- those rows out, which would make a seeded prospect invisible in the very UI
  -- the tester is here to click. That flag is the older demo-row concept and is
  -- unrelated to clients.is_sandbox, so it is explicitly false here.
  insert into prospects (campaign_id, client_id, business_name, contact_name, email,
                         category, location, pipeline_status, is_sandbox)
  select v_campaign, p_client_id,
         v_names[i], split_part(v_names[i], ' ', 1),
         v_local || '+sbx-' || lpad(i::text, 2, '0') || '@' || v_domain,
         v_cats[i], 'Testville', 'new', false
  from generate_series(1, v_n) i;

  -- BEFORE triggers that return NULL skip a row without raising, so this is the
  -- only honest way to know what landed.
  get diagnostics v_inserted = row_count;
  if v_inserted <> v_n then
    return jsonb_build_object('ok', false, 'error', 'seed_incomplete',
      'expected', v_n, 'inserted', v_inserted,
      'hint', 'Rows were dropped by a BEFORE INSERT trigger on prospects. The usual '
           || 'cause is the domain being blacklisted for this client.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign,
    'prospects', v_inserted,
    'credits', 10000,
    'addressed_to', v_local || '+sbx-NN@' || v_domain);
end;
$function$;
