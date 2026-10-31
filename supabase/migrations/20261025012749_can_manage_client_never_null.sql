
create or replace function public.can_manage_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    public.is_admin()
    or public.is_trusted_backend()
    or (p_client_id is not null and p_client_id = public.current_client_id())
    or (p_client_id is not null and p_client_id = public.impersonating_client_id()),
    false);
$$;
