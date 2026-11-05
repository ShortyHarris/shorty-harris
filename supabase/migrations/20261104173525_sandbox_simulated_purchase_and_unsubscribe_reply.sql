-- 1. Sandbox purchases. Billing's Buy button opened a real Stripe checkout even for a
--    sandbox client. sandbox_simulate_purchase writes exactly what WF7b (the Stripe
--    webhook) writes on a paid checkout: a payments row, the credits, and a 'purchase'
--    ledger line, marked as a sandbox purchase. Only the real pack sizes are accepted.
-- 2. Simulate reply. The canned "not interested" text said "Please take us off your
--    list", which is really an opt-out request. It is now a plain no, and a new
--    'unsubscribe' kind does what WF4 does for a stop request: intent 'stop', a
--    do_not_contact row (reason stop_request), and the sequence stops. That is what
--    Analytics counts as "opted out".
-- 3. sandbox_reset also clears sandbox payments.
--
-- Applied live as 20261104173525 (2 and 3 as in-place edits); full definitions below.

create or replace function public.sandbox_simulate_purchase(p_client_id uuid, p_credits integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sandbox boolean;
  v_cents integer;
  v_payment uuid;
  v_balance integer;
  v_ref text := 'sandbox_' || replace(gen_random_uuid()::text, '-', '');
begin
  select is_sandbox into v_sandbox from clients where id = p_client_id;
  if not coalesce(v_sandbox, false) then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_client');
  end if;
  if not (public.is_admin() or public.can_manage_client(p_client_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  -- Same packs as app/src/lib/pricing.ts.
  v_cents := case p_credits when 2 then 4900 when 5 then 9900 when 10 then 17900 end;
  if v_cents is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_pack');
  end if;

  insert into payments (client_id, stripe_payment_intent_id, stripe_checkout_session_id,
                        amount_cents, currency, credits_purchased, status)
  values (p_client_id, v_ref, v_ref, v_cents, 'usd', p_credits, 'succeeded')
  returning id into v_payment;

  update billing_profiles set credits_remaining = coalesce(credits_remaining, 0) + p_credits, updated_at = now()
   where client_id = p_client_id
  returning credits_remaining into v_balance;

  insert into credit_transactions (client_id, amount, type, reference_id, description)
  values (p_client_id, p_credits, 'purchase', v_payment,
          'Sandbox purchase (no charge): ' || p_credits || ' credits');

  return jsonb_build_object('ok', true, 'credits_added', p_credits, 'balance', v_balance,
    'detail', 'Sandbox purchase: ' || p_credits || ' credits added. No card was charged.');
end;
$function$;
revoke all on function public.sandbox_simulate_purchase(uuid, integer) from public, anon;
grant execute on function public.sandbox_simulate_purchase(uuid, integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sandbox_simulate_reply(p_prospect_id uuid, p_kind text DEFAULT 'interested'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client uuid;
  v_msg record;
  v_body text;
  v_intent text;
  v_reply uuid;
  v_name text;
begin
  case p_kind
    when 'interested' then
      v_intent := 'interested';
      v_body := 'Hello, thanks for reaching out. This sounds relevant to us. '
             || 'Could you send pricing and a couple of times for a short call next week?';
    when 'not_interested' then
      v_intent := 'not_interested';
      v_body := 'Thanks for the note, but we are all set for now and not looking for this.';
    when 'unsubscribe' then
      v_intent := 'stop';
      v_body := 'Please unsubscribe me and do not email this address again.';
    when 'auto_reply' then
      v_intent := 'auto_reply';
      v_body := 'Thank you for your email. I am currently out of the office and will reply on my return.';
    when 'bounce' then
      v_intent := 'bounced';
      v_body := '** Address not found ** Your message was not delivered because the address could not be found. '
             || 'The response from the remote server was: 550 5.1.1 no such user';
    else
      return jsonb_build_object('ok', false, 'error', 'unknown_kind',
        'allowed', jsonb_build_array('interested','not_interested','unsubscribe','auto_reply','bounce'));
  end case;

  v_client := public.sandbox_guard(p_prospect_id);
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_prospect_or_not_permitted');
  end if;

  select m.id, m.gmail_thread_id, p.business_name into v_msg
  from messages m join prospects p on p.id = m.prospect_id
  where m.prospect_id = p_prospect_id and m.send_status = 'sent'
  order by m.sent_at desc limit 1;

  if v_msg.id is null then
    return jsonb_build_object('ok', false, 'error', 'nothing_sent_yet',
      'hint', 'Use Run next step until an email has actually been sent, then simulate a reply to it.');
  end if;
  v_name := coalesce(v_msg.business_name, 'The prospect');

  insert into replies (prospect_id, message_id, client_id, body, received_at,
                       gmail_message_id, intent, intent_confidence, classified_at, match_method)
  values (p_prospect_id, v_msg.id, v_client, v_body, now(),
          'sandbox-' || gen_random_uuid()::text, v_intent, 1.0, now(), 'thread')
  returning id into v_reply;

  if p_kind = 'interested' then
    perform public.sandbox_fire('wf6-hot-lead', jsonb_build_object(
      'prospect_id', p_prospect_id,
      'intent', 'interested',
      'reply_id', v_reply,
      'business_name', v_name,
      'ai_summary', 'Replied asking for pricing and a call.',
      'suggested_action', 'Send pricing and offer two times next week.'));
  elsif p_kind = 'bounce' then
    update prospects set pipeline_status = 'bounced', followups_stopped = true, updated_at = now()
    where id = p_prospect_id;
    update follow_up_schedules set status = 'cancelled', updated_at = now()
    where prospect_id = p_prospect_id and status in ('pending','generating','generated');
  elsif p_kind = 'unsubscribe' then
    insert into do_not_contact (email, reason, source_prospect_id)
    select lower(p.email), 'stop_request', p.id from prospects p where p.id = p_prospect_id
    on conflict (lower(email)) where email is not null do nothing;
    update prospects set pipeline_status = 'replied', followups_stopped = true, updated_at = now()
    where id = p_prospect_id;
    update follow_up_schedules set status = 'cancelled', updated_at = now()
    where prospect_id = p_prospect_id and status in ('pending','generating','generated');
  elsif p_kind = 'not_interested' then
    update prospects set pipeline_status = 'replied', followups_stopped = true, updated_at = now()
    where id = p_prospect_id;
  else
    update prospects set pipeline_status = 'replied', updated_at = now()
    where id = p_prospect_id and pipeline_status not in ('hot_lead','won','lost');
  end if;

  return jsonb_build_object('ok', true, 'kind', p_kind, 'reply_id', v_reply,
    'note', case when p_kind = 'interested'
                 then 'Sent to the hot lead router. The lead, the credit charge and the notification appear within a few seconds.'
                 else 'Recorded.' end);
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
