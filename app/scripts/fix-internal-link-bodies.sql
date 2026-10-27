-- Cleanup for unexpanded `internal_link:{slug}` placeholders left in stored
-- post bodies by PostKing. New syncs and the renderer already expand these
-- (src/lib/blogLinks.ts); this fixes rows already in blog_posts. Run manually
-- in the Supabase SQL editor, in order, then redeploy so static HTML rebuilds.

-- NOTE: use ~* (regex), not ILIKE: in LIKE patterns "_" is a wildcard and matches
-- plain prose such as "Internal Link".

-- STEP 1 (read-only): every row that mentions internal_link in slug or body.
select id, slug, status,
       slug ~* 'internal_link' as in_slug,
       body_md ~* 'internal_link' as in_body,
       (select count(*) from regexp_matches(body_md, 'internal_link', 'gi')) as body_hits
from blog_posts
where slug ~* 'internal_link' or body_md ~* 'internal_link'
order by slug;

-- STEP 2: rewrite bodies only (any letter case; the slug is kept as written). Review STEP 1 first; consider wrapping in
-- begin; ... commit; and checking the row count.
update blog_posts
set body_md = regexp_replace(
  body_md,
  '(https?://[^/[:space:]"''()<>]+)?(/blog/)?internal_link(:|%3A|%3a)/?(blog/)?([a-zA-Z0-9][a-zA-Z0-9-]*)',
  '/blog/\5',
  'gi' -- case-insensitive: one live row uses a different-case variant
)
where body_md ~* 'internal_link';

-- STEP 3 (optional, NOT run by default): rows whose *slug* contains the
-- prefix are junk. The generator already skips them for HTML and sitemap, so
-- unpublishing is only needed if you want them out of the app too. Inspect
-- STEP 1 output before uncommenting.
-- update blog_posts set status = 'draft'
-- where slug ~* 'internal_link' and status = 'published';
