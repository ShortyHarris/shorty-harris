# SEO / GSC Indexing Audit — shortyharris.com

Stack context: this is a **Vite + React SPA** (react-router-dom, `BrowserRouter`), not Next.js. There is no
`next.config.js`, no `middleware.ts`, no `vercel.json`, no `_redirects` file anywhere in the repo. Blog content
lives in Supabase (`blog_posts` table) and is published by an external n8n workflow ("WF12", referenced in
comments in `src/hooks/useBlogPosts.ts`). A post-build script (`scripts/generate-blog-html.ts`) pre-renders
static HTML for `/blog/:slug` only — every other route (`/`, `/blog`, `/privacy`, `/terms`, `/cookies`) is served
the same empty `dist/index.html` shell and relies entirely on client-side JS to render content and set
per-page SEO tags.

That one architectural fact — **only blog posts get real pre-rendered HTML; everything else is pure CSR, and
there is no server-side/edge redirect layer at all** — is the common thread behind 4 of the 5 GSC issues below.

---

## Issue-by-issue root cause map

| GSC issue | Root cause | Priority |
|---|---|---|
| 1. Page with redirect (6 pages, validation FAILED) | Client-side-only catch-all route redirects to a robots-blocked URL, so Google can never validate the redirect target | **High** |
| 2. Blocked by robots.txt (2 pages) | `/login` is `Disallow`'d but is (a) linked from every page's nav and (b) the destination of the catch-all redirect | **High** |
| 3. Soft 404 (1 page) | SPA serves HTTP 200 for any unmatched path (no real 404), and unmatched routes silently redirect instead of rendering not-found content | **Medium** |
| 4. Duplicate, Google chose different canonical | Two near-duplicate blog posts (confirmed) — self-referential canonicals are technically correct, but content overlap makes Google override them | **High** |
| 5. Page indexed without content | Every non-blog-post public route (`/`, `/blog`, `/privacy`, `/terms`, `/cookies`) ships an empty `<div id="root"></div>` in its raw HTML with no pre-rendering | **Medium** |

---

## 1 & 2 & 3 — The catch-all route (single root cause for three issues)

**File:** [src/App.tsx:292](src/App.tsx#L292)

```tsx
<Route path="*" element={<Navigate to="/login" replace />} />
```

Every URL that doesn't match a defined route — an old/removed blog slug, a typo, a stale backlink, anything —
falls through to this route. Because the app is a client-rendered SPA, the **server still returns HTTP 200**
for that URL (standard SPA fallback hosting behavior — there's no server-side 404 anywhere in this repo), and
then React Router's `<Navigate>` fires a **client-side** redirect (`history.replaceState`) to `/login` once JS
executes.

This explains the exact combination GSC is reporting:

- **"Page with redirect" (validation FAILED, 6 pages):** Googlebot renders the JS, sees the URL redirect to
  `/login`, and tries to index `/login` as the real destination instead. Validation fails because it can never
  successfully fetch/index that destination — see next point.
- **"Blocked by robots.txt":** `/login` is disallowed (see [public/robots.txt:5](public/robots.txt#L5)), so the
  redirect target of every one of those 6 pages is a page Google is told not to crawl. That's also almost
  certainly the 2 "blocked by robots.txt" pages — `/login` itself, reached both by internal links
  ([src/components/PublicNav.tsx:90-98](src/components/PublicNav.tsx#L90-L98), `/login` is linked from the nav
  on **every** public page as "Log in" / "Get started") and by this catch-all redirect.
- **"Soft 404":** for any stale URL that Google requests directly (not via a redirect chain it's already
  flagged), it gets a 200 response whose visible content, once JS runs, is a spinner then a redirect — content-wise
  indistinguishable from a soft 404.

### Fix

Two changes are needed together:

**a) Stop redirecting unknown URLs to a blocked, unrelated page.** Render an actual not-found page instead:

```tsx
// src/App.tsx
<Route path="*" element={<NotFound />} />
```

Add a minimal `NotFound` component that returns a real 404 status via a `<meta name="robots" content="noindex">`
tag (client-rendered noindex is respected by Google as long as it's present before/at render — see caveat in
section 5) instead of silently redirecting.

**b) Fix `robots.txt` so `/login` isn't the problem in the first place** — see section 4 below. Even with (a)
fixed, `/login` is still publicly linked from every page's nav, so it will keep surfacing in Search Console as
"blocked by robots.txt" (which is *expected/desired* for a login page — the real bug is only that it was
previously also serving as a fake redirect target for broken URLs).

**c) If the hosting platform (Vercel/Netlify/etc.) supports it, add a real HTTP-level 404** for unmatched
paths rather than relying on the SPA's 200-for-everything fallback. There is currently no `vercel.json` /
`_redirects` / `netlify.toml` in this repo at all — the SPA fallback behavior is coming entirely from
whatever default the host applies. This is worth confirming with whoever owns the hosting config, since it's
also the reason there is **no mechanism in this codebase to add a real 301 for a changed blog slug** (see
section 4's recommendation).

---

## 3 (detail) — No 404 or noindex is ever actually served

There is no `NotFound`/404 component anywhere in `src/screens/`. Every unmatched route silently redirects
(§1-3 above). Beyond the SEO fix, this is also a real UX gap — a visitor with a bad link is bounced to a login
screen for no visible reason.

---

## 4. Duplicate content — confirmed cash-flow posts + pipeline risk

### Confirmed pair
- `/blog/small-business-cash-flow-weekly-habits`
- `/blog/simple-weekly-cash-flow-habits-small-business`

Same publish date, same topic ("weekly cash-flow habits for small businesses"), same structure, and they
cross-link each other via the `blog_link_graph` table (surfaced through `fetchLinkedPosts()` in
[src/hooks/useBlogPosts.ts:63-88](src/hooks/useBlogPosts.ts#L63-L88) and rendered as "Keep reading" cards on
each post — [src/screens/BlogPost.tsx:153-184](src/screens/BlogPost.tsx#L153-L184)). This is exactly the GSC
"Duplicate, Google chose different canonical than user" pattern: both pages self-canonicalize correctly
(confirmed in section 6 below — the canonical tag generation itself is not broken), but Google's own
duplicate-content clustering picked one of the two as canonical regardless of what each page declares, because
the content is too similar to treat as two distinct pages.

**Recommendation:**
- **Keep canonical / live:** `/blog/small-business-cash-flow-weekly-habits` — check publish order and pick
  whichever has more inbound links / better organic impressions in GSC performance data as the actual tiebreaker;
  absent that signal, keep the one with the clearer/more specific slug, which is
  `small-business-cash-flow-weekly-habits`.
- **Redirect the other:** 301 `/blog/simple-weekly-cash-flow-habits-small-business` →
  `/blog/small-business-cash-flow-weekly-habits`.
- Do **not** just delete the duplicate row from `blog_posts` — that produces a 404/soft-404 instead of
  consolidating link equity. It needs an actual redirect.
- **This repo currently has no way to issue that redirect.** There is no redirects config file of any kind
  (`vercel.json`, `_redirects`, `middleware.ts`) and the SPA has no server-side routing. Two options:
  1. If hosting is Vercel/Netlify, add a platform-level redirect config file (`vercel.json` `redirects` array,
     or `public/_redirects` for Netlify) — this is the correct 301 mechanism and is currently entirely absent
     from the project.
  2. Until that exists, at minimum change the duplicate post's `blog_posts.status` to redirect client-side:
     add a lightweight redirect map read by `BlogPost.tsx` (checked before the Supabase fetch) that
     `<Navigate to="..." replace>`s known old slugs to their replacement. This is not as good as a real 301
     (Googlebot still has to execute JS to see it) but is strictly better than leaving both live, and doesn't
     require infra access.
- Also remove the reciprocal "Keep reading" cross-link between the two posts once one is redirected — it's a
  crawl trap / dilutes the intended primary post.

### Other near-duplicate candidates to review

I could not diff blog body text directly (content lives only in Supabase, not in this repo), but the set of
published slugs (`dist/blog/*`) shows a second thematic cluster worth a manual content review — five posts
all covering hyper-local/neighborhood B2B networking with heavy topical overlap:

- `hyper-local-b2b-referral-network`
- `b2b-neighbor-collaboration-bigger-wins`
- `neighborhood-business-mixer-real-partnerships`
- `b2b-door-to-door-community-building`
- `the-power-of-proximity-crafting-local-b2b-sales-pitch`
- `hyperlocal-prospecting-finding-clients-5-miles`
- `local-b2b-prospecting-guide`

These aren't confirmed duplicates the way the cash-flow pair is, but the slug/topic overlap is the same shape
as the confirmed pair. Worth pulling `title`, `meta_description`, `published_at`, and `target_keywords` for
these seven rows from `blog_posts` and running the same near-duplicate check before more of them get flagged
in GSC.

### Is this a content-pipeline bug?

**Likely yes, and likely to recur.** Evidence:
- The comment at [src/hooks/useBlogPosts.ts:60-62](src/hooks/useBlogPosts.ts#L60-L62) confirms posts (and their
  interlink graph) are generated by an external automated workflow ("WF12") *before* human approval —
  i.e., topic/brief selection is automated, not manually curated per post.
  [src/hooks/useBlogPosts.ts:172-173](src/hooks/useBlogPosts.ts#L172-L173) confirms "regenerate" for a
  rejected/deleted draft just re-queues the same gap for WF12's next scheduled run — there's no dedupe check
  against existing published topics visible anywhere in this repo (the workflow itself lives in n8n, outside
  this codebase, so it can't be inspected directly here, but nothing in the admin approval UI
  (`src/screens/admin/Blog.tsx`) surfaces a similarity/duplicate warning to the human approver either).
- The two confirmed duplicates share a publish date and cross-link each other via `blog_link_graph`, which is
  populated by WF12 "as soon as it plans the interlinks" — meaning the pipeline treated both drafts as
  legitimate, topically-related-but-distinct posts and linked them together, rather than recognizing them as
  the same brief run twice.

**Recommendation beyond the one-off fix:** add a similarity check (even a cheap title/keyword-overlap check
against `target_keywords` and existing published titles) either in the WF12 workflow itself before it creates
a new draft, or as a warning surfaced in the admin approval queue
([src/screens/admin/ApprovalQueue.tsx](src/screens/admin/ApprovalQueue.tsx)) so a human approver sees "this
looks similar to an already-published post" before approving. Without that, the same failure mode will keep
producing new near-duplicate pairs as WF12 continues to run.

---

## 5. Canonical tag generation

Two independent code paths generate canonical tags, and both are correct in isolation:

**a) Client-side, all routes** — [src/hooks/useSeo.ts:28-36,53-57](src/hooks/useSeo.ts#L53-L57):
```ts
if (path) {
  const url = `${window.location.origin}${path}`;
  upsertLink('canonical', url);
  ...
}
```
Self-referential (built from the current page's own `path` prop, passed explicitly by each screen — e.g.
`path: '/blog'` in [src/screens/Blog.tsx:29](src/screens/Blog.tsx#L29), `path: /blog/${post.slug}` in
[src/screens/BlogPost.tsx:42](src/screens/BlogPost.tsx#L42)), and environment-safe **in the sense that it
reflects whatever domain actually served the page** — it uses `window.location.origin`, so it will never point
at the wrong domain, but it also means a staging/preview deployment would legitimately self-canonicalize to
its own preview URL. That's a real (if secondary) risk: if any staging URL is ever crawled while
publicly reachable, it will self-canonicalize to itself rather than to production. Confirm staging deploys are
either not publicly reachable or are excluded via `robots.txt`/auth.

**b) Build-time, blog posts only** — [scripts/generate-blog-html.ts:44-45,152-153](scripts/generate-blog-html.ts#L44-L45):
```ts
const SITE_URL = (process.env.SITE_URL ?? 'https://shortyharris.com').replace(/\/$/, '');
...
`<link rel="canonical" href="${escapeHtml(url)}" />`,
```
This one is properly hardcoded to production (`shortyharris.com`) by default regardless of where the build
runs, which is the right call for a build-time artifact — good practice, no fix needed here.

**No bug found in canonical generation itself** — the "duplicate, different canonical" GSC issue (section 4)
is a content-similarity problem, not a broken canonical tag.

---

## 6. Redirect configuration

**Finding: there is no redirect configuration anywhere in this repository.** Checked and confirmed absent:
- `next.config.js` / `vercel.json` / `netlify.toml` / `public/_redirects` — none exist.
- `middleware.ts` — none exists (only unrelated files under `node_modules` matched the glob).
- No CMS-level or hardcoded slug-redirect logic in `src/` (searched `useBlogPosts.ts`, `BlogPost.tsx`, `App.tsx`).

This means:
- The 6 "page with redirect" GSC entries are **not** coming from an intentional configured redirect — they're
  coming from the client-side catch-all in §1-3.
- There is currently no way to retire an old blog slug with a real 301 (needed for the fix in §4).

**Fix:** add a redirects file appropriate to the hosting platform. If Vercel:

```json
// vercel.json (new file)
{
  "redirects": [
    {
      "source": "/blog/simple-weekly-cash-flow-habits-small-business",
      "destination": "/blog/small-business-cash-flow-weekly-habits",
      "permanent": true
    }
  ]
}
```

If Netlify, equivalent `public/_redirects`:
```
/blog/simple-weekly-cash-flow-habits-small-business  /blog/small-business-cash-flow-weekly-habits  301
```

Once this mechanism exists, also update `writeSitemap()` in `scripts/generate-blog-html.ts` (§7 below) to
never emit a URL that has a redirect rule pointing away from it.

---

## 7. Sitemap generation

**File:** [scripts/generate-blog-html.ts:210-226](scripts/generate-blog-html.ts#L210-L226)

```ts
const STATIC_ROUTES = ['/', '/blog', '/privacy', '/terms'];

function writeSitemap(allPosts: Pick<BlogPostRow, 'slug' | 'published_at'>[]): void {
  const urls = [
    ...STATIC_ROUTES.map((route) => `  <url><loc>${SITE_URL}${route}</loc></url>`),
    ...allPosts.map((p) => { ... }),
  ];
  ...
}
```

- Only ever includes posts fetched via `fetchPosts()`, which filters `.eq('status', 'published')`
  ([scripts/generate-blog-html.ts:88-97](scripts/generate-blog-html.ts#L88-L97)) — draft/pending/rejected/scheduled
  posts are correctly excluded. **Good.**
- No trailing-slash, query-param, or http/https variants — all URLs are built from `SITE_URL` (hardcoded
  `https://`) + a clean path. **Good.**
- **Gap:** `/cookies` (the new Cookie Policy page, per recent commit history) is missing from `STATIC_ROUTES` —
  it exists as a route (`src/screens/Cookies.tsx`, wired in `App.tsx:247`) but is never added to the sitemap.
  Low-priority (not one of the 5 flagged issues) but worth fixing alongside this audit:
  ```ts
  const STATIC_ROUTES = ['/', '/blog', '/privacy', '/terms', '/cookies'];
  ```
- **Gap relevant to §4/§6:** once a redirect is added for the duplicate post, the sitemap generator has no
  awareness of redirect rules and would need the corresponding `blog_posts` row's status changed (e.g. to
  something other than `published`, or filtered explicitly) so `fetchPosts()` stops returning it — otherwise
  the sitemap will keep listing a URL that 301s, which is the exact anti-pattern GSC is already flagging.

The checked-in `public/sitemap.xml` and `dist/sitemap.xml` are explicitly documented as placeholders overwritten
at build time (see comment in [public/sitemap.xml:2-7](public/sitemap.xml#L2-L7)) — not a bug, just noting it's
correctly self-documenting.

---

## 8. robots.txt

**File:** [public/robots.txt](public/robots.txt)

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /app
Disallow: /login
Disallow: /forgot-password
Disallow: /auth/set-password
```

- No overly broad pattern (no `/blog/*`-style rule) — blog content itself is not accidentally blocked.
- `/admin`, `/app`, `/forgot-password`, `/auth/set-password` are all legitimately private (auth-gated
  dashboards) and correctly disallowed.
- **`/login` is the problem.** It is simultaneously:
  1. Disallowed here.
  2. Linked publicly from **every single page** via `PublicNav` ("Log in" / "Get started" —
     [src/components/PublicNav.tsx:90-98,147-160](src/components/PublicNav.tsx#L90-L98)).
  3. The redirect target for every unmatched URL (§1-3).

  (2) alone is enough to make `/login` show up as "blocked by robots.txt" in GSC (Google discovers it via
  internal links regardless of the disallow) — that's expected/benign **as long as `/login` is only reached
  via legitimate internal links**. The real problem is (3): it's also silently absorbing all of GSC's redirect
  validation attempts for unrelated broken URLs, which is what's producing the "validation failed" state.

**Fix:** no change needed to `robots.txt` itself (correctly keeping `/login` out of the index is right) — fix
is entirely in §1-3 (stop routing unknown URLs to `/login`).

---

## 9. Rendering / SSR check — "indexed without content"

**Finding: only `/blog/:slug` pages get pre-rendered content. Every other public route is 100% client-rendered.**

`scripts/generate-blog-html.ts` only calls `buildHtml()` (which injects real title/description/canonical/body
HTML into `<div id="root">`) for individual blog posts
([scripts/generate-blog-html.ts:245-258](scripts/generate-blog-html.ts#L245-L258)). The four `STATIC_ROUTES`
(`/`, `/blog`, `/privacy`, `/terms`) are added to the **sitemap only** — no equivalent HTML is ever generated
for them. Confirmed by inspecting the built output directly: `dist/index.html` (which is what's served for `/`,
`/blog`, `/privacy`, `/terms`, `/cookies`, and any unmatched path) ships:

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

— a genuinely empty root div. All visible content for these routes (headings, body copy, the entire `/blog`
post grid which is fetched from Supabase via `usePublishedBlogPosts()` in
[src/screens/Blog.tsx:31](src/screens/Blog.tsx#L31)) only exists after React mounts and, for `/blog`, after an
additional async Supabase fetch resolves. `index.html`'s `<head>` does carry a static fallback
title/description/OG (good for link-unfurlers), but the page **body** is empty until JS executes and — for
`/blog` — until a network round-trip completes.

This is the most likely explanation for "indexed without content": Google's renderer has a resource/time
budget per page; a page that needs JS execution *plus* a live database round-trip before any text appears is
much more likely to get snapshotted empty than the blog posts (which have real text server-delivered) or a
pure-CSR-but-synchronous page.

**Most likely single flagged page:** `/blog` (the listing page) — it's the only public route that is both
CSR *and* depends on an async data fetch before rendering any content (Home/Privacy/Terms/Cookies are CSR but
render synchronously from static JSX, no network wait).

### Fix

Extend `scripts/generate-blog-html.ts` to also pre-render the static marketing/legal routes the same way it
already does for blog posts — or, more targeted at the flagged page, pre-render the `/blog` index by fetching
published posts at build time and injecting a static post grid into `dist/blog/index.html`, the same pattern
already proven for individual posts:

```ts
// scripts/generate-blog-html.ts — add alongside the existing per-post loop
async function writeBlogIndex(template: string, posts: BlogPostRow[]): Promise<void> {
  const cardsHtml = posts.map((p) => `
    <a href="${SITE_URL}/blog/${escapeHtml(p.slug)}" class="...">
      <h2>${escapeHtml(p.title)}</h2>
      ${p.excerpt ? `<p>${escapeHtml(p.excerpt)}</p>` : ''}
    </a>`).join('\n');
  const html = template.replace('<div id="root"></div>', `<div id="root"><main>${cardsHtml}</main></div>`);
  mkdirSync(path.join(DIST_DIR, 'blog'), { recursive: true });
  writeFileSync(path.join(DIST_DIR, 'blog', 'index.html'), html, 'utf-8');
}
```

Home/Privacy/Terms/Cookies are lower risk since they render synchronously without a network wait, but the
same treatment (or a proper SSG/SSR migration) is the durable long-term fix rather than continuing to bolt on
per-route static generation in a post-build script.

---

## Priority summary

| # | Fix | Priority | Effort |
|---|---|---|---|
| 1 | Replace catch-all `Navigate to="/login"` with a real not-found page (App.tsx:292) | High | Low |
| 2 | Add a redirects config (vercel.json/_redirects) — currently doesn't exist at all | High | Low |
| 3 | 301 `/blog/simple-weekly-cash-flow-habits-small-business` → `/blog/small-business-cash-flow-weekly-habits`, remove their mutual "Keep reading" cross-link | High | Low |
| 4 | Audit the 7-post hyper-local-B2B cluster for further near-duplicates | Medium | Medium |
| 5 | Add a similarity check to the WF12 pipeline / admin approval UI to prevent recurrence | Medium | Medium (outside this repo for the n8n half) |
| 6 | Pre-render `/blog` listing (and ideally `/`, `/privacy`, `/terms`, `/cookies`) instead of pure CSR | Medium | Medium |
| 7 | Add `/cookies` to `STATIC_ROUTES` in the sitemap generator | Low | Trivial |
