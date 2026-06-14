# Architecture

Shorty Harris is a pipeline: a prospect enters at one end, and a qualified, human-approved, compliance-checked opportunity comes out the other — landing on a client's dashboard.

## The layers

```
┌─────────────────────────────────────────────────────────────┐
│  1. LEAD SOURCE                                               │
│     CSV / Google Sheets import (manual today).                │
│     Apify Google Maps scraping is Phase 2.                    │
│     → enters via WF1                                          │
├─────────────────────────────────────────────────────────────┤
│  2. ENRICHMENT & GENERATION                                   │
│     WF1 dedupes + screens do-not-contact + inserts prospect.  │
│     WF2 uses Gemini 2.5 Flash to write a personalised email,  │
│     appends a CAN-SPAM footer, saves it as `pending`.         │
├─────────────────────────────────────────────────────────────┤
│  3. HUMAN APPROVAL GATE                                       │
│     Admin reviews each draft in the Approvals screen and      │
│     approves / edits / rejects. Nothing sends without this.   │
├─────────────────────────────────────────────────────────────┤
│  4. PRE-SEND GATE + SEND                                      │
│     WF2.5 detects approved messages → WF3.                    │
│     WF3 runs the pre-send gate (campaign active? compliant?   │
│     collision?), then sends via Gmail, then schedules         │
│     follow-ups for day 3/7/14.                                │
├─────────────────────────────────────────────────────────────┤
│  5. REPLY HANDLING                                            │
│     WF4 reads inbound replies, classifies intent with Gemini  │
│     (interested / maybe / not / stop / wrong person / OOO),   │
│     routes accordingly.                                       │
├─────────────────────────────────────────────────────────────┤
│  6. HOT LEAD ROUTING                                          │
│     WF6 turns an "interested" reply into a hot_lead, deducts  │
│     1 credit, logs a notification. WF5 handles follow-ups for │
│     non-responders (skipping weekends/holidays).              │
├─────────────────────────────────────────────────────────────┤
│  7. PRESENTATION                                              │
│     Admin console (operator) + Client dashboard (customer),   │
│     both reading the same Supabase tables, scoped by RLS.     │
└─────────────────────────────────────────────────────────────┘
```

## How the pieces connect

Everything centres on **one Supabase database**. n8n workflows write to it; the two React apps read from it (and write a few specific things, like approvals and lead status). There is no separate backend server — Supabase (Postgres + RLS + database functions) is the backend, and n8n is the automation engine.

```
   Apify (Phase 2)
        │
        ▼
   ┌─────────┐   webhook    ┌─────────┐
   │  n8n    │ ───────────► │ Supabase│ ◄──── Admin console (React)
   │ WF1–WF6 │ ◄─────────── │ Postgres│ ◄──── Client dashboard (React)
   └─────────┘   reads/     │  + RLS  │
        │        writes     └─────────┘
        ▼                        ▲
   Gmail / Gemini / Twilio       │
                          database functions:
                          presend_gate, run_compliance_check,
                          check_prospect_collision
```

## Why a "pre-send gate" function

Rather than scatter compliance, collision, and campaign-status checks across workflow nodes, they live in one Postgres function, `presend_gate(message_id)`, which returns a single allow/deny verdict. WF3 calls it once before sending. This keeps the rules in one auditable place and makes them identical no matter what triggers a send.

The gate enforces, in order:
1. **Campaign active?** — a paused campaign blocks sends (this is what the pause toggle controls).
2. **Compliant?** — CAN-SPAM opt-out present, no TCPA violation, not on do-not-contact.
3. **No collision?** — another client hasn't contacted this prospect today.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript, Vite, Supabase JS client, Recharts |
| Auth | Supabase Auth (email/password), role from `profiles` |
| Database | Supabase (PostgreSQL 17) with Row-Level Security |
| Automation | n8n (cloud) — 6 workflows + scheduled jobs |
| AI | Google Gemini 2.5 Flash (message gen + intent classification) |
| Email | Gmail API (sandbox test accounts) |
| Notifications | Twilio (sandbox-logged in MVP) |
| Payments | Test mode — provider TBD (see ROADMAP) |
