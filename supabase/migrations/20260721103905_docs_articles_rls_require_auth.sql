drop policy scoped_read_docs_articles on public.docs_articles;

create policy scoped_read_docs_articles
  on public.docs_articles
  for select
  to authenticated
  using (
    status = 'published'
    and audience in ('client', 'both')
  );

drop policy admin_all_docs_articles on public.docs_articles;

create policy admin_all_docs_articles
  on public.docs_articles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
