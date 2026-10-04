-- One-off cleanup: remove the "Keep reading" cross-link between the two
-- near-duplicate cash-flow posts now that
-- /blog/simple-weekly-cash-flow-habits-small-business redirects (via
-- vercel.json) to /blog/small-business-cash-flow-weekly-habits.
--
-- blog_link_graph rows are only ever read from this codebase
-- (src/hooks/useBlogPosts.ts fetchLinkedPosts) — there is no write path in
-- the app or admin UI, so this has to be run manually against Supabase
-- (SQL editor, or `supabase db execute` / psql against the project's
-- connection string). It is not run automatically by any build step.
--
-- Deletes both directions of the link (source->target and target->source)
-- by resolving each slug to its blog_posts.id at run time, so it's safe to
-- run even if the ids differ between environments.

with a as (
  select id from blog_posts where slug = 'small-business-cash-flow-weekly-habits'
),
b as (
  select id from blog_posts where slug = 'simple-weekly-cash-flow-habits-small-business'
)
delete from blog_link_graph
where (source_post_id in (select id from a) and target_post_id in (select id from b))
   or (source_post_id in (select id from b) and target_post_id in (select id from a));
