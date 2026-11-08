# Campaign Wizard: sandbox tests

The same tests as section K of `docs/SANDBOX-TESTS.md`, on their own so they're easy to find.
Test on the preview: https://shorty-harris-git-claude-relaxed-104119-martin-viteks-projects.vercel.app
(log in as your sandbox client).

## Tests

Before you start: as admin, open your sandbox client and tick **Campaign wizard (pilot)**. Check
the client's campaign limit too: it is 3 by default, and the Campaigns page shows it as "N of 3
campaigns". The wizard's AI uses the live Gemini key; each run is a few cents. The launch gate and
sourcing are the same as for any campaign, so in the sandbox discovery is simulated.

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
| K25 | A client without the pilot switch opens `/app/campaigns/wizard`. | "The campaign wizard isn't switched on for your account yet." **+ New campaign** opens the manual form. |
| K26 | After the n8n step in `n8n/README.md`: launch a wizard campaign. | The first email in Approvals follows the template's subject and offer with names filled in. A manual campaign's emails look as before. |
| K27 | Open a running campaign (or one that has found businesses), tab **Prospects**. | The businesses it found, newest first, each with contact, type, place and status (Emailed, They replied...). Over 8 businesses: a search box filters them. Drafts don't show this tab. |

## Results

| ID | Pass / Fail | Notes |
| --- | --- | --- |
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
