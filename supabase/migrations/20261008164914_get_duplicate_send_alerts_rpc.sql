create or replace function public.get_duplicate_send_alerts()
returns jsonb language sql security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.duplicate_send_alerts a;
$$;
revoke all on function public.get_duplicate_send_alerts() from public;
grant execute on function public.get_duplicate_send_alerts() to anon, authenticated, service_role;