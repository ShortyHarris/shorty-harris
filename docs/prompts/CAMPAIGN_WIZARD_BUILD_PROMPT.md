# Prompt 2: build the Campaign Wizard locally

Use this after Prompt 1 (`LOCAL_SETUP_PROMPT.md`) has finished and the local stack and
nightly sync work. Paste everything below the line into Claude Code in the local repo, on the
`wizard-local` branch. It works one milestone at a time and stops after each one so you can
check it.

If you have them, copy PRD v1.4.2 and prototype v1.4.1 into `docs/campaign-wizard/` first
(that folder is gitignored, so they stay local).

---

Build the Shorty Harris **Campaign Wizard**, following `docs/CAMPAIGN_WIZARD_BUILD_PLAN.md`.
That plan is the source of truth. Where it differs from the PRD in `docs/campaign-wizard/`, the
plan wins: it records decisions made after the PRD. Read the plan in full, then
`docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/LOCAL_DEVELOPMENT.md`,
`supabase/tests/README.md`, `n8n/README.md`, and the code it names (especially
`app/src/screens/client/Campaigns.tsx`, `app/src/hooks/useClientCampaigns.ts`,
`app/src/hooks/useClientIcp.ts`, `app/src/lib/campaignLimits.ts`,
`app/src/lib/scrapeEnqueue.ts`, and the `client_icp` / `client_website_enrichment` /
`build_client_icp` / `suggest_campaign_inputs` / `validate_campaign_inputs` definitions in
`supabase/baseline/schema.sql` and later migrations).

## What we're building

An AI, website-first way to create B2B campaigns, in three screens:

1. **Your website.** One URL field and Analyze, plus "I don't have a website", which opens a
   short form (name, what you do, where you work, optional best customers).
2. **Check what we found.** Business, services, who you sell to, area and goal, all
   prefilled and editable. AI guesses carry a "Please check" tag.
3. **Pick your campaigns.** One to five cards. Each card shows estimated prospects, estimated
   hot leads ("Every campaign varies") and one credit line. The user selects any number and
   creates a free draft for each.

Drafts open in the campaign editor (targeting, the four emails, cadence, launch). Each campaign
launches on its own; "Launch all" is a convenience. "Skip wizard & create manually" is on every
screen and opens the existing New campaign form.

## Decisions already made (don't reopen them)

- **B2B only.** No consumer or mixed targeting anywhere.
- **No staff approval on launch.** Client launches go straight to sourcing. Remove the
  `pending_review` / `auto_approve_campaigns` hold for client launches (manual and wizard
  alike), with a migration for existing rows. Admins can still pause.
- **Today's pricing.** Don't build the PRD's new credit model. Every credit number the wizard
  shows comes from one new read-only function, `estimate_campaign_cost(campaign_ids)`, which
  today returns:
  - estimated prospects (a range);
  - estimated hot leads: 0.5–1.0% of that range, rounded, always labelled "Every campaign
    varies";
  - a launch line from `monthly_launch_usage` and the balance: "Free launch (N of 5 left this
    month)" or "1 credit to launch".

  No screen may calculate credits itself. A later project will replace the inside of this
  function.
- **Launching** uses the existing gate (`wf0-enqueue`, see `app/src/lib/scrapeEnqueue.ts`)
  unchanged. "Launch all" calls it once per campaign and shows which launched and which didn't,
  and why.
- **Emails written up front.** Creating a draft also writes the campaign's four emails (first
  email plus three follow-ups) as a template the client can read and edit. They get 3 free AI
  rewrites per campaign, with a visible counter. After launch, WF2 and WF5 personalise that
  template per prospect, and the client still approves each email in Approvals. Campaigns
  without a template keep today's behaviour.
- **Today's cadence.** Follow-ups go 3, 5 and 7 business days after the previous email. The
  editor shows this rule read-only; don't add a cadence editor.
- **Launch is the approval.** There is no separate campaign "Approve" step and no campaign
  versions. Edits to a live campaign apply to emails not yet written; each edit is logged in
  `audit_logs`.
- **Functionality first.** Use the app's existing components and styles (client shell, Tailwind
  tokens such as `--ad-green`, `LocationAreaInput`, `RadiusMap`, `TagInput`, `ConfirmDialog`).
  Don't spend time on new visual design yet.
- **Not in scope:** the new pricing, Expert refine, A/B packs, Brand voice, file uploads,
  coupons, staff review.

## Hard rules

- **Local only.** Never `git push`. Commit on `wizard-local` (one commit per logical change,
  clear message). Don't merge into `main`.
- **Never touch production**: no writes to the live Supabase, no deploys, no calls to
  `n8n.shortyharris.com`. The local app and local database are already set up to block this
  (see `docs/LOCAL_DEVELOPMENT.md`); don't undo that.
- **Database changes are migrations** in `supabase/migrations/` (timestamped names, as the
  existing ones). Apply them to the local development stack. The nightly sync re-applies them
  after each refresh, so they must be safe to run on a fresh copy of live.
- Every new table gets RLS: admin all; a client only its own rows through
  `current_client_id()` / `can_manage_client()`. Business rules live in security-definer
  functions with `set search_path`, like the existing ones.
- **Tests with every change**, in the same commit:
  - vitest for `app/` logic (pure functions in `app/src/lib/` with `.test.ts` next to them,
    as the repo does);
  - pgTAP files in `supabase/tests/database/` for new database functions and RLS, using the
    fixtures in `supabase/tests/helpers/test_helpers.sql` (add fixtures there if needed);
  - n8n Code-node logic as files in `n8n/code/` with tests in `app/src/n8n/`, as for WF2.5
    and WF3.
- Before you say a milestone is done, run all of these and show me the results:
  `cd app && npx tsc -b && npx vitest run && npx eslint . && npx vite build`, then
  `scripts/db/test.sh`. Never skip, disable or loosen a test to get green. If something fails
  for a reason outside your change, tell me.
- **Stop after each milestone.** Give me a short summary: what changed, how to try it in the
  local app (which login, which clicks), test results, and anything you weren't sure about.
  Then wait for me.
- If the plan doesn't answer something, choose the simplest option that matches it, note it
  in your summary, and carry on. Ask only when the choice would be hard to undo.

## Milestones (in this order)

### M1: Foundation
- Migrations: `wizard_sessions`, `client_services`, the new `client_icp` columns (goal, cta,
  exclusions, company_size, confirmed fields), the new `campaigns` columns (origin,
  service_id, icp, sequence, start_date, rewrites_used, archived_at, cloned_from_id),
  `clients.wizard_enabled`, the status changes (`scheduled`, `archived`, no more
  `pending_review`) and the data migration for existing rows. RLS and pgTAP tests, including
  "client A cannot read client B's wizard session".
- Entry points, all behind `wizard_enabled`:
  - a welcome for clients with no campaigns (Start wizard / Create manually);
  - on the Campaigns page header: **New campaign** (opens the wizard), **Find new campaigns**,
    **Create manually** (the existing modal).
- Wizard route `/app/campaigns/wizard` with three steps, Back / Continue / Skip, autosave to
  `wizard_sessions` on every change (debounced), and "Continue where you left off / Start
  again" when a session exists.
- The existing New campaign modal writes `origin = 'manual'` and the new fields.

### M2: Screens 1 and 2
- Edge function `supabase/functions/wizard-ai` with action `analyze`. It is called by a
  logged-in client (check the session and that `wizard_enabled` is on) and rate-limited per
  client. It does two things:
  - **Website:** normalise the URL; fetch public http/https only (block private, loopback
    and link-local addresses, and redirects to them); cap size and time; strip the page to
    text; treat that text as data, never as instructions.
  - **No website:** use the typed description instead.

  It sends one Gemini call for a structured profile (business, services, business types,
  roles, area, goal suggestions), with every field marked `website` or `guessed`, and saves
  to `client_icp` / `client_services` / `client_website_enrichment`. Reuse the WF9 prompt
  ideas where helpful. The Gemini key goes in `supabase/functions/.env.local` and nowhere
  else. Tests cover the URL guard and the response parsing with sample pages; no live AI in
  tests.
- Error results the UI handles: `site_unreachable`, `site_thin`, `ai_failed` (one automatic
  retry first), `rate_limited`.
- Screen 1 shows truthful progress lines while waiting, the no-website form, and each error
  message from the plan's edge-case tables (section 2), keeping what the user typed.
- Screen 2: five sections with existing inputs; "Please check" tags until a field is
  touched; Continue disabled until name, one service, one business type, an area and a goal
  are set, naming what's missing. Returning users and Find new campaigns start here with the
  saved profile.

### M3: Screen 3 and drafts
- `wizard-ai` action `ideas`: profile in, one to five distinct B2B campaign ideas out, each
  with name, target, reason, fit label, `search_queries` and `target_areas`. Never pad.
  Consumer-facing businesses get B2B angles only, or none. Drop ideas that duplicate an
  existing campaign of the client (and say which); trim every idea to
  `validate_campaign_inputs` and the client's `max_campaigns` / monthly prospect limit.
- Prospect estimate: from this client's (or similar) past scrape yields in `raw_scrapes` /
  `last_scrape_summary` per term and area, falling back to a default range capped at
  `max_results`. Implement it as a pure, tested function.
- `estimate_campaign_cost` as decided above, with pgTAP tests (free launches left, none left
  with credits, none left without credits).
- Screen 3 cards (keyboard-selectable, with `aria-pressed`), Regenerate, Add my own idea,
  ← Edit business info, the "nothing fits" state, and the "your changes affect the ideas,
  refresh?" prompt when the profile changed.
- `wizard-ai` action `sequence`: four emails per idea, using only placeholders that WF2 can
  fill.
- Database function `create_wizard_drafts(session_id, idea_ids)`: idempotent (a double
  click or two tabs never makes duplicates). It creates one `campaigns` row per idea, with
  `origin = 'wizard'`, the ICP, search inputs, areas and the four-email template, and charges
  nothing. Then go to Campaigns with the new drafts highlighted.

### M4: Editor and launch
- Campaign editor for any campaign (wizard or manual), with four tabs:
  1. **Targeting:** service, business types, roles, exclusions, areas, start date, max
     results, validated by `campaignLimits`.
  2. **Emails:** the four emails, editable, with Regenerate per email and for the whole
     sequence (`wizard-ai` action `rewrite`), counting toward 3 free rewrites; at 0 the
     button is disabled with a short note. Manual edits are always free.
  3. **Cadence:** today's rule, read-only.
  4. **Launch:** the checklist (no blank subject or body, sender mailbox ready via
     `client_mailbox_ready`, search inputs valid, client limits), the estimate from
     `estimate_campaign_cost`, and Launch through the existing gate. Seasonal campaigns with
     a future start date stay `scheduled` until that date.
- Unsaved-changes guard on tab switch and leaving (reuse `app/src/lib/confirmDiscard.ts`).
- Edits to live campaigns change only emails not yet written; log each edit in `audit_logs`.
- Detail modal actions: pause / resume, clone (a new draft), archive / reactivate.
- Launch all from the Campaigns page for the selected drafts, with a per-campaign result.
- Locally the launch gate isn't reachable (n8n is blocked). For local end-to-end runs, use a
  sandbox client and the existing database-side sandbox simulation (`simulate_sandbox_discovery`
  and friends), behind the same "launch" function the UI calls, so the UI code path is the one
  production will use. Explain how you did this.

### M5: Emails follow the template
- Extract the WF2 (first email) and WF5 (follow-up) prompt-building logic into `n8n/code/`
  files with tests. When the campaign has a template, the prompt tells the AI to personalise
  that template for the prospect (name, business, details from their website) without
  changing the offer or adding claims. Without a template, keep today's prompt exactly.
- You can't deploy to n8n from here. Give me the exact node(s) and code to paste into the
  `-dev` copies of WF2 and WF5, and a short test checklist for the sandbox (`docs/SANDBOX.md`).

### M6: End-to-end check and docs
- Run the whole path locally on a sandbox client:
  1. wizard (with and without a website)
  2. drafts
  3. edit
  4. launch and Launch all
  5. simulated discovery
  6. prospects
  7. emails waiting in Approvals
- Fix what breaks.
- Add the wizard cases to `docs/SANDBOX-TESTS.md` and `docs/REGRESSION-TESTING-PLAN.md`, and
  add short user help for the wizard in the in-app docs if there's a natural place.
- Final summary: everything built, all test results, the n8n changes I need to make by hand,
  and what's left for the later pricing project.

Start with M1. Before writing code, give me a short plan for M1 (files, migrations, tests) and
wait for my OK.
