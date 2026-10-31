
create or replace function public.admin_prospect_categories()
returns table(category text, n bigint)
language sql stable security definer set search_path to 'public' as $$
  select p.category, count(*)::bigint
  from public.prospects p
  where public.is_admin() and p.category is not null and btrim(p.category) <> ''
  group by p.category
  order by count(*) desc, p.category;
$$;
revoke all on function public.admin_prospect_categories() from public, anon;
grant execute on function public.admin_prospect_categories() to authenticated;
