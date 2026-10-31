create or replace function public.bump_docs_article_version()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := coalesce((select full_name from public.profiles where id = auth.uid()), 'admin');
  return new;
end;
$$;

create trigger docs_articles_bump_version
before update on public.docs_articles
for each row
execute function public.bump_docs_article_version();
