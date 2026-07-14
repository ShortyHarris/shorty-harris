// Post-build step: generates fully static HTML for the public blog.
//
// Why this exists instead of a React route: this app is a plain Vite SPA
// (no SSR/SSG). GPTBot, ClaudeBot, and most simple crawlers never execute
// JavaScript, so a client-rendered React /blog would look like an empty
// <div id="root"> to them — defeating the entire point of the sitemap/
// robots/llms.txt/JSON-LD work. Instead this script runs after `vite build`,
// fetches published posts straight from Supabase (same project the app
// already talks to, public anon key — RLS only allows reading rows where
// status = 'published' anyway), and writes real static HTML/XML/txt files
// into dist/ alongside the SPA. Vercel serves these as static files, which
// take priority over the SPA catch-all rewrite (see vercel.json).
//
// Re-run trigger: the admin dashboard's "Approve & publish" action pings a
// Vercel Deploy Hook (via the trigger-blog-deploy edge function), which
// kicks off a fresh `vite build` + this script — so newly published posts
// go live within a build cycle, not instantly, but with zero extra runtime
// infrastructure.

import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// ── Env (Vercel injects configured project vars into the build process env
// regardless of the VITE_ prefix; for local `npm run build` runs we fall
// back to reading .env directly since a plain Node script doesn't get Vite's
// import.meta.env handling) ──────────────────────────────────────────────
// Simple, dependency-free .env parsing (avoids adding dotenv just for this)
async function ensureEnv() {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) return;
  const envPath = path.join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key] === undefined) {
      process.env[key] = rawVal.replace(/^["']|["']$/g, '');
    }
  }
}
await ensureEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
// Canonical site origin used for sitemap/RSS/JSON-LD absolute URLs. Set
// VITE_SITE_URL in your env if this default doesn't match production.
const SITE_URL = (process.env.VITE_SITE_URL || 'https://shortyharris.com').replace(/\/$/, '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[blog-static] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — skipping static blog generation.');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORY_LABEL = {
  family_business: 'Family Business',
  small_business: 'Small Business',
  business_development_rural: 'Rural Business Development',
  general: 'General',
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatRssDate(iso) {
  return iso ? new Date(iso).toUTCString() : new Date().toUTCString();
}

const PAGE_STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #f7f4ee;
  color: #20211c;
}
a { color: inherit; }
.wrap { max-width: 880px; margin: 0 auto; padding: 0 20px; }
.site-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 0; border-bottom: 1px solid #ece8df; margin-bottom: 40px;
}
.site-nav .brand { font-weight: 800; font-size: 20px; letter-spacing: -0.03em; text-decoration: none; color: #1a1c17; }
.site-nav a.back { font-size: 13px; font-weight: 600; text-decoration: none; color: #62655c; }
.site-nav a.back:hover { color: #3c7a5b; }
.site-footer { margin: 60px 0 30px; padding-top: 24px; border-top: 1px solid #ece8df; font-size: 12px; color: #9a9d92; text-align: center; }
.page-title { font-size: 32px; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 8px; }
.page-sub { font-size: 14px; color: #62655c; margin: 0 0 32px; }
.pill { display: inline-flex; align-items: center; border-radius: 999px; background: #edf4ef; color: #3c7a5b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 10px; }
.cat-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
.cat-filters button { cursor: pointer; border: 1px solid #ece8df; background: #fff; color: #62655c; font-family: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 14px; border-radius: 999px; }
.cat-filters button.is-active { background: #3c7a5b; border-color: #3c7a5b; color: #fff; }
.post-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
.post-card { display: flex; flex-direction: column; text-decoration: none; border: 1px solid #ece8df; border-radius: 14px; background: #fff; overflow: hidden; transition: box-shadow .15s, transform .15s; }
.post-card:hover { box-shadow: 0 8px 28px rgba(32,33,28,0.08); transform: translateY(-2px); }
.post-card .cover { width: 100%; aspect-ratio: 1200 / 630; object-fit: cover; background: #f0ede6; display: block; }
.post-card .body { padding: 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.post-card .title { font-size: 15.5px; font-weight: 700; color: #20211c; line-height: 1.3; }
.post-card .excerpt { font-size: 13px; color: #62655c; line-height: 1.5; }
.post-card .meta { margin-top: auto; font-size: 11.5px; color: #9a9d92; }
#more-btn { display: block; margin: 32px auto 0; cursor: pointer; border: 1px solid #ece8df; background: #fff; color: #20211c; font-family: inherit; font-weight: 700; font-size: 13px; padding: 10px 22px; border-radius: 10px; }
.post-hero-cover { width: 100%; aspect-ratio: 1200 / 630; object-fit: cover; border-radius: 14px; background: #f0ede6; margin-bottom: 28px; }
.post-header { margin-bottom: 24px; }
.post-header h1 { font-size: 34px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; margin: 12px 0; }
.post-meta-row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #9a9d92; }
.post-body { font-size: 16px; line-height: 1.75; color: #20211c; }
.post-body h2 { font-size: 24px; margin: 36px 0 14px; letter-spacing: -0.01em; }
.post-body h3 { font-size: 19px; margin: 28px 0 12px; }
.post-body p { margin: 0 0 18px; }
.post-body ul, .post-body ol { margin: 0 0 18px; padding-left: 22px; }
.post-body a { color: #3c7a5b; }
.post-body img { max-width: 100%; border-radius: 10px; }
.related { margin-top: 56px; padding-top: 32px; border-top: 1px solid #ece8df; }
.related h2 { font-size: 20px; font-weight: 800; margin: 0 0 18px; }
.related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
`;

function siteNav() {
  return `<div class="site-nav wrap"><a class="brand" href="${SITE_URL}/">Shorty Harris</a><a class="back" href="/blog">← All posts</a></div>`;
}

function siteFooter() {
  return `<div class="site-footer wrap">© ${new Date().getFullYear()} Shorty Harris</div>`;
}

function coverImg(url, alt, className) {
  if (!url) return `<div class="${className}"></div>`;
  return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="1200" height="630" loading="lazy" />`;
}

function postCard(post) {
  return `
    <a class="post-card" href="/blog/${encodeURIComponent(post.slug)}" data-category="${escapeHtml(post.category)}">
      ${coverImg(post.cover_image_url, post.title, 'cover')}
      <div class="body">
        <span class="pill">${escapeHtml(CATEGORY_LABEL[post.category] ?? post.category)}</span>
        <div class="title">${escapeHtml(post.title)}</div>
        ${post.excerpt ? `<div class="excerpt">${escapeHtml(post.excerpt)}</div>` : ''}
        <div class="meta">${formatDate(post.published_at)}</div>
      </div>
    </a>`;
}

function htmlDocument({ title, description, canonical, extraHead = '', bodyContent }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${canonical}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/blog/blog.css" />
${extraHead}
</head>
<body>
${bodyContent}
</body>
</html>`;
}

async function fetchPublishedPosts() {
  const { data, error } = await supabase
    .from('blog_posts')
    .select(`id, title, slug, category, body_md, excerpt, cover_image_url,
             seo_title, meta_description, target_keywords, status, author,
             created_at, approved_at, published_at`)
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch published posts: ${error.message}`);
  return data ?? [];
}

async function fetchLinkGraph(postIds) {
  if (postIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('blog_link_graph')
    .select('source_post_id, target_post_id, anchor_text')
    .in('source_post_id', postIds);
  if (error) throw new Error(`Failed to fetch link graph: ${error.message}`);
  const bySource = new Map();
  for (const row of data ?? []) {
    const list = bySource.get(row.source_post_id) ?? [];
    list.push(row);
    bySource.set(row.source_post_id, list);
  }
  return bySource;
}

function renderIndexPage(posts) {
  const categories = Array.from(new Set(posts.map((p) => p.category)));
  const cards = posts.map(postCard).join('\n');
  const body = `
${siteNav()}
<div class="wrap">
  <h1 class="page-title">Blog</h1>
  <p class="page-sub">Insights on running and growing a small or family business.</p>
  ${categories.length > 1 ? `<div class="cat-filters">
    <button class="is-active" data-filter="all">All</button>
    ${categories.map((c) => `<button data-filter="${escapeHtml(c)}">${escapeHtml(CATEGORY_LABEL[c] ?? c)}</button>`).join('\n')}
  </div>` : ''}
  <div class="post-grid" id="post-grid">${cards}</div>
</div>
${siteFooter()}
<script>
(function () {
  var grid = document.getElementById('post-grid');
  var buttons = document.querySelectorAll('.cat-filters button');
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      buttons.forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      var filter = btn.getAttribute('data-filter');
      grid.querySelectorAll('.post-card').forEach(function (card) {
        var show = filter === 'all' || card.getAttribute('data-category') === filter;
        card.style.display = show ? '' : 'none';
      });
    });
  });
})();
</script>`;
  return htmlDocument({
    title: 'Blog — Shorty Harris',
    description: 'Insights on running and growing a small or family business.',
    canonical: `${SITE_URL}/blog`,
    bodyContent: body,
  });
}

function renderPostPage(post, related) {
  const title = post.seo_title || post.title;
  const description = post.meta_description || post.excerpt || '';
  const canonical = `${SITE_URL}/blog/${post.slug}`;
  const bodyHtml = marked.parse(post.body_md || '');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    image: post.cover_image_url ? [post.cover_image_url] : undefined,
    datePublished: post.published_at,
    dateModified: post.published_at,
    author: { '@type': 'Person', name: post.author || 'Shorty Harris' },
    description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };

  const relatedHtml = related.length
    ? `<div class="related"><h2>Related posts</h2><div class="related-grid">${related.map(postCard).join('\n')}</div></div>`
    : '';

  const body = `
${siteNav()}
<div class="wrap">
  <article>
    <div class="post-header">
      <span class="pill">${escapeHtml(CATEGORY_LABEL[post.category] ?? post.category)}</span>
      <h1>${escapeHtml(post.title)}</h1>
      <div class="post-meta-row">
        <span>${escapeHtml(post.author || 'Shorty Harris')}</span>
        <span>·</span>
        <span>${formatDate(post.published_at)}</span>
      </div>
    </div>
    ${coverImg(post.cover_image_url, post.title, 'post-hero-cover')}
    <div class="post-body">${bodyHtml}</div>
  </article>
  ${relatedHtml}
</div>
${siteFooter()}`;

  return htmlDocument({
    title,
    description,
    canonical,
    extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    bodyContent: body,
  });
}

function renderRss(posts) {
  const items = posts.map((p) => `
    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid>${SITE_URL}/blog/${p.slug}</guid>
      <description>${escapeHtml(p.excerpt || p.meta_description || '')}</description>
      <pubDate>${formatRssDate(p.published_at)}</pubDate>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Shorty Harris Blog</title>
<link>${SITE_URL}/blog</link>
<description>Insights on running and growing a small or family business.</description>
${items}
</channel>
</rss>`;
}

function renderSitemap(posts) {
  const staticUrls = [`${SITE_URL}/`, `${SITE_URL}/blog`];
  const postUrls = posts.map((p) => `${SITE_URL}/blog/${p.slug}`);
  const urls = [...staticUrls, ...postUrls];
  const body = urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

function renderRobots() {
  return `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

function renderLlmsTxt() {
  return `# Shorty Harris

> Shorty Harris runs outbound prospecting on autopilot — it finds prospects, writes outreach, follows up, and routes hot leads to your team, so small and family businesses can grow without hiring a sales team.

Every day you don't send, a competitor does. Shorty Harris prospects, writes, and follows up — on autopilot.

## Blog

The Shorty Harris blog (${SITE_URL}/blog) covers running and growing a small or family business: outreach strategy, local/rural business development, and practical growth advice.

- Blog index: ${SITE_URL}/blog
- RSS feed: ${SITE_URL}/blog/rss.xml
`;
}

async function main() {
  const posts = await fetchPublishedPosts();
  console.log(`[blog-static] Found ${posts.length} published post(s).`);

  const linkGraph = await fetchLinkGraph(posts.map((p) => p.id));
  const postsById = new Map(posts.map((p) => [p.id, p]));

  const blogDir = path.join(DIST, 'blog');
  await mkdir(blogDir, { recursive: true });

  await writeFile(path.join(blogDir, 'blog.css'), PAGE_STYLES.trim(), 'utf-8');
  await writeFile(path.join(blogDir, 'index.html'), renderIndexPage(posts), 'utf-8');
  await writeFile(path.join(blogDir, 'rss.xml'), renderRss(posts), 'utf-8');
  await writeFile(path.join(DIST, 'sitemap.xml'), renderSitemap(posts), 'utf-8');
  await writeFile(path.join(DIST, 'robots.txt'), renderRobots(), 'utf-8');
  await writeFile(path.join(DIST, 'llms.txt'), renderLlmsTxt(), 'utf-8');

  for (const post of posts) {
    const links = linkGraph.get(post.id) ?? [];
    const related = links
      .map((l) => postsById.get(l.target_post_id))
      .filter(Boolean);

    const postDir = path.join(blogDir, post.slug);
    await mkdir(postDir, { recursive: true });
    await writeFile(path.join(postDir, 'index.html'), renderPostPage(post, related), 'utf-8');
  }

  console.log(`[blog-static] Wrote ${posts.length} post page(s), index, sitemap.xml, robots.txt, llms.txt, and rss.xml.`);
}

main().catch((err) => {
  console.error('[blog-static] Generation failed:', err);
  // Don't fail the whole Vercel build over the blog step — the SPA should
  // still deploy even if e.g. Supabase is briefly unreachable.
  process.exit(0);
});
