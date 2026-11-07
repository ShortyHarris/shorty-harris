# Campaign Wizard: build plan (lean version)

Status: built on branch `claude/relaxed-ritchie-4ltpdn` (November 7, 2026), not yet live. See `docs/CAMPAIGN_WIZARD_RELEASE.md` for what was built and how to switch it on.
Sources: PRD v1.4.2, prototype v1.4.1, *Campaign Wizard: Outstanding Questions* v2,
and the code on `main` at `a50a63e`.

This version replaces the first draft of the plan. It gives the user the same result (an
AI-built B2B profile, one to five suggested campaigns, editable drafts, each launched on its
own, one estimated credit total per campaign) in **three screens instead of seven**, with
fewer moving parts behind them. Section 6 lists where it departs from the PRD, which Ian and
Martin need to agree to.

### Decisions so far (November 7)

- **Three screens**: website, check what we found, pick campaigns.
- **Wizard first, today's pricing.** The wizard runs on the current credit rules (5 free
  launches a month, then 1 credit per launch, 1 credit per hot lead). The new pricing
  (PRD section 8) becomes its own project later. The wizard reads every credit number from
  one estimate function, so switching pricing later means changing that function only.
- **Emails written up front.** When a draft is created, the AI writes the campaign's four
  emails (first email plus three follow-ups) as a template the client can read, edit and
  rewrite before launch. After launch, the AI personalises that template for each prospect,
  and the client approves each email in Approvals as today.
- **Today's cadence.** Follow-ups go 3, 5 and 7 business days after the previous email,
  skipping weekends and holidays. The editor shows this instead of the prototype's
  "Day 0 / 3 / 5 / 7".
- **No staff approval on launch** (Ian, Oct 30).
- Design is settled after the functionality works.

Ground rules (unchanged):

- B2B targeting only.
- Each campaign card shows estimated prospects, estimated hot leads ("Every campaign varies")
  and one credit line from the estimate function. There are no dollars in the wizard. Under
  today's pricing that line reads "Free launch (3 of 5 left this month)" or "1 credit to
  launch". Under the future pricing it becomes the PRD's single "Estimated credits" total.
- No staff approval on launch (Ian, Oct 30). Launch goes straight to sourcing.
- Skipping the wizard has no penalty. Every campaign stays editable and is launched on its
  own. Prices come from a versioned pricing policy, never from wizard code.

---

## 1. The flow: three screens

```
 Campaigns page ── New campaign ─┐        ┌─ Create manually (existing modal) ─► Draft
 Onboarding welcome ─────────────┤        │
                                 ▼        │
              ┌──────────────────────────────┐
  Screen 1    │ Tell us about your business  │──── no website? ─► short "describe it" form
              │ [ website URL ] [Analyze]    │                        │
              └──────────────┬───────────────┘                        │
                    analyzing (≈15–30 s, live progress lines)          │
                             ▼                                         ▼
              ┌──────────────────────────────────────────────────────────┐
  Screen 2    │ Check what we found  (everything editable)               │
              │ Business · Services · Who you sell to · Area · Goal      │
              │ "Please check" marks on anything the AI guessed          │
              └──────────────┬───────────────────────────────────────────┘
                             ▼  generating ideas (≈10–20 s)
              ┌──────────────────────────────────────────────────────────┐
  Screen 3    │ Pick your campaigns   1–5 cards, select any number       │
              │ Regenerate · Add my own idea · ← Edit business info      │
              └──────────────┬───────────────────────────────────────────┘
                             ▼  Create N drafts (free)
                 Campaigns page → editor → Launch (per campaign or Launch all)
```

**Skip wizard & create manually** is visible on every screen and keeps whatever the user has
already entered.

### Screen 1: Tell us about your business
- One field: **Company website**, plus an **Analyze** button.
- Below it, a link: **"I don't have a website"**. It opens the short form on the same screen:
  company name (required), what you do in one or two sentences (required), where you work
  (city or region plus radius), and optionally who your best customers are.
- While analyzing, show progress lines that tell the truth ("Reading your website…",
  "Finding your services…", "Working out who you sell to…") rather than a bare spinner.
- Returning users and **Find new campaigns** skip this screen and land on screen 2 with their
  saved profile. A "Re-read my website" link refreshes it.

### Screen 2: Check what we found
One page with five compact sections. Every field is prefilled where we could and can be edited:

| Section | Fields | Required |
|---|---|---|
| Business | name, industry, one-line description | name |
| Services | list: add, remove, rename; optional "seasonal" months per service | at least 1 |
| Who you sell to | business types, decision-maker roles, company size, exclusions | at least 1 business type |
| Area | `LocationAreaInput` + `RadiusMap` (existing components) | yes |
| Goal | quotes / meetings / calls / replies, plus optional call-to-action text | yes |

- Fields the AI inferred carry a small **"Please check"** tag until the user touches or
  confirms them. Confirmed facts and guesses are kept apart (PRD 6.1).
- **Find campaigns →** stays disabled until the required fields are filled, and names what
  is missing (AC-41).
- Sections the user doesn't need are collapsed by default (for example exclusions and company
  size), so the page reads as a short checklist, not a long form.

### Screen 3: Pick your campaigns
- One to five cards. Each shows its name, who it targets, why it fits, a fit label (Strong fit,
  Seasonal, New segment…), **Est. prospects**, **Est. hot leads · Every campaign varies** and
  the **credit line** from `estimate_campaign_cost` ("Free launch (3 of 5 left this month)" or
  "1 credit to launch" under today's pricing).
- The number of cards respects the client's own limits (`max_campaigns`, monthly prospect
  limit). If they have room for two more campaigns, the cards say so.
- Cards can be selected with mouse or keyboard (AC-60). Below them: **Regenerate ideas**,
  **Add my own idea**, **← Edit business info**, and **Create N drafts →**.
- Creating drafts is free and starts nothing (AC-37). The user lands on Campaigns with the
  new drafts highlighted.

After that, the campaign editor and Launch are the same for wizard and manual campaigns.

---

## 2. Edge cases and how each is handled

### Getting the business information

| Case | What the user sees | How |
|---|---|---|
| No website | The "describe your business" form, then screen 2 with those answers prefilled | The AI works from the text instead of the site. Fewer fields are prefilled, so more carry "Please check". |
| Website won't load (down, timeout, blocked, needs a login) | "We couldn't read that website. Describe your business instead, or try another address." The URL is kept. | The function returns `site_unreachable`, and the UI opens the describe form. |
| Website loads but says little (parked domain, "coming soon", a single image, all JavaScript) | "We found very little on your website, so please fill in the gaps." Screen 2 with whatever we got. | A content-length / quality check on the fetched text. |
| Website in another language | Works as normal. The profile is shown in the user's language, and campaign language defaults to the site language. | Gemini handles it, and we store `language`. |
| Typo or missing `https://` | Fixed silently (`mountainsmowing.com` → `https://mountainsmowing.com`). | URL normalisation before fetch. |
| Somebody else's website (a competitor, a brand they resell) | Analysis runs, and screen 2 asks them to check the business name. | We can't verify ownership. The account's own name is shown next to the extracted one if they differ. |
| Business mainly sells to consumers (a restaurant, a salon) | We still only suggest B2B angles (catering for offices, corporate gift cards). If none fit, screen 3 says so and offers manual creation. | The prompt is B2B-only, and "no viable ideas" is a valid answer. |
| Many services or many locations | All of them are listed on screen 2. The user removes the ones they don't want. | The services list has no hard cap. Areas are clipped to `scrape_limits` with a message. |
| National or online business with no local area | Area accepts a whole country or state. | Same `target_areas` model as manual campaigns. |
| Website already analyzed (by an admin, or an earlier session) | Screen 2 opens straight away. "Re-read my website" is available. | Reuse `client_website_enrichment` / `client_icp` if fresh. |
| Analysis fails (AI error, timeout) | "Something went wrong reading your site. Try again, or describe your business instead." Nothing typed is lost. | One automatic retry, then a manual fallback (AC-39). |

### Getting campaign ideas

| Case | What the user sees |
|---|---|
| Only one or two viable ideas | Only those, with a line saying why there aren't more. We never pad to five (AC-42). |
| No viable ideas | "We couldn't find a strong B2B campaign from this profile." Buttons: Edit business info, Add my own idea, Create manually. |
| An idea duplicates an existing campaign | Hidden. A note says "1 idea skipped: you already run *Commercial Lawn Maintenance*." Partial overlaps show "May overlap with …". |
| User edits screen 2 after ideas were generated | Going forward again shows "Your changes affect the ideas. Refresh them?" Selected ideas are kept where they still apply. |
| Regenerate gives the same ideas | "These are all the strong ideas for your current profile." (as in the prototype) |
| Idea's search terms or areas break the sourcing limits | Clipped to `validate_campaign_inputs` before the card is shown, so every draft can launch. |
| Seasonal service out of season | Card tagged "Seasonal" with a suggested start date. Launching early is allowed. |
| Low or zero credits | Drafts are still created. Credits only matter at Launch, where a shortfall is shown with **Add credits**. |

### Leaving and coming back

| Case | Behaviour |
|---|---|
| User closes the tab mid-way | Answers autosave on every change. Next time, New campaign offers "Continue where you left off" or "Start again". |
| User skips to manual after filling screen 2 | The profile is saved and reused next time (PRD 3.1). |
| Two tabs open | Last save wins per field. Draft creation is idempotent, so double-clicking or two tabs can't create duplicate drafts. |
| Session older than 30 days | Starts fresh but keeps the confirmed profile. |

### Launch

| Case | Behaviour |
|---|---|
| No free launches left and no credits | The existing launch gate refuses. The launch step says so and offers **Add credits**. |
| Launch all where one campaign can't launch (no credits, failed checklist, campaign limit) | The others launch. That one stays a draft with the reason and a fix link (AC-35). |
| Sourcing fails | The existing `refund_campaign_launch` gives back the credit or the free launch. |
| Monthly prospect limit reached | The existing gate refuses, with its current message. |

---

## 3. What already exists that we reuse

| Need | Existing piece | Change |
|---|---|---|
| Read a website | WF9 `wf9-enrich-client` → `client_website_enrichment` | Move the fetch-and-extract into the new `wizard-ai` edge function (logged-in, rate-limited, SSRF-safe). WF9 stays for admins or is retired. Its webhook currently accepts unauthenticated browser calls, which needs fixing either way. |
| Client profile | `client_icp`, `build_client_icp`, Targeting page | Add services, goal, CTA, exclusions, company size and "confirmed" flags. Screen 2 writes here, so Targeting and the wizard show the same profile. |
| Search inputs and limits | `suggest_campaign_inputs`, `validate_campaign_inputs`, `scrape_limits` | No change. Every idea is checked against them. |
| Manual creation | 4-step New campaign modal | Becomes "Create manually", and writes `origin = 'manual'`. |
| Area picker | `LocationAreaInput`, `RadiusMap`, `TargetAreaChips` | No change. |
| Sourcing and launch charging | WF0a gate (`wf0-enqueue`) → `discovery_queue` → WF0b Apify; 5 free launches a month, then 1 credit; `refund_campaign_launch` | No change. Wizard campaigns launch through the same gate. |
| Writing emails | WF2 writes one email per prospect, client approves in Approvals; WF5 writes follow-ups when due (or all up front with `upfront_sequence`) | WF2 and WF5 use the campaign's four-email template as the base and personalise it per prospect. Campaigns without a template (older ones) keep today's behaviour. |
| Follow-up timing | WF3/WF5: 3, 5, 7 business days after the previous email | No change. |
| Hot-lead charge | WF6 / `route_call_outcome_to_hot_lead` deduct 1 | No change. |
| Staff campaign review | `pending_review` + `auto_approve_campaigns` | Removed for client launches (Ian's decision). |

---

## 4. Simpler architecture

1. **One edge function for all wizard AI: `wizard-ai`.** It has four actions: `analyze`
   (website or description → profile), `ideas` (profile → 1–5 campaigns with search inputs
   and estimates), `sequence` (campaign → 4 emails), and `rewrite` (one email or the whole
   sequence). Each call runs synchronously (15–30 s at most), with the Gemini key in Supabase
   secrets and a per-client rate limit. There is no job table, no polling and no n8n for the
   wizard. The website fetch only allows public http/https addresses, caps size and time, and
   treats page text as data, not instructions.
2. **Launch = approval.** Clients already approve every email in Approvals before it is sent,
   so a separate campaign "Approve" step adds a click without adding safety. A campaign goes
   **Draft → Scheduled/Sourcing → Active → Paused/Completed/Archived**. The review checklist
   runs when they press Launch.
3. **Edits to live campaigns apply to emails not yet written.** Emails already written and
   waiting in Approvals stay as they are. Emails already sent never change. Every edit is
   logged in `audit_logs`. There are no campaign versions or pending revisions.
4. **Today's pricing, behind one function.**
   - `estimate_campaign_cost(campaign_ids)`: read-only, used by the cards, the editor and the
     launch step. Today it returns estimated prospects, estimated hot leads (0.5–1.0% of the
     prospect range, labelled "Every campaign varies") and the launch line from
     `monthly_launch_usage` and the credit balance. No screen calculates credits itself.
   - Launching uses the existing WF0a gate unchanged, one campaign at a time. "Launch all"
     calls it for each selected campaign and reports which launched and which didn't.
   - The new pricing project later replaces the inside of `estimate_campaign_cost` and the
     launch gate. The wizard screens don't change.
5. **One campaign model and a feature flag.** Wizard, manual and Find-new drafts are the same
   `campaigns` row with `origin`. `clients.wizard_enabled` turns the wizard on for pilot
   clients.

### New tables and columns
- `wizard_sessions`: client_id, screen, answers (with provided/inferred per field),
  ideas (the cards), selected ids, updated_at.
- `client_services`: client_id, name, seasonal_months, confirmed.
- `client_icp`: add goal, cta, exclusions, company_size, confirmed fields.
- `campaigns`: add origin, service_id, icp (business types, roles, exclusions), sequence
  (4 emails: subject, body; gaps follow today's 3/5/7 business-day rule), start_date,
  rewrites_used, archived_at, cloned_from_id. Status check gains `scheduled` and `archived`,
  and loses `pending_review`.
- `clients`: add wizard_enabled.
- No billing table changes in this project.

---

## 5. Delivery plan

Each milestone ships behind `wizard_enabled` with its tests in the same PR (vitest for `app/`,
SQL tests in `supabase/tests/database`). Day counts are rough single-developer estimates for
ordering the work. Martin's estimate replaces them.

| Milestone | Scope | Rough days |
|---|---|---|
| **M0 Decisions** | Agenda items plus section 6 below. Write PRD v1.5. | — |
| **M1 Foundation** ✅ *built Nov 7* | Migrations and RLS, feature flag, entry points (onboarding welcome, New campaign / Find new campaigns / Create manually on Campaigns), wizard route with autosave and resume, manual modal writes the new fields, retire `pending_review`. | 4–5 |
| **M2 Screens 1–2** ✅ *built* | `wizard-ai` `analyze` (website and no-website), safe fetch, screen 1 with progress and fallbacks, screen 2 review form with "Please check" tags and required-field gate. | 5–6 |
| **M3 Screen 3 + drafts** ✅ *built* | `wizard-ai` `ideas` and `sequence`, prospect estimate (search history, then default range), duplicate check, cards, regenerate, own idea, idempotent `create_wizard_drafts`. | 5–6 |
| **M4 Editor + launch** ✅ *built* | Editor tabs (targeting, the four emails with 3 free rewrites, cadence shown read-only as today's rule, launch checklist), unsaved-changes guard, detail modal, pause/resume/clone/archive, `estimate_campaign_cost` on today's rules, launch and Launch all through the existing WF0a gate. | 5–7 |
| **M5 Emails follow the template** ✅ *code built; n8n wiring is a manual step* | WF2 and WF5 prompts use the campaign's four-email template and personalise it per prospect. Logic kept in `n8n/code/` files with tests, as for WF2.5 and WF3. | 2–3 |
| **M6 Test + pilot** ✅ *tested locally; pilot not started* | Sandbox end-to-end run (wizard → draft → launch → sourcing → emails → approval → send → follow-ups → reply → hot lead), wizard cases in SANDBOX-TESTS and the regression plan, funnel events, pilot with Mountains Mowing and one specialist B2B client. | 3–4 |
| *Later, separate project* | *New pricing (PRD section 8): ×10 credits, prospect charges, first launch free, batch cap, starter grant, new packs, balance conversion. Replaces the inside of `estimate_campaign_cost` and the launch gate.* | *6–8* |

**Rough total: 24–31 developer days** for the wizard, against 43–59 for the full PRD build.

---

## 6. Where this departs from the PRD (needs Ian and Martin's OK)

| PRD | Lean version | Why |
|---|---|---|
| Five question steps plus a confirm step (S01–S05) | Three screens: website, review, pick | The AI fills most answers, so the user checks instead of typing. |
| Separate campaign approval, versions and pending revisions (AC-33, AC-47) | Launch is the approval. Edits apply to emails not yet written. Edits are logged. | Clients already approve each email. Also answers agenda 2.2. |
| New pricing, quotes, reservations, first-free, batch cap (PRD 8, AC-48 to AC-56, AC-63 to AC-69) | Today's pricing in this project; the new pricing is a later project | Ship a working wizard first; keep the money change separate. |
| Expert refine, A/B pack, Brand voice ("Proposed") | Not in MVP | Already optional in the PRD. |
| Collateral file upload | Not in MVP | Agenda 3.2 isn't settled, and the website covers most of it. |
| AI jobs with queued/running states (PRD 5.1) | Synchronous calls with live progress text and retry | Every call finishes within about 30 seconds. |

| Cadence day 0/3/5/7 | Today's 3/5/7 business days after the previous email | Already built and tested. |

Unchanged: B2B only, estimated prospects and hot leads on the cards, the 3 free rewrites,
Launch all, start dates, Find new campaigns, and no staff approval.

### Decided
- **2.3 Email timing:** written up front as a four-email template, personalised per prospect.
- **Cadence:** today's rule.

### Still open
- **2.4 Multi-business accounts:** assumed no for MVP.
- **2.5 ACs 1–25 from v1.0:** still need finding.
- For the later pricing project: hot-lead definition, credit conversion (1 old credit bought at
  about $20–25 becomes 100 new = $10), payment provider.

---

## 7. Risks
- **Estimate accuracy.** Show prospect and hot-lead ranges only, label them "Estimate", and
  replace the default with real yield data as it builds up.
- **Template-based emails** change the WF2/WF5 prompts that every campaign uses. Older
  campaigns without a template keep today's prompt, and the change goes through the `-dev`
  workflows and the sandbox first.
- **Synchronous AI calls** depend on Gemini being quick. If a call regularly takes over 30
  seconds, move that action to a background job. The screens don't change.
- **WF9 webhook exposure** gets fixed in M2 whatever else is decided.
