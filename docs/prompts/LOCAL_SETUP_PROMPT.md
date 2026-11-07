# Prompt 1: set up local development with a nightly copy of the live database

Paste everything below the line into Claude Code, opened in your local copy of the
`shorty-harris` repository. Run it once. Prompt 2 (`CAMPAIGN_WIZARD_BUILD_PROMPT.md`) builds
the wizard afterwards.

---

I want to develop Shorty Harris on this computer again. I worked on this local copy until
early autumn, then moved to cloud sessions, so this copy is out of date. Everything since then
is on GitHub. I want a local setup that:

1. **keeps whatever is in this local copy safe, without pushing it anywhere**,
2. brings the code up to date with GitHub,
3. runs its own local Supabase that is refreshed **every night** from the live database, so I
   test against the same schema and data as production,
4. can never change, email from, or trigger anything in production.

Read `README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SANDBOX.md`,
`supabase/tests/README.md` and `scripts/db/*.sh` first.

## Hard rules for this whole setup (and every session after it)

- **Never `git push`**, to any remote or branch, unless I ask for it in that message. Never
  force anything. Never delete a branch.
- **Never write to the live Supabase project** (`ernbmxvdtmbvzqmhljsw`). Nothing that runs
  migrations, `supabase db push`, `supabase link` followed by a push, SQL writes, or
  edge-function deploys against it. The only allowed use of the live database is a read-only
  `pg_dump`.
- **Never call live n8n** (`https://n8n.shortyharris.com/...`) from the local app or the local
  database. Those workflows write to the live database and send real email.
- Secrets (live database URL and password, keys) go only in gitignored files. Never print them
  in full, and never commit them.
- The live data contains real client and prospect personal data (names, emails, phone
  numbers). Dumps stay on this computer in a gitignored folder and are never copied anywhere
  else.
- If any step needs something you can't do safely, stop and ask me.

## Step 1: protect what is local, then update the code

1. Show me the local state: current branch, `git status` (including untracked files), local
   commits not on `origin`, stashes, and local branches. Don't change anything yet.
2. Make a local backup branch named `local-backup-YYYY-MM-DD` from the current state and
   commit every uncommitted and untracked change onto it (but **not** `.env*` files or
   dumps; list those for me instead). Do not push it.
3. Show me the backup branch's log so I can confirm it holds everything. **Wait for me to say
   OK** before going on.
4. `git fetch origin`. Create a local working branch `wizard-local` from `origin/main`.
5. Bring in the planning documents from the cloud branch without merging it:
   `git checkout origin/claude/relaxed-ritchie-4ltpdn -- docs/CAMPAIGN_WIZARD_BUILD_PLAN.md docs/prompts`
   and commit that locally on `wizard-local`.
6. Tell me if anything in the backup branch looks like work that isn't on GitHub, so I can
   decide later whether to keep it. Don't merge it.

## Step 2: tools

Check, and tell me how to install whatever is missing for my operating system:
Node 22 (what CI uses), Docker Desktop (running), the Supabase CLI (the repo pins
`supabase@3.0.0` through `npx`), `psql` and `pg_dump` **at the same major version as the live
Postgres (17)**, and `pg_prove` for the database tests. Then run `npm install` at the repo root
(it installs `app/` too).

Confirm the existing checks pass on `wizard-local` before anything else:
`cd app && npx tsc -b && npx vitest run && npx eslint .`, then `scripts/db/test.sh`.
Report the results honestly, including failures.

## Step 3: a separate local Supabase for development

`scripts/db/test.sh` uses its own stack in `scripts/db/stack` on port 54322 and **resets it on
every run**. The development copy must not share it.

- Create `scripts/local/stack/` with its own `supabase/config.toml`: a different `project_id`
  (`shorty-harris-local`) and different ports (API 55321, DB 55322, Studio 55323, and so on), so
  both stacks can run at the same time.
- Enable what the app needs locally: Postgres, auth, PostgREST, realtime, storage, Studio,
  edge runtime and the local mail catcher (so any auth email lands there, not in a real inbox).
- Add `scripts/local/start.sh` and `scripts/local/stop.sh` (and `.ps1` versions if I'm on
  Windows).

## Step 4: nightly copy of the live database

Create `scripts/local/sync-live-db.sh` (plus a `.ps1` on Windows) that:

1. Reads `LIVE_DB_URL` from `scripts/local/.env.sync` (gitignored, created from a committed
   `scripts/local/.env.sync.example`). Ask me for the connection string; I'll take it from
   Supabase → Project Settings → Database, session pooler. Suggest I create a read-only database
   role for this and give me the SQL to run myself in the Supabase SQL editor. You don't run
   it.
2. Refuses to run if the **target** URL contains `supabase.co` or `supabase.com`, the same
   guard as `scripts/db/build-test-db.sh`.
3. Dumps from live with `pg_dump` (read-only):
   - the `public` schema, schema and data, **keeping grants, RLS policies, functions and
     triggers** (Supabase's `anon` / `authenticated` grants matter);
   - data only for `auth.users` and `auth.identities`, so the real logins work locally with
     the same passwords;
   - optionally without the data of big log tables (`debug_logs`, `api_request_logs`,
     `error_logs`, `docs_embeddings`). Ask me.
   - **not** the `cron` schema or pg_cron jobs, so live schedules never run locally.
4. Saves the dump to `scripts/local/dumps/` (gitignored), keeps the last 3, and writes a log to
   `scripts/local/logs/`.
5. Restores into the local development stack only: drops and recreates `public`, loads the
   dump, replaces the local `auth.users` / `auth.identities` rows.
6. **Neutralises everything that could reach production from the local database**:
   - find every function and trigger that calls `net.http_post`, `net.http_get`,
     `supabase_functions.http_request` or contains `n8n.shortyharris.com` (for example
     `sandbox_fire`), and replace it locally with a version that only logs a notice;
   - make sure no `cron` jobs exist locally;
   - list everything it neutralised in the log, so a new outbound call added later is
     noticed.
7. Applies the repo's migrations that are **newer than the live database's latest applied
   migration** (compare `supabase/migrations/` with live's
   `supabase_migrations.schema_migrations`), so local work in progress survives each nightly
   refresh. If one fails, keep the restored copy, log the failure, and stop.
8. Runs quick checks: row counts of the main tables against live, RLS enabled on every
   `public` table, one known admin and one known client profile present. It writes a summary
   line to the log.
9. If Docker isn't running, it logs that and exits cleanly. It never half-restores.

Also run `git fetch origin` in that nightly job (fetch only, never merge or pull), and log how
many commits `origin/main` is ahead of `wizard-local`, so I see when GitHub has moved.

Schedule it nightly at 02:30 local time with the right tool for my system (cron or launchd on
macOS/Linux, Task Scheduler on Windows). Show me how to run it by hand and how to turn the
schedule off. Run it once now while I watch, and show me the log.

## Step 5: point the local app at the local stack, not production

1. Create `app/.env.local` (gitignored) with the local stack's URL and anon key, and
   `supabase/functions/.env.local` for `supabase functions serve`.
2. The app has n8n webhook URLs hard-coded in `app/src/lib/scrapeEnqueue.ts`,
   `app/src/screens/client/Billing.tsx`, `app/src/screens/admin/Clients.tsx`,
   `app/src/screens/admin/Prospects.tsx` and `app/src/screens/admin/Blog.tsx`. Move them behind
   one setting, `VITE_N8N_BASE_URL`, whose default stays the live address so production
   behaves exactly as now. In `app/.env.local`, leave it empty. With it empty, those buttons
   show "Not available in local development" instead of calling anything. Add a vitest test for
   that. Commit this on `wizard-local` (locally only).
3. Start the app (`npm run dev`), log in as one admin and one client from the synced data, and
   confirm in the browser's network tab that nothing goes to `supabase.co` or
   `n8n.shortyharris.com`. Show me.

## Step 6: write it down

Add `docs/LOCAL_DEVELOPMENT.md`: how the two local stacks differ, how to start and stop them,
the nightly sync and its log, how to re-run it by hand, what is neutralised, and the hard rules
above. Commit it on `wizard-local` locally.

Finish with a short report: what was backed up, what is installed, test results, the first
sync's log summary, and anything you couldn't do.
