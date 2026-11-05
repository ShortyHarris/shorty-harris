# Automated regression testing: plan

Response to specification section 3, "Automated Regression Testing". It covers where we stand
today, the tools and structure I recommend, the release workflow, the first tests to write (with
the overdue-approval scenario from 3.5 in full), the standards we adopt, and a phased start.

Short version: we keep **Vitest** for the app, add **pgTAP** database tests that run against a
throwaway copy of the database on every pull request, test the **n8n code** straight from the
exported workflows, and run **end-to-end** flows two ways: **Playwright** against each preview
deployment, and a **nightly pipeline run** inside a dedicated sandbox account. Every pull request
must pass the checks before it can merge, and merging is what deploys.

---

## 1. Where we stand today (3.11: what exists)

| Area | Today |
| --- | --- |
| App (React) | Vitest + Testing Library: 49 test files, about 450 tests. Mostly screen copy and status logic. Run by hand; **not run automatically** on pull requests. Lint has 5 known errors. |
| Database rules | Most critical business rules live here: the send gate (`sendable_messages`), business days with holidays (`add_business_days`, `is_business_day`), approvals and reminders, unsubscribe suppression, send retries, the approvals schedule, permissions (RLS). **No automated tests.** |
| n8n workflows | Warm-up, sending hours and batching (WF2.5), sending and follow-up scheduling (WF3), reply classification (WF4), follow-up writing (WF5), hot leads (WF6). **No automated tests, and not in git** (export script exists, not yet run). |
| Test database | **Cannot be built from the repo.** The migration history starts on 2026-06-30, but the core tables (clients, prospects, messages, campaigns) were created before that, outside migrations. A few local migration file names also differ from the versions recorded live. |
| Sandbox | A sandbox account inside production with time travel, simulated replies and safe email addresses. Usable for end-to-end tests. |
| Release | Merging to `main` deploys the app (Vercel). Database and n8n changes are applied live by hand. Nothing blocks a merge. |

**Issues found while preparing this plan** (each becomes one of the first regression tests):
1. **Follow-up dates could disagree about holidays.** *Fixed 2026-11-05: the database now
   recomputes every new follow-up's due date with the send gate's own rule
   (`20261105070000_follow_up_due_matches_send_gate.sql`).* Before the fix: WF3 sets a follow-up's due date as 3/5/7
   business days *without* holidays; the send gate requires 3/5/7 business days *with* the
   client country's holidays. Around a holiday the follow-up is written for a day it is not
   allowed to send.
2. **The cadence is hard-coded in two places** (WF3 code and the send gate). A change to one
   without the other would break follow-ups silently.
3. **The cadence is not configurable per campaign** (fixed 3/5/7 business days), so "change to
   campaign cadence after approvals" (3.5) does not apply yet; its test is listed for when it does.
4. Recent incidents these tests would have caught: the Approvals page failing for every client
   (a missing database permission), and emails silently marked failed when Gmail was disconnected.

## 2. Why three kinds of test, and which tools (3.3, 3.11: framework and structure)

Our logic runs in three places (the React app, Postgres, n8n), so one tool cannot test it all.
Each layer uses the tool native to where the code runs:

| Layer (spec 3.3) | What it checks | Tool | Runs |
| --- | --- | --- | --- |
| **Unit** | One function or rule in isolation: follow-up dates, business days, approval age, unsubscribe matching, warm-up spacing, wording. | **Vitest** for TypeScript and for **n8n Code nodes** (the test loads the node's code from the exported workflow file and runs it on sample data, so the test checks the code that actually runs). **pgTAP** for pure SQL functions. | Every pull request, in seconds |
| **Integration** | Components together, mostly inside the database: approving puts an email in the send queue, rejecting keeps it out, an unsubscribe removes queued and scheduled emails, a late send moves later follow-ups, permissions per role. | **pgTAP** run by `supabase test db` against a **fresh local database** built from the repo (Docker in GitHub Actions). Tests act as real roles (client user, admin, backend) so permission mistakes fail the test. | Every pull request, about 2-4 minutes |
| **End-to-end** | Whole user workflows: create a campaign, generate an email, approve, confirm it sent; unsubscribe stops outreach; a sequence's follow-ups arrive at the right intervals; an overdue approval reschedules the rest. | Two complementary runners: **Playwright** drives the real app on each pull request's **Vercel preview**, logged in as a dedicated E2E sandbox account (screens, approvals, dates shown). A **nightly pipeline run** (an n8n workflow, "WF99") resets an E2E sandbox account and drives the real workflows (Gemini writing, Gmail sending to the sandbox's own address, reply handling, follow-ups via time travel), then checks every result. | Playwright: every pull request. Pipeline: nightly and on demand |

**Controlling time in tests.** Rules depend on "now" (business days, sending hours, overdue
approvals). Database tests create rows with backdated timestamps ("approved 30 days ago") and
run the real functions, the same technique as sandbox time travel. n8n code tests pass a fixed
clock. End-to-end tests use the sandbox clock (hours and days). No production clock is faked.

**Safety.** Unit and integration tests never touch production: they run on a throwaway local
database. End-to-end tests only use sandbox accounts, whose emails can only reach their own
mailbox (enforced in the database).

## 3. Development and release workflow (3.6)

```
Developer opens a pull request
  -> Automated checks (required): lint, type check, Vitest, n8n code tests, pgTAP on a fresh database
  -> Vercel preview deploys -> Playwright end-to-end smoke tests against the preview
  -> Sandbox validation: manual checks from docs/SANDBOX-TESTS.md where the change needs them
  -> Review: failures fixed in the same pull request
  -> Merge (blocked unless every required check is green) -> production deploy
  -> Nightly: full pipeline run in the E2E sandbox; failures alert the team
```

- **Blocking releases.** GitHub branch protection on `main` makes the checks required, so a red
  check stops the merge and therefore the deploy. **Exception:** a repository admin can override
  only with an `release-exception` label and a written reason in the pull request, so exceptions
  are visible and deliberate.
- **Database changes.** A migration goes in the pull request as a file first; the pgTAP run
  applies it to the fresh database and tests it there. It is applied to production only after
  merge, from the same file. (Later, Supabase's GitHub integration can apply it automatically.)
- **n8n changes.** Made in a `-dev` copy first (as in `SANDBOX.md`), exported to `n8n/` in the
  pull request, and tested by the n8n code tests before going live.

## 4. Reports and visibility (3.7)

Starting point, no dashboard needed:
- **Each pull request** shows one check per suite (green or red). The run's summary page lists
  every test that ran, passed and failed, with the failure message, and a final line "Release
  checks: passed / failed". Test results are also kept as downloadable JUnit files.
- **Nightly pipeline run** writes each result to a `test_runs` table and emails the team on any
  failure (reusing the WF21 alert path).
- **Later enhancements:** an admin "Tests" tab in Monitoring showing recent runs, and a **Run
  tests** button for admins (it triggers the GitHub workflow or WF99 on demand).

## 5. Initial coverage (3.4)

P1 = written first (highest customer risk), P2 = next, P3 = after.

| Area (3.4) | Key checks | Layer | Priority |
| --- | --- | --- | --- |
| Approvals | An email cannot send before approval; approving puts it in the queue; one approval per draft. | Integration | P1 |
| Rejected approvals | A rejected email never enters the queue and never sends. | Integration | P1 |
| Overdue approvals & sequence rescheduling | Section 6 in full. | Unit + Integration + E2E | P1 |
| Unsubscribe handling | An unsubscribe (link, reply or admin) blocks all queued and future emails to that address, across campaigns; footer text in our own email is not treated as an opt-out. | Unit + Integration + E2E | P1 |
| Scheduling | Sending hours per client time zone, weekends, holidays, daily limit, warm-up limit and spacing, one-at-a-time while warming up, waiting for Gmail, retries. | Unit (WF2.5 code) + Integration | P1 |
| Authentication & permissions | Client sees only their own data; client cannot call admin or backend functions; every function the app calls is callable by the role that calls it (catches missing permissions like the Approvals outage). | Integration + Playwright | P1 |
| Follow-up automation | Follow-ups are due 3/5/7 business days after the previous send; WF3 and the send gate agree, including around holidays; no follow-up after a reply, bounce or unsubscribe. | Unit + Integration | P1 |
| Prospect replies | Each reply type (interested, question, not interested, unsubscribe, out of office, bounce) sets the right status, stops or continues the sequence, creates a hot lead and charges a credit only when it should. | Integration + E2E | P2 |
| Prospect management / CRM | Status changes (contacted, replied, hot lead, called, won, lost, bounced) update correctly and appear in Prospects and Results. | Integration + Playwright | P2 |
| Campaign creation | A campaign can be created, saved, edited and launched; launch limits apply. | Playwright + Integration | P2 |
| Email generation (existing AI) | A generated email has a subject, body, the prospect's name or business, the sender's details and the legal footer with an unsubscribe link; no unfilled placeholders. Checked structurally, not word for word. | E2E pipeline | P2 |
| Reporting | Sends, opens, replies, opt-outs and hot leads are counted correctly; sandbox accounts are excluded. | Integration | P3 |

The list grows with every feature (section 7).

## 6. Overdue approvals and sequence rescheduling (3.5)

**How it works today (design review, to be proven by the tests):**
- A first email has no fixed send time; once approved it joins the queue and goes out at the next
  allowed moment (sending hours, daily and warm-up limits).
- A follow-up's due date is only set **after** the email before it has actually been sent (send
  time + 3, 5 or 7 business days). The send gate also refuses a follow-up until the previous email
  was sent and the interval has passed. So overdue dates from the original plan never release
  emails, and nothing can go out "simultaneously".
- Exception to check: campaigns with **upfront sequences** have all follow-ups written in advance;
  the same gate must hold them back.

**Main scenario test (OA-1)**, run as an integration test and as a nightly end-to-end test:
1. Prospect with a first email awaiting approval for 30 days (and, for upfront sequences, follow-ups 1-3 already written).
2. Approve the first email.
3. Expect: it is in the send queue; no follow-up is in the queue.
4. Expect: it is sent at the next allowed time (inside sending hours, within limits), and only it.
5. After the send, expect: follow-up 1 is due exactly 3 business days after the **actual** send
   date (client country's holidays skipped), not after the original schedule.
6. Approve and send follow-up 1; expect follow-up 2 due 5 business days later; then follow-up 3 at 7.
7. Throughout: at most one email to the prospect per send cycle; approval is still required for each follow-up.
8. The Approvals page (approvals schedule) shows the recalculated dates.

**Variations** (each its own test):

| ID | Scenario | Expected |
| --- | --- | --- |
| OA-2 | Approval delayed by one business day | Same as OA-1; follow-ups based on the actual send date. |
| OA-3 | Approved outside sending hours | Waits until the next sending window, then sends; follow-ups count from that send. |
| OA-4 | Approved on a weekend or public holiday | Sends on the next business day in the client's country; follow-up dates skip holidays (also catches issue 1 in section 1). |
| OA-5 | Overdue follow-up when the first email was already sent | Sends at the next allowed time; the following follow-up is recalculated from this send. |
| OA-6 | Several follow-ups awaiting approval at once (upfront sequence) | Approving all of them releases only the next one; each later one waits for its interval after the previous send. |
| OA-7 | Cadence changed after approvals | Not applicable until per-campaign cadence exists; test added with that feature. Meanwhile a test asserts WF3 and the send gate use the same cadence. |
| OA-8 | Prospect unsubscribes while follow-ups are scheduled | Scheduled follow-ups are cancelled, approved ones never send, nothing further is written. |
| OA-9 | Daily limit already reached when the overdue email is approved | Waits for the next day's allowance; the queue order puts due follow-ups first. |
| OA-10 | Gmail disconnected when approved | Email waits ("Waiting for Gmail"), sends after reconnecting, follow-ups count from that send. |

## 7. Testing as a development standard (3.8)

Adopted rules, written into the pull request template and `CONTRIBUTING`:
1. **A feature is not done until it has tests** at the right layer (usually integration for rules, Playwright for screens).
2. **Every bug fix starts with a failing test** that reproduces the bug, then the fix makes it pass.
3. **All required checks run on every pull request**; no merging on red except a labelled, explained exception.
4. **Critical workflows first**: sending, approvals, unsubscribe, follow-ups, billing, permissions.
5. **No skipping tests to get green.** A flaky test is fixed or replaced within a week, with an owner.
6. **Test behaviour, not wording or layout**, so tests survive redesigns.

Keeping maintenance low (3.11):
- One shared set of **test helpers** (create a client, prospect, message, backdate it) so each test is a few lines.
- Database tests run inside a transaction that is rolled back, so tests never interfere with each other.
- The nightly pipeline run is deliberately small (a handful of flows); detail lives in fast integration tests.
- n8n code is tested from the exported file, so there is no duplicate copy of the logic to keep in sync.

## 8. Future BDR AI agent (3.9)

A separate suite in its own folder, sharing the sandbox and the same test runner:
- **Scenario tests** in a sandbox account: the agent gets a task (qualify these prospects, handle this reply) and the outcome is checked.
- **Hard rules** checked automatically every run: never sends without the required approval, never contacts an unsubscribed or blocked address, hands over to a human when required, uses Shorty Harris only through its permitted functions.
- **Decision quality** scored against a written rubric (qualification accuracy, tone, correct next step), using a fixed set of example prospects and replies with known good answers, plus an AI grader for open-ended text, reviewed by a person when scores drop.
- Results reported in the same way as the other suites.

## 9. Phased start (3.11: practical starting point)

| Phase | Work | Size |
| --- | --- | --- |
| **0. Foundations** | Commit a baseline schema of the live database so the repo can build a fresh database; reconcile the migration file names with the live history; export n8n workflows to git; GitHub Actions running lint, type check and the existing Vitest suite on every pull request; fix the 5 lint errors; branch protection on `main`; pull request template with the testing checklist. | Small |
| **1. Highest-risk rules** | pgTAP harness and helpers; P1 integration tests (approvals, rejections, unsubscribe, follow-up dates and holidays, permissions per role); the overdue-approval suite OA-1 to OA-10; n8n code tests for WF2.5 (sending hours, limits, warm-up spacing) and WF3 (follow-up dates); fix issue 1 (holidays) with its test. | Medium |
| **2. End-to-end** | Dedicated E2E sandbox account and mailbox; Playwright smoke tests on previews (login, approve, reject, Approvals dates, unsubscribe); nightly WF99 pipeline run with the `test_runs` table and failure email. | Medium |
| **3. Visibility and growth** | Admin Tests tab and Run tests button; P2/P3 coverage (replies, CRM, campaigns, AI output, reporting); BDR suite when that project starts. | Ongoing |

## 10. Progress

| Item | Status |
| --- | --- |
| Release checks on every pull request (type check, tests, build, lint with known errors recorded) | Done; required on `main` through the "Protect main" ruleset |
| Pull request template with the testing checklist | Done |
| n8n Code node logic in git (`n8n/code/`) with tests: WF2.5 sending hours, time zones, daily and warm-up limits, spacing, send order, sandbox clock; WF3 follow-up cadence | Done (22 tests) |
| Holiday mismatch between follow-up schedules and the send gate (issue 1) | Fixed |
| Full n8n workflow export | Needs the export script run from a machine that can reach n8n, with an API key |
| Database baseline so tests can build a fresh database | Next; needs a Supabase access token or database password |
| Clear the 24 recorded lint errors | Later |

## 11. Decisions and access needed

1. **Branch protection on `main`**: needs a GitHub repository admin to switch on required checks.
2. **Who may approve a `release-exception`** (suggest: the project owner only).
3. **Secrets for GitHub Actions**: a Supabase access token (only for reading the schema to refresh the baseline), and the E2E sandbox login for Playwright. Unit and integration tests need no production secrets.
4. **A dedicated E2E sandbox account and Gmail mailbox**, separate from people's own test sandboxes, so automated runs never reset someone's manual test.
5. **Cost**: the nightly pipeline run uses Gemini for a few emails (a few cents a night) and GitHub Actions minutes (within the free tier at our volume).
6. Whether database migrations should be **applied automatically on merge** later, or stay a manual, reviewed step.
