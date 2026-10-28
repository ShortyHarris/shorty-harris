// Post-build static HTML generator for public blog posts.
//
// The problem: this is a client-rendered Vite SPA — every route (including
// /blog/:slug) serves the exact same dist/index.html shell. Real browsers
// and JS-executing crawlers get correct per-post <title>/description/OG tags
// from the useSeo() hook (src/hooks/useSeo.ts) once React mounts, but simple
// or budget-limited crawlers only ever see the site-wide fallback tags baked
// into index.html — so individual posts never get indexed properly.
//
// The fix: after `vite build`, read the built dist/index.html (with its real
// hashed asset paths) as a template, and for every published post write a
// real dist/blog/<slug>/index.html with that post's actual <title>, meta
// description, OG/Twitter tags, canonical link, and BlogPosting JSON-LD —
// plus the post's real rendered content inside #root, so there's meaningful
// text even before any JS runs. This does NOT change routing or add SSR:
// main.tsx's existing `createRoot(...).render(...)` call still overwrites
// #root the moment the bundle mounts, exactly like it does today — real
// users get the full interactive SPA, just with a real-content flash instead
// of a blank one before it takes over.
//
// Usage:
//   npm run generate:blog-html                     # every published post
//   npm run generate:blog-html -- --slug=my-post    # just one (n8n calls
//                                                     this after publishing)

import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandInternalLinks, hasInternalLink } from '../src/lib/blogLinks.ts';
import { PUBLIC_PAGES } from '../src/lib/publicPages.ts';
import { canonicalUrl, SITE_URL } from '../src/lib/site.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(APP_ROOT, 'dist');
const TEMPLATE_PATH = path.join(DIST_DIR, 'index.html');

// Same public project/anon key already hardcoded in src/lib/supabase.ts —
// safe to reuse here since it's already shipped in the client bundle.
// Override via env vars if this ever needs to point elsewhere.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://lxoeotyibsalbxgbjfxo.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_CdK80AB1j_99hPPZGGS_jA_XYsNzrUs';
// Canonical/OG URLs always point at the single production host (www, see
// src/lib/site.ts), even on preview deploys — you don't want a Vercel
// preview URL getting indexed as the canonical source.

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  body_md: string;
  excerpt: string | null;
  cover_image_url: string | null;
  seo_title: string | null;
  meta_description: string | null;
  author: string | null;
  published_at: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  family_business: 'Family Business',
  small_business: 'Small Business',
  business_development_rural: 'Rural Business Development',
  general: 'General',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// Slugs that are still live in `blog_posts` (so /blog/:slug keeps resolving
// the post rather than 404ing) but that have a redirect pointing away from
// them (see vercel.json) and must therefore never be re-surfaced by the
// sitemap or get their own static HTML generated — both would just point
// crawlers straight back at a URL that immediately redirects.
//
// This is a hardcoded exclusion list rather than a new `blog_posts.status`
// value (e.g. 'redirected') on purpose: the status enum is defined outside
// this repo (Supabase) and adding a value there is a schema migration that
// also has to be taught to every other status-aware query in the codebase
// (useBlogPosts.ts, the admin approval queue, etc). A slug list here is a
// zero-schema-change fix; revisit as a real status if this list grows past
// a handful of entries.
const REDIRECTED_SLUGS = new Set(['simple-weekly-cash-flow-habits-small-business']);

const RESERVED_TOP_LEVEL = new Set(['pricing', 'blog', 'login', 'signup', 'app', 'admin', 'privacy', 'terms', 'cookies', 'gmail-data-use', 'home', 'forgot-password', 'auth', 'unsubscribe']);

async function fetchPosts(slugFilter?: string): Promise<BlogPostRow[]> {
  let q = supabase
    .from('blog_posts')
    .select('id, slug, title, category, body_md, excerpt, cover_image_url, seo_title, meta_description, author, published_at')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString());
  if (slugFilter) q = q.eq('slug', slugFilter);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to fetch blog posts: ${error.message}`);
  // A slug containing "internal_link" is a junk row from an unexpanded
  // PostKing link; it must never get a page or a sitemap entry.
  const rows = (data ?? []) as BlogPostRow[];
  // The bare-slug redirect in vercel.json skips these top-level routes, so a post
  // using one would be unreachable via its bare URL; fail loudly.
  const clash = rows.find((p) => RESERVED_TOP_LEVEL.has(p.slug));
  if (clash) throw new Error(`Published slug "${clash.slug}" collides with a top-level route`);
  return rows.filter((p) => !REDIRECTED_SLUGS.has(p.slug) && !hasInternalLink(p.slug));
}

// Matches a <meta ...> tag by one of its attributes regardless of attribute
// order or whether the source template wraps attributes across lines —
// `[^>]` matches newlines too, so this is safe against both the raw
// (unminified) index.html and Vite's minified build output.
function replaceMetaTag(html: string, attrMatch: string, newTag: string): string {
  const re = new RegExp(`<meta[^>]*${attrMatch}[^>]*>`);
  if (!re.test(html)) {
    throw new Error(`Expected to find a <meta ${attrMatch}> tag in the build template but didn't — index.html may have changed shape.`);
  }
  return html.replace(re, newTag);
}

// Reads the site-wide fallback content= value already baked into
// index.html, so a post missing its own description falls back to that
// instead of an empty meta tag.
function extractMetaContent(html: string, attrMatch: string): string {
  const re = new RegExp(`<meta[^>]*${attrMatch}[^>]*content="([^"]*)"`);
  return re.exec(html)?.[1] ?? '';
}

function buildHtml(template: string, post: BlogPostRow): string {
  const displayTitle = post.seo_title?.trim() || post.title;
  const fullTitle = displayTitle.endsWith('Shorty Harris') ? displayTitle : `${displayTitle} — Shorty Harris`;
  const url = canonicalUrl(`/blog/${post.slug}`);
  const image = post.cover_image_url?.trim() || '';
  const categoryLabel = CATEGORY_LABEL[post.category] ?? post.category;
  const author = post.author?.trim() || 'Shorty Harris';

  let html = template;

  if (!html.includes('<title>') || !html.includes('</head>') || !html.includes('<div id="root">')) {
    throw new Error('dist/index.html does not look like the expected Vite output — aborting rather than guessing.');
  }

  // Falls back to the site-wide description already baked into index.html
  // rather than an empty meta tag, for the rare post missing both fields.
  const description = post.meta_description?.trim() || post.excerpt?.trim() || extractMetaContent(html, 'name="description"');

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(fullTitle)}</title>`);
  html = replaceMetaTag(html, 'name="description"', `<meta name="description" content="${escapeHtml(description)}" />`);
  html = replaceMetaTag(html, 'property="og:title"', `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`);
  html = replaceMetaTag(html, 'property="og:type"', `<meta property="og:type" content="article" />`);
  html = replaceMetaTag(html, 'property="og:description"', `<meta property="og:description" content="${escapeHtml(description)}" />`);
  html = replaceMetaTag(html, 'name="twitter:title"', `<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />`);
  html = replaceMetaTag(html, 'name="twitter:description"', `<meta name="twitter:description" content="${escapeHtml(description)}" />`);

  if (image) {
    // Replace in place — index.html already ships a site-wide
    // twitter:card="summary" fallback, and appending a second twitter:card
    // tag instead of replacing it would leave two conflicting tags in <head>.
    html = replaceMetaTag(html, 'name="twitter:card"', `<meta name="twitter:card" content="summary_large_image" />`);
  }

  html = setCanonical(html, url);

  const extraTags: string[] = [];
  if (image) {
    extraTags.push(`<meta property="og:image" content="${escapeHtml(image)}" />`);
    extraTags.push(`<meta name="twitter:image" content="${escapeHtml(image)}" />`);
  }

  // Added alongside the site-wide Organization JSON-LD already in
  // index.html's <head> — multiple JSON-LD blocks on one page are valid.
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    author: { '@type': 'Person', name: author },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  if (image) jsonLd.image = [image];
  if (post.published_at) jsonLd.datePublished = post.published_at;
  if (description) jsonLd.description = description;
  extraTags.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);

  html = html.replace('</head>', `${extraTags.join('\n    ')}\n  </head>`);

  // Real content for crawlers that never run JS. Class names intentionally
  // mirror src/screens/BlogPost.tsx so the already-loading Tailwind bundle
  // styles this correctly for the brief moment before React takes over.
  const bodyHtml = marked.parse(expandInternalLinks(post.body_md || ''), { async: false }) as string;
  if (hasInternalLink(bodyHtml)) throw new Error('rendered body still contains "internal_link"');
  const excerptHtml = post.excerpt
    ? `<p class="mt-5 text-[17px] sm:text-[19px] leading-relaxed text-[#605978]">${escapeHtml(post.excerpt)}</p>`
    : '';
  const imageHtml = image
    ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(post.title)}" width="1200" height="630" class="mt-10 aspect-[1200/630] w-full rounded-2xl bg-[#f1e9ff] object-cover" />`
    : '';

  const rootContent = `<div style="font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif" class="min-h-screen bg-white text-[#0e0822]">
      <main class="max-w-[680px] mx-auto px-6 pt-14 pb-24">
        <span class="text-[12.5px] font-semibold uppercase tracking-[.1em] text-[#7412ef]">${escapeHtml(categoryLabel)}</span>
        <h1 class="mt-4 mb-0 text-[30px] sm:text-[38px] lg:text-[44px] font-extrabold leading-[1.15] tracking-tight">${escapeHtml(post.title)}</h1>
        ${excerptHtml}
        <div class="mt-8 flex items-center gap-3 border-y border-[#e8e3f7] py-4">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1e9ff] text-[13px] font-semibold text-[#7412ef]">${escapeHtml(initials(author))}</div>
          <div class="flex flex-col leading-tight">
            <span class="text-[13.5px] font-semibold text-[#0e0822]">${escapeHtml(author)}</span>
            <span class="text-[12.5px] text-[#605978]">${escapeHtml(formatDate(post.published_at))}</span>
          </div>
        </div>
        ${imageHtml}
        <div class="blog-post-body" style="font-size:17px;line-height:1.85;color:#0e0822;margin-top:44px;">${bodyHtml}</div>
      </main>
    </div>`;

  html = html.replace('<div id="root"></div>', `<div id="root">${rootContent}</div>`);

  return html;
}

const STATIC_ROUTES = ['/', ...Object.values(PUBLIC_PAGES).map((p) => p.path)];

// Replaces the homepage canonical + og:url baked into index.html.
function setCanonical(html: string, url: string): string {
  const u = escapeHtml(url);
  html = html.replace(/<link[^>]*rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${u}" />`);
  return replaceMetaTag(html, 'property="og:url"', `<meta property="og:url" content="${u}" />`);
}

// Static shells for the non-blog public routes (/pricing, legal pages, /blog)
// so each has its own title/description/canonical instead of the homepage
// shell. React still takes over #root on load, same as the post pages.
function buildStaticPageHtml(template: string, page: { path: string; title: string; description: string }): string {
  const fullTitle = page.title.endsWith('Shorty Harris') ? page.title : `${page.title} - Shorty Harris`;
  const t = escapeHtml(fullTitle);
  const d = escapeHtml(page.description);
  let html = template.replace(/<title>[^<]*<\/title>/, () => `<title>${t}</title>`);
  html = replaceMetaTag(html, 'name="description"', `<meta name="description" content="${d}" />`);
  html = replaceMetaTag(html, 'property="og:title"', `<meta property="og:title" content="${t}" />`);
  html = replaceMetaTag(html, 'property="og:description"', `<meta property="og:description" content="${d}" />`);
  html = replaceMetaTag(html, 'name="twitter:title"', `<meta name="twitter:title" content="${t}" />`);
  html = replaceMetaTag(html, 'name="twitter:description"', `<meta name="twitter:description" content="${d}" />`);
  return setCanonical(html, canonicalUrl(page.path));
}

// The sitemap always reflects every published post, regardless of whether
// this run was scoped to a single --slug for HTML generation — a partial
// sitemap would be worse than the static one it replaces.
function writeSitemap(allPosts: Pick<BlogPostRow, 'slug' | 'published_at'>[]): void {
  const urls = [
    ...STATIC_ROUTES.map((route) => `  <url><loc>${SITE_URL}${route}</loc></url>`),
    ...allPosts.map((p) => {
      const lastmod = p.published_at ? `<lastmod>${p.published_at.slice(0, 10)}</lastmod>` : '';
      return `  <url><loc>${SITE_URL}/blog/${escapeHtml(p.slug)}</loc>${lastmod}</url>`;
    }),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), xml, 'utf-8');
  console.log(`✓ dist/sitemap.xml (${STATIC_ROUTES.length} static routes + ${allPosts.length} posts)`);
}

async function main() {
  if (!existsSync(TEMPLATE_PATH)) {
    console.error(`✖ ${TEMPLATE_PATH} not found — run "npm run build" before generate:blog-html.`);
    process.exit(1);
  }
  const template = readFileSync(TEMPLATE_PATH, 'utf-8');

  const slugArg = process.argv.find((a) => a.startsWith('--slug='));
  const slugFilter = slugArg ? slugArg.slice('--slug='.length) : undefined;

  for (const page of Object.values(PUBLIC_PAGES)) {
    const outDir = path.join(DIST_DIR, page.path);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'index.html'), buildStaticPageHtml(template, page), 'utf-8');
    console.log(`✓ dist${page.path}/index.html`);
  }

  const posts = await fetchPosts(slugFilter);

  if (slugFilter && posts.length === 0) {
    console.error(`✖ No published post found with slug "${slugFilter}".`);
    process.exit(1);
  }

  for (const post of posts) {
    let html: string;
    try {
      html = buildHtml(template, post);
    } catch (e) {
      // One malformed post shouldn't take down the whole build.
      console.error(`✖ Skipped "${post.slug}": ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const outDir = path.join(DIST_DIR, 'blog', post.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
    console.log(`✓ dist/blog/${post.slug}/index.html`);
  }

  console.log(`Generated static HTML for ${posts.length} published post${posts.length === 1 ? '' : 's'}.`);

  // Sitemap needs the complete set even on a single-slug on-demand run.
  const allPosts = slugFilter ? await fetchPosts() : posts;
  writeSitemap(allPosts.map((p) => ({ slug: p.slug, published_at: p.published_at })));
}

main().catch((err) => {
  console.error('✖ generate-blog-html failed:', err);
  process.exit(1);
});
