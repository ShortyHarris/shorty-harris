-- Idempotent PostKing import keys on the Shorty Harris marketing blog.
-- blog_posts itself is managed outside this repo (hosted Supabase); this
-- only adds the columns the hourly sync uses to dedupe.

alter table public.blog_posts
  add column if not exists postking_article_id text,
  add column if not exists content_hash text;

comment on column public.blog_posts.postking_article_id is
  'PostKing article id for the Shorty Harris brand only. Unique so the hourly sync can upsert.';
comment on column public.blog_posts.content_hash is
  'Fingerprint of the last imported PostKing payload. Unchanged hash → skip write.';

create unique index if not exists blog_posts_postking_article_id_uidx
  on public.blog_posts (postking_article_id)
  where postking_article_id is not null;
