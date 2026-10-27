-- Cleanup for unexpanded `internal_link:{slug}` placeholders left in stored
-- post bodies by PostKing. New syncs and the renderer already expand these
-- (src/lib/blogLinks.ts); this fixes rows already in blog_posts. Run manually
-- in the Supabase SQL editor, in order, then redeploy so static HTML rebuilds.

-- STEP 1 (read-only): every row that mentions internal_link in slug or body.
select id, slug, status,
       slug ilike '%internal_link%' as in_slug,
       body_md ilike '%internal_link%' as in_body,
       (select count(*) from regexp_matches(body_md, 'internal_link', 'g')) as body_hits
from blog_posts
where slug ilike '%internal_link%' or body_md ilike '%internal_link%'
order by slug;

-- STEP 2: rewrite bodies only. Review STEP 1 first; consider wrapping in
-- begin; ... commit; and checking the row count.
update blog_posts
set body_md = regexp_replace(
  body_md,
  '(https?://[^/[:space:]"''()<>]+)?(/blog/)?internal_link(:|%3A|%3a)/?(blog/)?([a-zA-Z0-9][a-zA-Z0-9-]*)',
  '/blog/\5',
  'g'
)
where body_md ilike '%internal_link%';

-- STEP 3 (optional, NOT run by default): rows whose *slug* contains the
-- prefix are junk. The generator already skips them for HTML and sitemap, so
-- unpublishing is only needed if you want them out of the app too. Inspect
-- STEP 1 output before uncommenting.
-- update blog_posts set status = 'draft'
-- where slug ilike '%internal_link%' and status = 'published';
