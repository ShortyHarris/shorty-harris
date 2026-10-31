alter table public.blog_posts
  add column if not exists postking_article_id text,
  add column if not exists content_hash text;

create unique index if not exists blog_posts_postking_article_id_uidx
  on public.blog_posts (postking_article_id)
  where postking_article_id is not null;