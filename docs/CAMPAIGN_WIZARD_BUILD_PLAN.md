# Campaign Wizard: build plan

Status: draft for Ian and Martin's review, November 2026. Nothing here is built yet.
Sources: PRD v1.4.2, prototype v1.4.1, *Campaign Wizard: Outstanding Questions* v2 (agenda),
and the code on `main` as of commit `a50a63e`.

The wizard is the AI, website-first way to create campaigns. It builds B2B ICPs from the
client's website, suggests one to five campaigns, and creates an editable draft for each one
the user picks. The user approves and launches each campaign on its own.

Ground rules carried from the brief:

- B2B targeting only. There is no B2C or mixed option anywhere.
- Each campaign card shows **estimated prospects**, **estimated hot leads** (always labeled
  "Every campaign varies") and **one estimated credit total**. The wizard shows no dollar
  amounts and no separate setup fee. Dollars and the breakdown live only in the "How credits
  work" FAQ and on the credit packs.
- **No staff approval on launch** (decided by Ian, Oct 30). A client launch goes straight to
  sourcing. AC-62 and the "Awaiting staff review" status are out of the MVP.
- Skipping the wizard has no penalty. Every campaign stays editable and is approved on its
  own. Billing rules sit in a separate, versioned pricing policy that the wizard never
  hard-codes.

---

## 1. What already exists (and what the PRD gets wrong about it)

PRD section 3 says the live app has no create-campaign flow. That was true at the October
site review, but the repo has moved on. A lot of the wizard sits on top of things we already
run:

| Wizard need | Already in the repo | Gap |
|---|---|---|
| Website analysis | **WF9** `wf9-enrich-client` writes `client_website_enrichment` (summary, services, target customer profiles, business type, location) | Only an admin can start it today, and the webhook takes unauthenticated browser POSTs. It needs an authenticated, rate-limited entry and async job status. |
| ICP | `client_icp` (business types, locations, decision-maker roles, pain points, value props, search terms, `edited_fields`), built by `build_client_icp`, edited on **Targeting** | It holds one ICP per client. The wizard needs an ICP per campaign plus exclusions, company size and evidence. |
| Search inputs and limits | `suggest_campaign_inputs`, `validate_campaign_inputs`, `scrape_limits`, `lib/campaignLimits.ts` | Reuse as is. Every wizard campaign has to compile down to these. |
| Manual creation | 4-step **New campaign** modal in `screens/client/Campaigns.tsx` (Basics, Who to target, Details, Review) | This becomes "Create manually". It has to write the same new campaign fields. |
| Sourcing | **WF0a** `wf0-enqueue` gate → `discovery_queue` → **WF0b** Apify (per-location fan-out, `scrape_jobs`, `raw_scrapes`, `import_raw_scrapes`) | The gate charges the launch today. Charging moves into the pricing policy (section 5). |
| Email writing | **WF2** writes one Gemini email per sourced prospect. `upfront_sequence` writes all follow-ups up front. Client approves in **Approvals**. | The wizard shows a campaign-level 4-step sequence. How that maps to per-prospect emails is open question 2.3 (section 3). |
| Cadence | WF3/WF5: follow-ups 3, 5 and 7 **business** days after the previous send | The PRD default is day 0/3/5/7. Decide whether the gaps are counted from the first send or from the previous step, and whether they are business days. |
| Launch counting and refunds | `monthly_launch_usage` (5 free a month), `launch_deduction`, `refund_campaign_launch` | Replaced by first-free, the batch cap and quotes under the new policy. |
| Campaign review by staff | Status `pending_review` plus `auto_approve_campaigns` (default **false**) and an admin activation step | This **is** a staff approval. Ian's decision means launches skip it (section 3, N2). |
| Credits | `billing_profiles.credits_remaining`, `credit_transactions` (purchase / hot_lead_deduction / launch_deduction / refund / adjustment), packs in `lib/pricing.ts` (1 credit = 1 hot lead, $49 for 2) | The new ×10 scale (1 credit = $0.10), reservations, quotes and policy versions are all new. This is the largest single piece of work. |
| Checkout | `wf7-create-checkout` | The packs change to $25/$100/$250. The payment provider is still undecided (ROADMAP_PHASE2). |

Architecture stays as it is: **Supabase is the backend** (Postgres, RLS, security-definer
RPCs, edge functions), **n8n runs the AI and long-running jobs**, and the React app in
`app/` is the client. We add no new server.

---

## 2. Target architecture

```
 Campaigns page ──► Wizard (React, /app/campaigns/wizard/*)
   │  autosave                     │ start job
   ▼                               ▼
 wizard_sessions ◄────────── edge fn `wizard-job` (auth, tenant check, rate limit)
 client_services                    │ POST signed webhook
 client_icp (+ per-campaign icp)    ▼
 campaign_recommendations     n8n: WF9 enrich (reused) · WF20 ICP+recommend
 ai_jobs ◄─────────────────── · WF21 sequence draft · WF22 rewrite   (Gemini)
   │ realtime / poll
   ▼
 create_wizard_drafts() ──► campaigns (+ versions, sequence steps)  ◄── editor / manual modal
                                    │ approve_campaign_version()
                                    ▼
 pricing policy (Postgres) ── estimate_campaign_cost() · create_launch_quote()
                                    │ commit_launch(quote) — atomic: fee, first-free,
                                    ▼                            reservation, queue row
                              discovery_queue ──► WF0b sourcing ──► WF1/WF2 ──► Approvals ──► WF3 send
                                    │                                   WF4/WF6 hot lead
                                    └── prospect_charge / release ◄─────┘ hot_lead_charge (policy)
```

Design choices:

1. **AI work runs in n8n, behind one edge function.** This matches WF0/WF2/WF9, keeps the
   Gemini keys in n8n, and gives us retries. The browser never calls n8n directly for wizard
   jobs, which closes the open WF9 webhook. The edge function checks the session, the tenant
   and a per-client rate limit, writes an `ai_jobs` row (queued) and calls n8n with a shared
   secret. n8n writes the results back with the service role and moves the job to
   succeeded or failed. The UI follows `ai_jobs` through realtime, as Campaigns already does
   for scrape status. That covers PRD 5.1 (queued/running/succeeded/failed, partial data kept).
2. **The money lives in Postgres.** The existing pattern (`presend_gate`,
   `refund_campaign_launch`, `claim_message_for_send`) holds billing rules as security-definer
   functions with row locks. Quotes, first-free claims, the batch cap, reservations and the
   ledger follow it. n8n and the UI only call RPCs, so the rules are written once and can be
   tested in `supabase/tests/database`.
3. **The pricing policy is data.** A `pricing_policies` row holds every value in PRD 8
   (fees, rates, caps, hot-lead estimate rates, quote TTL, starter grant, low-balance level),
   effective-dated and scoped (default, plan or client). The wizard, editor and FAQ read
   `estimate_campaign_cost()` and `get_active_policy()`. Nothing in `app/` holds a price, so
   `lib/pricing.ts` is replaced by policy reads.
4. **A campaign is versioned.** Material edits create a new `campaign_versions` row. Sending
   and WF2 prompts read the approved version. This supports either answer to question 2.2.
5. **One campaign model.** Wizard, manual and "Find new campaigns" drafts are the same
   `campaigns` row with `origin` set. The editor, approval and launch don't care where a
   campaign came from (AC-29).
6. **Feature flag.** `clients.wizard_enabled` (admin-only field, guarded by
   `protect_client_admin_fields`) lets us pilot with Mountains Mowing and one specialist B2B
   client before everyone sees it.

---

## 3. Decisions: what each one changes in the build

### From the agenda

| # | Question | Effect on the build | Suggested answer |
|---|---|---|---|
| 2.1 | Staff approval on launch | **Decided: none.** No "Awaiting staff review" status, no admin approve/reject path, no held fee. Launch goes from quote to `discovery_queue`. | — |
| 2.2 | Edits to live campaigns | *Pending revision* needs `campaign_versions`, `pending_version_id`, a diff view, re-approval, and WF2/WF3 reading the approved version. *Pause until re-approved* needs versions too, but no side-by-side running. | Pending revision. It is about 3–5 dev days more than pause. |
| 2.3 | Emails written up front or before each send | Today WF2 writes **per prospect after sourcing**. "Up front" (the prototype) means the campaign stores a 4-step **template**, and WF2 personalises it per prospect. That changes the WF2 prompt and makes rewrites and Expert refine work on the template. "Just before send" keeps WF2 as it is, and the wizard sequence becomes a style brief. | Store the template up front, and have WF2 personalise lightly per prospect. Client approval in Approvals stays. Refinement only touches steps that haven't been sent. |
| 2.4 | Multi-business accounts | If yes, `clients` becomes the org and a new `businesses` table carries the profile, services, ICP, Brand voice and dedup scope. Every RLS policy keyed on `client_id` stays, but the wizard tables key on `business_id`. | No for MVP. Keep the wizard tables keyed on `client_id` and add `business_id` later. |
| 2.5 | ACs 1–25 from v1.0 | QA scope only. | Find and attach them before the estimate. |
| — | Hot-lead definition | WF4/WF6 already decide "interested". Billing needs the final rule (exclusions, repeat replies) and a dispute path. | Placeholder rule plus one-click dispute. Charge logic waits for Martin. |
| — | Hot-lead estimate rate | A policy value (`hot_rate_lo` / `hot_rate_hi`), no code. | Keep 0.5–1.0% until real data replaces it. |

### New questions the code review raised (add to the agenda)

| # | Question | Why it matters |
|---|---|---|
| N1 | Does "Create manually" reuse the existing 4-step modal? | It already validates limits and target areas. Reusing it saves about a week. Suggested answer: yes, extended with service, ICP and start date. |
| N2 | Does "no staff approval" also retire `pending_review` / `auto_approve_campaigns` for **manual** campaigns? | Today most clients' campaigns wait for an admin. Leaving it for manual only would break AC-29 parity. Suggested answer: retire it for all client launches, and keep admin pause. |
| N3 | Do clients still approve **each email** in Approvals after the campaign approval? | The prototype says "Nothing sends until you approve it". That means two approvals: the campaign version, then each prospect's email. Do we keep both, or let an approved campaign template auto-approve its personalised emails? |
| N4 | Cadence: PRD day 0/3/5/7 or the current 3/5/7 business days after the previous send? | Both are possible. The current rule is tested (`04_follow_up_dates`, `wf3-follow-up-schedule.test.ts`). |
| N5 | How do we estimate prospects before sourcing? | Nothing estimates today. Options: (a) history of `raw_scrapes` yield per term and location, (b) a cheap Apify count pre-flight (costs money), (c) a policy default range clipped to `max_results`. Suggested answer: (a), falling back to (c). This is also agenda 3.3. |
| N6 | Decision-maker roles | Google Maps sourcing finds businesses, not people. Roles shape the copy and which mailbox we prefer. They don't filter sourcing. The UI copy shouldn't suggest otherwise. |
| N7 | Old credit conversion | Today a client pays about $20–25 per old credit (1 hot lead). D6 converts 1 old credit to 100 new credits ($10). Martin should confirm this is intended before any balance migrates. |
| N8 | Payment provider | The new packs need checkout (`wf7-create-checkout`). The provider is still undecided. Without it, pilot clients can use the starter grant and admin adjustments only. |

---

## 4. Data model (new and changed)

All new tables get RLS: admin all, and the client reads and writes only its own rows through
`current_client_id()` / `can_manage_client()`. Billing tables are client **read-only**, and
only the RPCs write them.

**Wizard and profile**

- `wizard_sessions`: client_id, entry_point (`onboarding|new_campaign|find_new`), stage,
  answers jsonb (provided vs inferred, per field), skipped_at, completed_at, updated_at.
- `client_services`: client_id, name, category, seasonality, restrictions, source
  (`website|user`), confirmed_at. This replaces the `services` jsonb in enrichment as the
  confirmed list.
- `client_icp`: add exclusions, company_size, goal, cta, value_prop, plus field provenance
  (extend `edited_fields`).
- `ai_jobs`: client_id, session_id, kind (`enrich|recommend|sequence|rewrite`), status,
  model, prompt_version, input jsonb, output jsonb, error, attempts, timestamps.
- `campaign_recommendations`: session_id, service_id, title, target, rationale, fit_label,
  rank, est_prospects_lo/hi, evidence jsonb, status (`suggested|selected|dismissed|drafted`),
  custom boolean.

**Campaign**

- `campaigns`: add origin (`wizard|manual|find_new`), recommendation_id, service_id,
  start_date, current_version_id, approved_version_id, pending_version_id, archived_at,
  cloned_from_id, plus the fee audit fields (setup_fee_charged_at, setup_fee_transaction_id,
  initial_launch_at, launch_policy_version, fee_waiver_reason). Extend the status check with
  `approved`, `scheduled`, `archived` and `launch_failed`. Drop `pending_review` per N2.
- `campaign_versions`: campaign_id, version, snapshot jsonb (ICP, targeting, search inputs,
  cadence), created_by, material boolean.
- `campaign_sequence_steps`: version_id, step, delay_days, subject, body, cta.
- `campaign_approvals`: campaign_id, version_id, actor, batch_id (fee cap only),
  invalidated_at, reason.
- `rewrite_usage`: campaign_id, message step, actor, at. The limit comes from the policy.

**Pricing and credits** (only once the policy work starts, section 5)

- `pricing_policies`: version (`v2.0`), scope, scope_id, status (`provisional|approved`),
  effective_from/to, values jsonb.
- `launch_quotes`: token, client_id, campaign_ids, policy_version, line_items jsonb, total,
  claims_first_free, expires_at, accepted_at, consumed_at.
- `first_launch_entitlements`: client_id, status (`available|claimed|restored|not_offered`),
  claimed_by_campaign, reason.
- `credit_holds`: campaign_id, amount, status (`held|charged|released`).
- `credit_transactions`: add policy_version, idempotency_key (unique), batch_id, quote_id,
  balance_after and source_event, and extend the type check with the PRD 8.5 types.
- `coupons_waivers`: code or staff waiver, scope, value, reason, actor, expiry, uses.

---

## 5. Delivery plan

Each milestone ships behind `wizard_enabled`, with its tests in the same PR (vitest for
`app/`, SQL tests in `supabase/tests/database`, and n8n Code-node tests in `app/src/n8n`, as
release-checks already runs). Day counts are rough single-developer estimates, given so the
work can be ordered. Martin's estimate replaces them.

### M0 — Settle decisions (no code)
Agenda items 2.2–2.5, hot-lead definition, N1–N8. Write PRD v1.5. **Blocks M3 (2.3),
M4 (2.2, N3) and M5 (hot lead, N7, N8).**

### M1 — Data and UX foundation (~6–8 days)
- Migrations: `wizard_sessions`, `client_services`, `ai_jobs`, `campaign_recommendations`,
  campaign columns, `campaign_versions`, `campaign_sequence_steps`, `campaign_approvals`, RLS
  and SQL tests (tenant isolation, AC-40).
- Retire `pending_review` / auto-approve for client launches (N2), and migrate existing rows.
- Entry points: onboarding welcome (S00) for new clients with no campaigns, and **New
  campaign / Find new campaigns / Create manually** on the Campaigns header (S07). Replace the
  "x of 5 launches used" counter with the next-launch pill once M5 lands.
- Wizard shell: route `/app/campaigns/wizard/:step`, progress bar, Back/Next/Skip always
  visible, autosave to `wizard_sessions` (debounced, plus on step change), resume.
- Manual create: extend the existing modal so it writes the same fields (origin=`manual`).

### M2 — Company discovery (~6–8 days)
- `wizard-job` edge function (auth, tenant, rate limit, shared-secret call to n8n).
- WF9 hardened and reused: SSRF guard (public http/https only, no private IPs, size and time
  limits), prompt-injection-safe extraction (website text treated as data), output tagged
  `inferred` with evidence snippets.
- Steps S01–S05: business, services (add/remove, seasonality), customers and geography
  (B2B only: business types, roles, size, area via `LocationAreaInput` and `RadiusMap`,
  exclusions), goals and CTA, confirm profile. Required-field gate (AC-41). Website failure
  falls back to manual entry.
- Optional collateral upload: Supabase Storage bucket, client-scoped. Formats and size wait on
  agenda 3.2. This can be cut from MVP.

### M3 — AI strategy (~8–10 days)
- **WF20 recommend**: confirmed profile in, 1–5 distinct recommendations out (service ×
  buyer × area × goal), ranked, each with evidence and a fit label. No filler (AC-42).
  Dedup against existing campaigns, with overlap notes. Compile each recommendation to
  `search_queries` + `target_areas` + `max_results` and check it with
  `validate_campaign_inputs`.
- Prospect estimate per N5, stored as `est_prospects_lo/hi`.
- **WF21 sequence**: a 4-step template per campaign, with placeholders that match what WF2
  can fill.
- Recommendations screen (S06): cards with est. prospects, est. hot leads + "Every campaign
  varies", one "Estimated credits" total. Multi-select, regenerate, add my own idea, and
  keyboard-operable cards (AC-60).
- `create_wizard_drafts(session_id, rec_ids[])`: idempotent, one campaign plus version 1 per
  recommendation. No charge (AC-37).
- Find new campaigns (S07 → S06): reuses the saved profile and asks only for what changed
  (AC-58).

### M4 — Campaign editor and approval (~8–12 days)
- Editor (S08), tabs: ICP and targeting (start date), Email sequence (3 free rewrites, counter,
  **WF22 rewrite**, Expert refine shown as "Proposed" behind a switch), Cadence, Review and
  launch. Unsaved-changes guard (reuse `lib/confirmDiscard.ts`, AC-46).
- Enforced checklist (AC-45): no blank subject or body, increasing delays, sender mailbox ready
  (`client_mailbox_ready`), search inputs valid.
- Versioning and approvals: `save_campaign_version`, `approve_campaign_version`, material-edit
  detection, pending revision per 2.2 (AC-33, AC-34, AC-47).
- WF2 reads the approved template version (per 2.3). WF3/WF5 keep the approved version for
  messages already queued.
- Campaign detail modal (S14) and lifecycle actions: pause/resume (existing
  `set_sequence_paused` / campaign status), clone, archive/reactivate, cancel launch.

### M5 — Pricing policy, quotes and launch (~10–14 days)
This can run in parallel with M3/M4 once N7/N8 and the hot-lead rule are settled.
- `pricing_policies` seeded with v2.0 (PRD 8). `get_active_policy()` and
  `estimate_campaign_cost()`, plus the batch version (PRD 8.6, 8.10).
- `create_launch_quote()` with a 15-minute TTL, then `commit_launch(token, idempotency_key)`.
  Under row locks it: re-validates everything, claims first-free atomically, applies the batch
  cap, charges the fee, places the prospect hold, records approvals with the batch id,
  inserts `discovery_queue` and consumes the token. Each campaign either passes or fails on
  its own (AC-35, AC-63, AC-64).
- WF0a: drop its own charging and launch counting, and only accept queue rows that a commit
  created. Retire `monthly_launch_usage` and `count_launch_on_enqueue`.
- Sourcing hooks: `prospect_charge` per 100 sourced (partial-block rule from the policy),
  release the rest when sourcing ends, 90-day no-repeat per client (AC-49, AC-50).
- Hot leads: WF6 / `route_call_outcome_to_hot_lead` charge from the policy instead of `-1`.
  One-click dispute RPC and refund (AC-51). Hold-at-zero rule (AC-53).
- `cancel_launch` / failure refund with first-free restored, replacing
  `refund_campaign_launch` (AC-65).
- Starter grant (500, 90-day expiry job), low-balance banner, legacy conversion as one logged
  adjustment per client (D6, after N7). Packs, Billing FAQ (S11) and the Pricing page read the
  policy (AC-69, AC-71).
- Review and launch screen (S10) and launch result.

### M6 — Integrate, test, pilot (~5–7 days)
- End-to-end run in the sandbox (`docs/SANDBOX.md`) with the `-dev` n8n copies: wizard →
  drafts → approve → quote → launch → simulated discovery → emails → simulated reply → hot
  lead → charge and dispute.
- Add the wizard cases to `docs/SANDBOX-TESTS.md` and `docs/REGRESSION-TESTING-PLAN.md`.
- Funnel events (PRD 10) through the existing analytics hooks.
- Pilot: turn on `wizard_enabled` for Mountains Mowing and one specialist B2B client.

**Rough total:** 43–59 developer days. That is M1–M6 for one developer, less if M5 runs in
parallel.

### Can the wizard ship before the new pricing?
Yes, if Ian wants it sooner. M1–M4 depend only on `estimate_campaign_cost()`. Before M5, that
function can read a **legacy policy** (5 free launches a month, 1 credit per hot lead) and the
cards show that policy's numbers. When M5 publishes v2.0, the same screens switch with no UI
change. The PRD's decoupling requirement (8.1) asks for exactly this.

---

## 6. Risks

- **Two approval layers (N3)** could make the wizard feel slower than the brief intends.
  Settle it before M4.
- **Estimate accuracy (N5).** A wrong prospect range moves the credit total on every card.
  Show ranges only and label them "Estimate".
- **Re-denominating credits** touches every balance and the public Pricing page. Migrate once,
  in one logged adjustment per client, with a dry-run report first.
- **WF9 webhook exposure.** Fix this in M2 whatever else happens.
- **n8n changes can't be tested from cloud sessions** (n8n README). Keep the business logic
  in Code-node files under `n8n/code/` with tests, as WF2.5 and WF3 already do.

## 7. Acceptance criteria map

| Milestone | ACs |
|---|---|
| M1 | 26–29, 39, 40, 60 (keyboard) |
| M2 | 41, 59 |
| M3 | 42, 43, 58, 70, 72 |
| M4 | 30–34, 44–47, 57 |
| M5 | 35–37, 48–56, 61, 63–69, 71 |
| Dropped | 62 (staff review, per Ian, Oct 30) |
| Pending | 1–25 from v1.0 (agenda 2.5) |
