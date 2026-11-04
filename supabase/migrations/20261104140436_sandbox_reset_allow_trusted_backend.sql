-- Reset also has to be callable by the backend, not only by a signed-in admin
-- or the client themselves: the Run next step and Simulate reply endpoints run
-- as the service role, and so will the regression runner. is_trusted_backend()
-- is the predicate this codebase already uses for exactly that.
create or replace function public.sandbox_reset(p_client_id uuid, p_prospects integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sandbox boolean;
  v_mailbox text;
  v_local text;
  v_domain text;
  v_campaign uuid;
  v_n integer := greatest(1, least(coalesce(p_prospects, 20), 50));
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

  return jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign,
    'prospects', v_n,
    'credits', 10000,
    'addressed_to', v_local || '+sbx-NN@' || v_domain);
end;
$$;

revoke all on function public.sandbox_reset(uuid, integer) from public, anon;
grant execute on function public.sandbox_reset(uuid, integer) to authenticated;;
