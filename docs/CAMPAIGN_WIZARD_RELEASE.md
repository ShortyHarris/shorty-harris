# Campaign Wizard: what was built, and how to switch it on

Branch `claude/relaxed-ritchie-4ltpdn`, November 7, 2026. **Nothing is live yet.** The plan
and its decisions are in `docs/CAMPAIGN_WIZARD_BUILD_PLAN.md`.

## What a pilot client gets

1. **Campaigns page.** **+ New campaign** opens the wizard. Next to it: **Find new campaigns**,
   **Create manually** (the existing form) and **Launch all (N)** when there are drafts. A
   client with no campaigns sees "Start the campaign wizard".
2. **Step 1, your website.** The AI reads the public website. Addresses that aren't public
   websites are refused. If the site won't load, the client gets **Describe my business**
   instead. "I don't have a website" opens a short form, and the AI works from that.
3. **Step 2, check what we found.**
   - Business, services (with seasonal months), types of business to reach, roles, company
     size, exclusions, area and goal.
   - Everything is editable. AI guesses carry **Please check** until touched. Nothing the client
     typed is ever overwritten.
   - Continuing saves this as the client's profile (the same profile Targeting uses).
4. **Step 3, pick your campaigns.**
   - One to five ideas. Each card shows est. prospects, est. hot leads ("Every campaign
     varies") and a launch line under **today's pricing** ("Free launch (3 of 5 left this
     month)" or "1 credit to launch"). No dollars.
   - Ideas that duplicate a running campaign are skipped and named. The client's campaign limit
     is respected.
   - The client can also: **Regenerate ideas**, **Add my own idea**, and **Refresh** when the
     profile changed.
   - **Create N drafts** writes each draft's four emails and creates the drafts. This is free,
     and a double click never duplicates.
5. **Campaign editor**, for wizard and manual campaigns alike:
   - **Targeting:** search terms, areas, maximum businesses, language, start date.
   - **Emails:** the four-email template, with 3 free AI rewrites per campaign and a counter.
   - **Cadence:** today's rule (3, 5, 7 business days), read-only.
   - **Launch:** the estimate, a checklist with **Fix** links, and Launch through the normal
     launch gate. A future start date schedules the campaign instead.
   - **Actions:** pause, resume, archive, restore, cancel the start date, make a copy.
   - Unsaved changes are protected.
6. **No staff approval.** Pilot clients' campaigns skip admin review. Clients still approve each
   email in Approvals, as today.

Admins get a **Campaign wizard (pilot)** checkbox on the client edit form.

## What changes for clients who are not in the pilot

Nothing, apart from three things that apply to everyone:
- Clients may now save a campaign as a **draft** (before, only "in review" could be inserted).
- Campaigns can now have the statuses **scheduled** and **archived**.
- Edits to a running campaign are now written to the audit log.

## Switching it on

Do these in order. Test against the sandbox first (`docs/SANDBOX.md`).

1. **Database.** Apply, in order:
   - `supabase/migrations/20261107170000_campaign_wizard_foundation.sql`
   - `supabase/migrations/20261107190000_campaign_wizard_drafts_and_launch.sql`

   The second one schedules an hourly pg_cron job, `release-scheduled-campaigns`. When a
   scheduled campaign's start date arrives, the job sends it to `wf0-enqueue`.
2. **Edge function.** Deploy `supabase/functions/wizard-ai` (it imports `../_shared/wizard.ts`).
   - It uses the `GEMINI_API_KEY` secret that docs-search already uses.
   - Do **not** set `WIZARD_AI_MOCK` in production; that returns sample data.
3. **App.** Merge and deploy as usual.
4. **n8n (manual).** Follow "Campaign Wizard: emails follow the campaign template" in
   `n8n/README.md`, in the `-dev` workflows first. Until this is done, wizard campaigns still
   work, but their emails are written from scratch rather than from the template.
5. **Pilot.** Tick **Campaign wizard (pilot)** for Mountains Mowing and one specialist B2B
   client. Run sandbox tests K1–K18 (`docs/SANDBOX-TESTS.md`).

Settings an admin can change without a deploy (`wizard_settings` table):
- `free_rewrites_per_campaign` (3)
- `hot_rate_lo` / `hot_rate_hi` (0.5% / 1.0%)
- `free_launches_per_month` (5, shown on the cards; the gate's own limit is in n8n)
- the default prospect range per search pair
- `ai_calls_per_hour` (30)

## Tests

| Check | Result |
| --- | --- |
| Database (pgTAP, `scripts/db/test.sh`) | 263 pass, 79 of them new (`11_campaign_wizard`, `12_campaign_wizard_launch`) |
| App (vitest) | 521 pass, including the wizard logic, the AI function's shared logic and the new n8n node |
| Type check, lint, production build | Pass (lint: one older warning in `AuthProvider.tsx`) |
| Edge function | Type-checks with Deno 2.1.4. It ran locally in sample mode, with sign-in, pilot check, rate limit and logging working. |
| Browser, end to end (local Supabase, sample AI, launch gate stubbed) | Pass, no console or network errors, nothing sent to live Supabase or n8n. The run covered: unreachable site → real site → step 2 → ideas → own idea → 3 drafts → Launch all (one launched, one scheduled) → editor (rewrite, blank-subject check, save, ready) → Find new campaigns → phone width. |

## Not done, or worth checking in review

- **Not tested with the real Gemini model or real websites.** Everything ran on sample output.
  The prompts are in `supabase/functions/_shared/wizard.ts`; review them, and expect to tune
  them during the pilot.
- **Not tested with the real launch gate (n8n WF0a).** The browser test stubbed it.
- **The n8n template step (M5)** is code plus instructions; someone has to wire it in n8n.
- **Prospect estimates** use past campaigns' results (this client's, then everyone's), else a
  default range. They will be rough until there is more history.
- **The "5 free launches" on the cards** come from `wizard_settings`. The real limit is
  enforced by WF0a in n8n. If those two ever differ, the cards will be wrong.
- **Funnel analytics events** (PRD section 10) were not added.
- **Local development** points the app at a local Supabase with `VITE_LOCAL_SUPABASE_URL` /
  `VITE_LOCAL_SUPABASE_ANON_KEY` (dev mode only). A few other live addresses are still
  hard-coded (see `docs/prompts/LOCAL_SETUP_PROMPT.md`, step 5).
- **The new pricing** (PRD section 8) is a separate, later project. It only needs to change
  `estimate_campaign_cost` and the launch gate.
