# Shorty Harris MVP — System Documentation

AI-powered sales outreach platform. Finds business prospects, generates personalised cold outreach with AI, sends after human approval, classifies replies, and surfaces qualified opportunities ("hot leads") to clients.

This documentation set covers the whole system. Start here, then follow the links.

| Document | What it covers |
|---|---|
| `ARCHITECTURE.md` | The 7-layer system, data flow, how the pieces connect |
| `DATABASE.md` | All 24 tables, relationships, RLS security model |
| `WORKFLOWS.md` | The 6 n8n workflows + the pre-send gate, step by step |
| `DEPLOYMENT.md` | How to set up Supabase, n8n, and the two frontends |
| `KNOWN_ISSUES.md` | Current limitations and what's deliberately deferred |
| `ROADMAP_PHASE2.md` | Apify scraping, live payments, SMS/WhatsApp, and more |

---

## What's in the system

**Two frontend apps** (React + TypeScript + Supabase):
- **Admin console** — the operator's workspace. Review & approve AI drafts, browse prospects, create/pause campaigns, view hot leads, analytics, and error monitoring.
- **Client dashboard** — what the paying customer sees. Their qualified hot leads, credit balance, billing, and stats.

**One backend** (Supabase — PostgreSQL + RLS): 24 tables, row-level security enforcing multi-client data isolation, plus database functions for compliance, collision detection, and the pre-send gate.

**Six automation workflows** (n8n): the pipeline that imports prospects, generates messages, sends them, classifies replies, follows up, and routes hot leads.

---

## Quick start (local)

Both apps are standard Vite + React + TypeScript projects.

```bash
# Admin console
cd admin-app
npm install
npm run dev

# Client dashboard (separate terminal)
cd client-app
npm install
npm run dev
```

Each app has a `.env` with the Supabase URL and publishable (anon) key already filled in. The anon key is browser-safe; row-level security enforces who can read/write what.

### Logins (created during setup)
- **Admin:** `marcus@gmail.com` — sees the admin console.
- **Client:** `kabwata@sandbox.test` — sees the Kabwata Laundry Co. dashboard only.

Roles live in the `profiles` table (`role` = `admin` or `client`). A client's `client_id` scopes everything they see.

---

## The core principle: the approval gate

**No message is ever sent without a human approving it first.** The AI writes drafts into a `pending` state; an admin reviews them in the Approvals screen; only on approval does the send pipeline pick them up. The frontend only ever writes `approval_status` — it never sends email directly. This is enforced in both the UI and the workflows.

---

## Sandbox status

This is a **sandboxed MVP**. All prospects are flagged `is_sandbox = true`, outreach goes to test email addresses (never real businesses), payments run in test mode, and SMS/WhatsApp sending is not live. See `KNOWN_ISSUES.md` and `ROADMAP_PHASE2.md` for what moving to production involves.
