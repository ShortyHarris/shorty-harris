# Sandbox acceptance tests

Tests that prove the sandbox meets the "Sandbox / Testing Environment" specification. Each
test names the part of the spec it covers, what to do, and what you should see. Run them in
your own sandbox account, on the preview link for an unmerged change or on production after
merging.

**How to record results:** copy the table at the end, mark each test Pass / Fail, and for a
failure note what you saw (a screenshot helps). A failure is either a bug or a gap between the
spec and the build; both are worth reporting.

**Before you start**
- You are logged in as a sandbox account (red "Sandbox" banner at the top).
- Settings shows Gmail **connected** (your own Gmail, never a client's).
- Sandbox page > **Reset sandbox**.

Times below assume **real sending rules** (the default) unless a test says fast mode.

---

## A. Admin access and accounts (spec: admin access)

| ID | Do | Expected |
| --- | --- | --- |
| A1 | As admin: Clients > **+ New sandbox**, enter a tester name and email. | The account appears in the list with a red **Sandbox** badge; the tester gets a login invite. |
| A2 | As admin: open the sandbox with **View as client**, switch to edit mode, open the Sandbox page. | The same controls work for the admin as for the tester. |
| A3 | As admin: **View as client** on a **real** client. | No Sandbox page or sandbox banner; sandbox controls cannot be used on a real account (the server refuses them too). |

## B. Test data and reset (spec: test data, reset)

| ID | Do | Expected |
| --- | --- | --- |
| B1 | Sandbox page > **Reset sandbox**, time it. | Done in a few seconds: 20 test prospects, 10,000 credits, clock "same as real time". |
| B2 | Look at the prospects' email addresses. | All are your own Gmail with `+sbx-01` ... `+sbx-20`. |
| B3 | Do some tests (send, replies, advance time), then Reset again. | Everything is back to the B1 state, including the clock. |

## C. Emails only reach internal addresses (spec: email testing)

| ID | Do | Expected |
| --- | --- | --- |
| C1 | Run next step on a prospect until it sends (Write first email > Approve > Send it). | The email arrives in **your** Gmail within about a minute. |
| C2 | Check Gmail for anything sent to a real business from this account. | Nothing. Only `+sbx-` addresses receive mail. |
| C3 | Trigger a hot lead (D1). | The text message is logged, not sent; nothing arrives on any phone. |

## D. Simulated prospect activity (spec: unsubscribe, positive, negative, questions, no response, status changes)

Use a different prospect for each, after its first email has been sent.

| ID | Do | Expected |
| --- | --- | --- |
| D1 | Simulate reply > **Interested**. | Hot lead; 1 credit charged; appears in Hot Leads; no more follow-ups. |
| D2 | Simulate reply > **Question**. | Marked replied; follow-ups stop. |
| D3 | Simulate reply > **Not interested**. | Shows "Not interested"; appears under the "Replied: not interested" filter in Prospects. |
| D4 | Simulate reply > **Unsubscribe**. | "Unsubscribed: all emails blocked"; Run next step refuses; no further email to that address. |
| D5 | Simulate reply > **Out of office**. | Sequence continues; the next follow-up still comes. |
| D6 | Simulate reply > **Bounce**. | Marked bounced; no more emails; your mailbox is **not** paused. |
| D7 | **Real reply** from Gmail to a sandbox email: "Sounds good, can you call me tomorrow?" | Within about 5 minutes it becomes a hot lead. |
| D8 | **Real reply**: "Please stop emailing me". | Within about 5 minutes it is unsubscribed. |
| D9 | No response: send a first email, do nothing, advance time (E1). | Follow-ups are written on schedule (no-response path). |

## E. Scheduling, follow-ups and time (spec: cadence, overdue approvals, simulated passage of time)

| ID | Do | Expected |
| --- | --- | --- |
| E1 | Send a first email. Change time > **+3d** twice (or +7d). | On a weekday, a follow-up 1 draft appears in Approvals within a few minutes (3 business days after the first email). |
| E2 | Approve follow-up 1; let it send. Repeat for follow-ups 2 and 3, advancing time between them. | Each arrives in the same Gmail thread; gaps are 3, then 5, then 7 business days; after the third the sequence is finished. |
| E3 | Leave a follow-up draft unapproved, then **+7d**. | An approval reminder email arrives; Approvals shows the draft as overdue. |
| E4 | Approve the overdue draft from E3. | It sends; the next follow-up is scheduled from **this** send date, not the original one. |
| E5 | Change time > **+1h** and **+4h**. | The clock face and digital time move forward by that much; the message under the buttons states the new sandbox time. |
| E6 | Note: follow-up drafts are only written on weekdays (real calendar). | Time travel on a weekend shows its drafts on Monday. (Known limit, not a failure.) |

## F. Sending rules: warm-up, spacing, sending hours (production behaviour)

| ID | Do | Expected |
| --- | --- | --- |
| F1 | Approve 10 drafts in **Approvals** (not the Sandbox page). | Only up to 5 send today ("x of 5 emails sent today"). |
| F2 | Open **How sending works** on that line. | A pop-up shows the next email's expected time, about 58 min spacing (43 min to 1h 12m), sending hours, and how the limit grows (10, 20, 30, 40 a day by week). |
| F3 | After one sends, press **+1h**. | One more email sends within about a minute. Moving 2 hours still sends only **one**: warm-up never sends two at once. |
| F4 | Change time > **+7d**. | The limit becomes 10 a day; How sending works shows about 29 min spacing. |
| F5 | Move the sandbox clock past 17:00, then approve a draft. | It waits ("Outside sending hours"); the clock badge says outside sending hours. |
| F6 | Change time > **Jump to next 9am**. | Within about 2 minutes the waiting email sends. |
| F7 | Move the clock to a Saturday. | "Weekend: no sending"; nothing sends until Monday 9am on the sandbox clock. |
| F8 | Sending rules > **Switch to fast mode**. | Emails send within a minute or two at any hour, no spacing, up to 100 a day. Switch back to real rules afterwards. |
| F9 | Leave Approvals open while an email sends. | "x of 5 sent today" and the queue update by themselves within seconds, without a reload. |

## G. Gmail problems never lose an email

| ID | Do | Expected |
| --- | --- | --- |
| G1 | Settings > disconnect Gmail. | Approvals and the Sandbox page show **"Gmail isn't connected, so nothing can send"** with a Connect Gmail button (Gmail logo). |
| G2 | While disconnected, approve a draft. | Approval works; the email shows in Approvals > Blocked as **Waiting for Gmail**; nothing is marked failed. |
| G3 | While disconnected, try **Send it** on the Sandbox page. | The button is disabled ("Connect Gmail in Settings first"). |
| G4 | Reconnect Gmail. | Within about a minute the waiting email sends by itself (subject to warm-up and sending hours). |

## H. Billing and other screens (spec: production separation of paid services)

| ID | Do | Expected |
| --- | --- | --- |
| H1 | Billing > buy any pack. | No Stripe page; a "You're topped up!" celebration; credits go up. |
| H2 | Create a campaign and launch it. | Up to 8 made-up businesses appear and get first emails written. No real discovery runs. |
| H3 | Settings > clear the website. | Targeting shows the "no website" banner; adding it back removes it. |

## I. Production separation (spec: production separation)

| ID | Do | Expected |
| --- | --- | --- |
| I1 | As admin: open Analytics after running tests. | Your sandbox's sends, replies and opt-outs are **not** counted. |
| I2 | As admin: open the client list. | The sandbox is listed with a red Sandbox badge, separate from real clients. |
| I3 | Check that real clients' sending was unaffected during your test (admin view of any real client). | Their sent counts and queues behave as normal. |

## J. Layout (all screens)

| ID | Do | Expected |
| --- | --- | --- |
| J1 | Desktop: scroll Approvals with drafts waiting. | The sandbox and approvals banners stay pinned; the sidebar is not cut off. |
| J2 | Phone: Sandbox page, Change time pop-up, How sending works pop-up. | Everything fits, nothing overlaps, pop-ups close with X / Done / outside click. |

---

## K. Campaign Wizard (pilot)

Before you start: nothing to switch on. The wizard is on for every client by default; an admin
can switch it off per client (**Campaign wizard** on the client edit form). Check the client's
campaign limit: it is 3 by default, and the Campaigns page shows it as "N of 3 campaigns". The
wizard's AI uses the live Gemini key; each run is a few cents. The launch gate and sourcing are
the same as for any campaign, so in the sandbox discovery is simulated.

Run the K tests once in light mode and once in dark mode (moon icon at the top).

| ID | Do | Expected |
| --- | --- | --- |
| K1 | Open Campaigns. | One **+ New campaign** button (no separate Find / Create manually / Launch all buttons). Under the title: "N of M campaigns · N of 5 launches used this month". |
| K2 | **+ New campaign**. | A small window: **Find campaigns for me** (Recommended) and **Set it up myself**. Escape or the X closes it. **Set it up myself** opens the manual form. |
| K3 | **Find campaigns for me**, enter a real B2B website, **Read my website**. | A thinking orb (no circle behind it) and changing status lines, then the details are filled in. AI guesses are marked to check. The header shows the Shorty Harris bolt. |
| K4 | Enter `localhost` or `10.0.0.1`. | Refused as not a website address; nothing is fetched. |
| K5 | A site that doesn't exist (e.g. `no-such-site-12345.com`). | "We couldn't read that website" with **Describe my business** and **Try again**. |
| K6 | **Describe your business instead**, fill it in, continue. | The next pages are filled from the description; what you typed is kept. |
| K7 | On "Where do you work?", type `lusa` in City or area. | Real places appear as you type (e.g. "Lusaka, Lusaka Province, Zambia"). Click one, or press Enter for the highlighted one; it is added as a chip. Arrow keys move the highlight. **Within X miles of a point** also suggests while typing. |
| K8 | On "What should a new customer do?". | The four goal cards are the same size in two even columns. |
| K9 | **Save & exit** half-way, then open Campaigns. | A quiet note: "You have an unfinished campaign setup" with **Continue** and **Discard**. No "Welcome back" screen anywhere. **Continue** returns to that step; **Discard** removes the note. |
| K10 | With an unfinished setup, press **+ New campaign** > **Find campaigns for me**. | Starts fresh (filled from your saved business details), not the old setup. |
| K11 | Clear the area and try to continue. | Can't continue; the missing field is named. |
| K12 | **Find campaigns**. | 1-5 idea cards with businesses, hot leads ("Every campaign varies") and launch (Free or 1 credit). Cards side by side line up. No dollar amounts. |
| K13 | Pick two ideas and add your own, then create the drafts; double-click the button. | Three drafts, never six. Campaigns shows "3 new drafts ready" with **Review emails** for each. |
| K14 | **Review emails** on a draft. | A pop-up opens **once**, smoothly (no double open or flicker). Tabs: **Emails**, **Who & where**, **Launch**. Under the title, one sentence says what to do next. |
| K15 | Click a campaign row, then close it with X, the backdrop and Escape. | Same pop-up; each closes it. With unsaved changes you are asked first. |
| K16 | **Emails**: use **Rewrite** until the free rewrites run out. | The count goes down to 0, then Rewrite is disabled. Editing by hand still works. |
| K17 | Empty one email's subject, press **Launch campaign**. | It goes to the Launch tab, which lists "Follow-up 1 needs a subject." with **Fix**. Nothing launches. |
| K18 | Change the name on **Who & where**, **Save**. | "Saved."; the window stays open without flickering; the row shows the new name. |
| K19 | **Launch campaign** on a ready draft. | Normal launch gate (free launches, then 1 credit), sources like any campaign, no admin review. First emails appear in Approvals. |
| K20 | Set a future start date (**More settings**), then **Schedule**. | Status Scheduled; nothing sourced or charged. In the ⋮ menu, **Cancel the start date** returns it to draft. |
| K21 | **Launch all** with one draft that has a blank email. | The others launch; that one is listed as needing fixes with **Open**. |
| K22 | ⋮ menu: Pause, Resume, Archive, Restore, **Make a copy**. | Each works; a copy opens as a new draft. |
| K23 | ⋮ menu > **Delete campaign**; also the ⋮ on a table row. | The "Permanently delete...?" window lists what goes. After deleting, the pop-up closes and the row is gone. |
| K24 | Have as many campaigns as your limit, open Campaigns. | "Campaign limit reached" note; **+ New campaign** is disabled. Same for 5 launches this month. |
| K25 | As admin, untick **Campaign wizard** for a client; as that client open Campaigns and `/app/campaigns/wizard`. | **+ New campaign** opens the manual form; the wizard says "The campaign wizard is switched off for your account." A campaign they create waits for admin review. Tick it again afterwards. |
| K26 | After the n8n step in `n8n/README.md`: launch a wizard campaign. | The first email in Approvals follows the template's subject and offer with names filled in. A manual campaign's emails look as before. |
| K27 | Open a running campaign (or one that has found businesses), tab **Prospects**. | The businesses it found, newest first, each with contact, type, place and status (Emailed, They replied...). Over 8 businesses: a search box filters them. Drafts don't show this tab. |

## Automated checks, and what this plan does not cover

Checked 2026-11-08 against the repository and the campaign wizard's pull request.

| Spec | What | Status |
| --- | --- | --- |
| 2.5 | **Regression checks on every pull request** | **Done.** "Release checks" (`.github/workflows/release-checks.yml`) runs the type check, unit and component tests (530), the production build, lint and the database tests (265) on every pull request into `main`, and is required before merging. The campaign wizard pull request passes them. |
| 2.5 | Nightly full run and browser (end-to-end) tests on previews | Not built yet. Phase 2 of `docs/REGRESSION-TESTING-PLAN.md`; needs a dedicated test sandbox account and mailbox. |
| 2.3 | **Testing database changes on a copy before release** | **Done for every pull request.** The checks build a fresh database from `supabase/baseline` plus the pull request's migrations and run the database tests on it; production is changed only after merge, from the same file. Trying a risky change on a copy of live data (a Supabase preview branch) is still a manual step (`SANDBOX.md`). |
| 2.4 | Future BDR agent access | Designed for (`docs/REGRESSION-TESTING-PLAN.md` section 8), not built. |
| | Sandbox clock and weekends | The clock moves dates and time of day, but the follow-up writer runs on the real calendar's weekdays (E6, a known limit). |

## Results sheet

| ID | Pass / Fail | Notes |
| --- | --- | --- |
| A1 | | |
| A2 | | |
| A3 | | |
| B1 | | |
| B2 | | |
| B3 | | |
| C1 | | |
| C2 | | |
| C3 | | |
| D1 | | |
| D2 | | |
| D3 | | |
| D4 | | |
| D5 | | |
| D6 | | |
| D7 | | |
| D8 | | |
| D9 | | |
| E1 | | |
| E2 | | |
| E3 | | |
| E4 | | |
| E5 | | |
| E6 | Note only | |
| F1 | | |
| F2 | | |
| F3 | | |
| F4 | | |
| F5 | | |
| F6 | | |
| F7 | | |
| F8 | | |
| F9 | | |
| G1 | | |
| G2 | | |
| G3 | | |
| G4 | | |
| H1 | | |
| H2 | | |
| H3 | | |
| I1 | | |
| I2 | | |
| I3 | | |
| J1 | | |
| J2 | | |
| K1 | | |
| K2 | | |
| K3 | | |
| K4 | | |
| K5 | | |
| K6 | | |
| K7 | | |
| K8 | | |
| K9 | | |
| K10 | | |
| K11 | | |
| K12 | | |
| K13 | | |
| K14 | | |
| K15 | | |
| K16 | | |
| K17 | | |
| K18 | | |
| K19 | | |
| K20 | | |
| K21 | | |
| K22 | | |
| K23 | | |
| K24 | | |
| K25 | | |
| K26 | | |
| K27 | | |
