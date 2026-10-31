
-- current_user is the function OWNER inside SECURITY DEFINER callers, so the old check was always true.
-- session_user is the real connection role (postgres for migrations/cron/SQL editor; 'authenticator' for API calls);
-- API callers are trusted only if their JWT role is service_role.
create or replace function public.is_trusted_backend()
returns boolean language sql stable set search_path to 'public' as $$
  select session_user in ('postgres','supabase_admin') or coalesce(auth.role(), '') = 'service_role';
$$;

grant execute on function public.add_business_days(timestamptz, integer) to authenticated;
