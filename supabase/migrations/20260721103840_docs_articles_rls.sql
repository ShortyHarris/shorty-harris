alter table public.docs_articles enable row level security;

create policy admin_all_docs_articles
  on public.docs_articles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy scoped_read_docs_articles
  on public.docs_articles
  for select
  using (
    status = 'published'
    and audience in ('client', 'both')
  );
