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
