# Campaign Wizard: what was built, and how to release it

Branch `claude/relaxed-ritchie-4ltpdn` (draft pull request #12), updated November 8, 2026. The
plan and its decisions are in `docs/CAMPAIGN_WIZARD_BUILD_PLAN.md`. Tests to run by hand:
`docs/CAMPAIGN_WIZARD_TESTS.md`.

**Live status (Nov 8):** the first three database migrations are applied and `wizard-ai` is
deployed to the live project. The app changes reach users only when this branch is merged and
deployed (until then, only on the preview link). The wizard is **on for every client** once
released: no admin has to tick anything (see "Releasing it").

## What every client gets

1. **Campaigns page.**
   - One **+ New campaign** button. It asks how to start: **Find campaigns for me**
     (the wizard, recommended) or **Set it up myself** (the existing form).
   - Under the title, both limits in words: "1 of 3 campaigns · 0 of 5 launches used this month".
   - An unfinished wizard setup shows as a quiet note with **Continue** / **Discard**. The wizard
     itself always starts fresh, filled from the saved business profile.
   - New drafts are listed with **Review emails**, plus **Launch all**.
2. **Step 1, your business.** The AI reads the public website. Addresses that aren't public
   websites are refused. If the site won't load, the client can **Describe my business** instead.
3. **Step 2, check the details,** one question per page: business, services (with seasonal
   months), who buys, area (place suggestions as you type, or a radius on a map) and goal.
   AI guesses are marked to check; nothing the client typed is overwritten. The last page saves
   this as the client's profile (the same profile Targeting uses).
4. **Step 3, pick campaigns.** One to five ideas with est. businesses, est. hot leads ("Every
   campaign varies") and the launch cost under **today's pricing** (free launches, then 1
   credit). Duplicates of running campaigns are skipped and the campaign limit is respected.
   Creating the drafts writes each one's four emails; it is free and a double click never
   duplicates.
5. **Campaign window** (a pop-up, for wizard and manual campaigns alike), with tabs:
   - **Emails:** the four-email template, each with when it goes out (first email, then 3, 5
     and 7 business days later), and 3 free AI rewrites per campaign.
   - **Who & where:** name, types of business, areas; size, language and start date under
     "More settings".
   - **Prospects** (once launched or once businesses are found): the businesses found, with
     their status, and a search box.
   - **Launch** / **Status:** the estimate, a checklist with **Fix** links, and Launch through
     the normal launch gate. A future start date schedules it instead.
   - The ⋮ menu: pause, resume, archive, restore, cancel the start date, make a copy, delete.
6. **No staff approval.** Campaigns go live when the client launches them. Clients still approve
   each email in Approvals, as today.
7. Light and dark mode throughout.

Admins have a **Campaign wizard** checkbox on the client edit form, ticked by default. Unticking
it hides the wizard for that client and sends their campaigns back through admin review.

## What changes for everyone

- Campaigns created by hand no longer wait for admin review (the wizard switch also covers
  them), unless an admin unticks **Campaign wizard** for that client.
- Clients may save a campaign as a **draft**; campaigns can be **scheduled** and **archived**.
- Edits to a running campaign are written to the audit log.

## Releasing it

Do these in order.

1. **Database.**
   - ✅ Done Nov 7: `20261107182332_campaign_wizard_foundation.sql`,
     `20261107182447_campaign_wizard_drafts_and_launch.sql`,
     `20261107182520_campaign_wizard_trigger_fn_not_callable.sql`. The second one schedules an
     hourly pg_cron job, `release-scheduled-campaigns`, which sends a scheduled campaign to
     `wf0-enqueue` on its start date.
   - **Any time (safe before merge):** apply `20261114130000_campaign_wizard_sandbox_gate.sql`.
     It adds the rollout switch (`wizard_settings.sandbox_only`, on = sandbox accounts only) and
     `wizard_on_for()`, which the app, `wizard-ai` and the auto-approve trigger all use. It also
     turns the per-client switch on for everyone, which is safe because the rollout switch keeps
     real clients out (and their campaigns in staff review) until an admin turns sandbox-only
     off. It replaces `20261108120000_campaign_wizard_for_everyone.sql`, which was never applied.
     Then rename the file to the version the database records (`supabase/migrations/README.md`).
2. **Edge function.** ✅ Done Nov 7: `supabase/functions/wizard-ai` (imports `../_shared/wizard.ts`),
   using the existing `GEMINI_API_KEY`. Do **not** set `WIZARD_AI_MOCK` in production.
   Redeploy it with the sandbox gate migration: it now asks `wizard_on_for()` instead of reading
   `clients.wizard_enabled`.
3. **App.** Merge pull request #12 (Release checks must be green) and deploy as usual. Check that
   `VITE_MAPBOX_TOKEN` is set in Vercel production, for place suggestions.
4. **n8n (manual).** Follow "Campaign Wizard: emails follow the campaign template" in
   `n8n/README.md`, in the `-dev` workflows first. Until then, wizard campaigns work but their
   emails are written from scratch rather than from the template.
5. **Check.** Run `docs/CAMPAIGN_WIZARD_TESTS.md` (K1-K27) on production with a sandbox client.
6. **Go live for everyone.** Admin > Campaigns > "Campaign wizard: sandbox accounts only" - turn
   the switch off. It takes effect at once, no deploy; turn it back on to return to sandbox-only.

Settings an admin can change without a deploy (`wizard_settings` table):
- `free_rewrites_per_campaign` (3)
- `hot_rate_lo` / `hot_rate_hi` (0.5% / 1.0%)
- `free_launches_per_month` (5, shown on the cards; the gate's own limit is in n8n)
- the default prospect range per search pair
- `ai_calls_per_hour` (30)

## Tests

| Check | Result |
| --- | --- |
| Release checks on pull request #12 (GitHub) | Pass (type check, tests, build, lint, database tests) |
| Database (pgTAP, `scripts/db/test.sh`) | 265 pass, 81 of them for the wizard (`11_campaign_wizard`, `12_campaign_wizard_launch`) |
| App (vitest) | 530 pass, including the wizard logic, place suggestions, the AI function's shared logic and the new n8n node |
| Type check, lint, production build | Pass (lint: one older warning in `AuthProvider.tsx`) |
| Edge function | Type-checks with Deno 2.1.4. It ran locally in sample mode, with sign-in, the on/off check, rate limit and logging working. |
| Browser, end to end (local Supabase, sample AI, launch gate stubbed) | Pass, no console or network errors, nothing sent to live Supabase or n8n. The run covered: unreachable site → real site → step 2 → ideas → own idea → 3 drafts → Launch all (one launched, one scheduled) → editor (rewrite, blank-subject check, save, ready) → Find new campaigns → phone width. |

## Not done, or worth checking in review

- **Not tested with the real Gemini model or real websites.** Everything ran on sample output.
  The prompts are in `supabase/functions/_shared/wizard.ts`; review them, and expect to tune
  them after release.
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
