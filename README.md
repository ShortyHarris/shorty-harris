# Shorty Harris

AI-powered B2B sales outreach platform. Finds business prospects, generates personalised cold outreach with AI, sends after human approval, classifies replies, and surfaces qualified opportunities ("hot leads") to clients, with credit-based billing via Stripe.

## Repository layout

```
shorty-harris/
├── admin-app/      # Operator console (React + TypeScript + Vite)
├── client-app/     # Client dashboard (React + TypeScript + Vite)
└── docs/           # Full system documentation + schema/seed SQL
```

> **Note:** admin-app and client-app are currently two separate Vite apps.
> They are slated to be merged into a single app with role-based routing
> (see docs/ROADMAP_PHASE2.md). This commit preserves them as-is as a
> working checkpoint before that refactor.

## The system at a glance

- **Backend:** Supabase (PostgreSQL + Row-Level Security). 24 tables, multi-client
  isolation enforced at the database. Business logic in Postgres functions
  (pre-send compliance/collision gate, A/B assignment, credit handling).
- **Automation:** n8n workflows (import → AI generate → approve → send →
  classify reply → route hot lead → follow-ups), plus Stripe checkout + webhook.
- **AI:** Google Gemini (message generation + reply intent classification).
- **Email:** Gmail API (sandbox test accounts).
- **Payments:** Stripe (test mode).

See `docs/` for architecture, database, workflows, deployment, and known issues.

## Getting started

Each app is a standard Vite project:

```bash
cd admin-app    # or client-app
cp .env.example .env   # then fill in your Supabase URL + anon key
npm install
npm run dev
```

## Environment

Never commit real `.env` files — only `.env.example` templates. The Supabase
anon key is browser-safe; secrets (service_role, Stripe secret) live only in
n8n credentials, never in this repo.

## Logins (sandbox)

- Admin: created in Supabase Auth, profile role = `admin`
- Client: created in Supabase Auth, profile linked to a client via `client_id`

See `docs/DEPLOYMENT.md` for full setup.

## PostKing blog sync (Shorty Harris only)

A daily GitHub Action (05:00 UTC, about 06:00–07:00 Prague) pulls
**Shorty Harris** PostKing articles (`cmvgju3fk1bg9g07zorefgwgu`) into
the admin Blog CMS (`blog_posts`). It never reads Jackies, TUTEL,
Martin Vitek, or any other brand.

| PostKing status | Admin Blog (`/admin/blog`) |
|---|---|
| `scheduled` with a date | **Imported** as `scheduled` with the same `scheduled_for` — ready to go out |
| `published` (including never scheduled) | **Imported** as `published` |
| `scheduled` with no date | **Skipped** (never inserted as draft) |
| already-imported, later `published` | **Updated** in place (`scheduled` → `published`) |
| `unpublished` / `draft` | **Skipped** — no new `blog_posts` row |

Reruns are idempotent: they match on `postking_article_id`, then slug, and
skip when `content_hash` is unchanged. WF12 (`generate-blog-post`) is untouched.

### One-time setup

1. In the **hosted Supabase** SQL editor, run
   `supabase/migrations/20261020180000_blog_posts_postking_sync.sql`.
2. In PostKing → API keys, create a **read**-scoped key that can access the
   Shorty Harris brand. Do not use a key from another brand's workspace.
3. In this GitHub repo → Settings → Secrets and variables → Actions, add:

   | Secret | Value |
   |---|---|
   | `POSTKING_API_TOKEN` | the `pk_live_…` key from step 2 |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role (never the anon key) |

   Optional: `POSTKING_API_URL` if you are not on `https://try.postking.app`.

### Run it once (manual)

GitHub → Actions → **Sync Postking blog** → Run workflow. Tick **dry_run**
to print planned inserts/updates without writing.

Or locally from `app/`:

```bash
# dry-run (no writes)
DRY_RUN=1 POSTKING_API_TOKEN=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  npm run sync:postking-blog -- --dry-run

# write
POSTKING_API_TOKEN=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  npm run sync:postking-blog
```

After the first real run, scheduled and published posts show under Admin →
Blog (the scheduled/published list). Unpublished and draft PostKing articles
are not imported. When an already-imported article is later published in
PostKing, the next daily sync updates that same row.
