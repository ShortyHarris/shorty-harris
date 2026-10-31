
alter table blog_topics drop constraint if exists blog_topics_client_id_fkey;
alter table blog_topics drop column if exists client_id;

alter table blog_posts drop constraint if exists blog_posts_client_id_fkey;
alter table blog_posts drop constraint if exists blog_posts_client_id_slug_key;
alter table blog_posts drop column if exists client_id;
alter table blog_posts add constraint blog_posts_slug_key unique (slug);

drop index if exists idx_blog_topics_client_unused;
create index idx_blog_topics_unused on blog_topics(used);

drop index if exists idx_blog_posts_client_status;
create index idx_blog_posts_status on blog_posts(status);

drop index if exists idx_blog_posts_client_published;
create index idx_blog_posts_published on blog_posts(published_at desc) where status = 'published';
