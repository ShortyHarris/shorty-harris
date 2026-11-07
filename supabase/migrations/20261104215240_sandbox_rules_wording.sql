create or replace function public.sandbox_set_warmup(p_client_id uuid, p_on boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce((select is_sandbox from clients where id = p_client_id), false) then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_client');
  end if;
  if not (public.is_admin() or public.can_manage_client(p_client_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  update clients set sandbox_warmup = coalesce(p_on, true) where id = p_client_id;
  return jsonb_build_object('ok', true, 'warmup', coalesce(p_on, true),
    'detail', case when coalesce(p_on, true)
      then 'Real sending rules on: warm-up limits (' || public.mailbox_daily_cap(p_client_id) || ' today), spacing between sends, and 9am to 5pm Mon-Fri on the sandbox clock.'
      else 'Fast testing mode: up to 100 emails a day at any hour, with no spacing.' end);
end;
$function$;