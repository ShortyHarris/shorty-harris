-- One sandbox customer per tester, so two people testing never reset each other's
-- data. Admin only. Same settings as the first sandbox (auto-approved campaigns,
-- 10,000 credits, the shortyharris.com test website). No prospects yet: the tester
-- logs in, connects their own Gmail and presses Reset, which seeds 20 prospects
-- addressed to that mailbox (sandbox_reset refuses until a mailbox exists).
-- Called from the admin Clients screen ("+ New sandbox"), which then sends the
-- tester a login invite through the normal invite-client function.
create or replace function public.admin_create_sandbox_client(p_tester_name text, p_contact_email text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text := nullif(btrim(coalesce(p_tester_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_contact_email, '')), ''));
  v_id uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if v_name is null or v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input',
      'detail', 'Enter the tester''s name and a valid email address.');
  end if;

  insert into clients (business_name, business_type, location, website_url, contact_name, contact_email,
                       representative_name, notification_channel, country, send_timezone, status,
                       is_sandbox, auto_approve_campaigns, max_campaigns, monthly_prospect_limit)
  values ('Sandbox (' || v_name || ')', 'testing', 'Testville', 'https://shortyharris.com', v_name, v_email,
          split_part(v_name, ' ', 1), 'whatsapp', 'US', 'America/Chicago', 'active',
          true, true, 3, 1000)
  returning id into v_id;

  insert into billing_profiles (client_id, credits_remaining, sms_credits_remaining)
  values (v_id, 10000, 0);

  return jsonb_build_object('ok', true, 'client_id', v_id, 'business_name', 'Sandbox (' || v_name || ')');
end;
$function$;
revoke all on function public.admin_create_sandbox_client(text, text) from public, anon;
grant execute on function public.admin_create_sandbox_client(text, text) to authenticated;
