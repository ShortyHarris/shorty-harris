# Frontend Audit

Read-only audit of the `app/` frontend (HEAD `a36edcf`, 2026-10-25). No source files were changed. All paths are relative to `app/` unless noted.

**Scope limits.** Only the repo was inspected. I did not query Supabase, so RLS policies, RPC bodies, triggers and the deployed email templates are unverified. The repo holds just 8 migration files in `../supabase/migrations/`. There is no SQL for `client_pipeline`, `approve_sequences`, `stop_followups`, the `activated_at` trigger or the `messages` RLS. There is also no source for the `rebuild-client-targeting` edge function. Anything that depends on those is marked "backend, unverified".

**Which "Approvals" page.** Section A is about the **client** page, `src/screens/client/Approvals.tsx`. It also renders inside admin "View as client". The admin queue `src/screens/admin/ApprovalQueue.tsx` is a separate copy with the same gaps and is noted where relevant.

---

## A. APPROVALS PAGE

### 1. Type column labels (First Touch, Follow-Up 1/2/3) — PARTIAL
- Evidence: `src/screens/client/Approvals.tsx:41-46`. Labels are `First touch`, `Follow-up D3`, `Follow-up D7`, `Follow-up D14`. They are used at lines 480, 544, 657 (bulk-confirm dialog) and 818 (modal header). A duplicate map is at `src/screens/admin/ApprovalQueue.tsx:38-43`.
- Wrong: the labels use D3/D7/D14 and not "Follow-Up 1/2/3", and "First touch" is not title-cased. The map is duplicated in two files, so both need the edit.
- Related: the help text at `Approvals.tsx:51-52` says follow-ups send "3, 5 and 7 business days after the previous email". That is 15 business days in total, which contradicts the D3/D7/D14 labels.

### 2. Scheduled Send Date column — MISSING
- Evidence: the table headers are `['Prospect','Type','Subject','']` at `Approvals.tsx:458`. No date column exists in the table or the mobile cards (522-577).
- Data source: none. `messages.scheduled_for` is always NULL (per the backend facts). The only schedule signal is `message_block_reasons.reason = 'waiting_followup_timing'` (`src/hooks/useClientApprovals.ts:115-121`), which renders as a badge (no date) on the Approved tab via `BlockBadge` (`Approvals.tsx:487, 678-693`; copy at `src/lib/blockReasons.ts:56`).
- A real date exists elsewhere. `prospect_sequence` returns `due_at` and `scheduled_for` per step (`src/hooks/useClientPipeline.ts:107-122`), shown in the Prospects side panel via `stepDateLabel` (`src/screens/client/Prospects.tsx:738, 786`). The Approvals page never calls it.
- No sorting, no overdue highlight and no estimated-vs-confirmed distinction exist.
- Because `scheduled_for` is NULL, any date is an estimate. For the initial email it is "next send window after approval" (`clients.send_timezone`). For follow-ups it is the previous email's send plus the business-day offset. The UI needs an "Estimated" label unless the backend provides a confirmed time.

### 3. Pending Since column — MISSING
- Evidence: `created_at` is selected (`useClientApprovals.ts:61-65`) and typed (`src/types.ts:103`) but never rendered in `Approvals.tsx`.
- Missing: the format "Oct 9, 2026 (4 days)", sorting, business timezone and reset-on-revise.
- Timezone: `clients.send_timezone` is available (`src/hooks/useClientProfile.ts:19,33,41`) but is not used on this page. `date-fns` is in `package.json`.
- Reset on reject/revise/resubmit: `created_at` never changes. `saveEdits` only bumps `updated_at` (`useClientApprovals.ts:273`). Reject is terminal (`:286-299`) and the UI has no resubmit path. With no `pending_since` column, "reset on revise" would have to be `updated_at` or a new backend column.

### 4. Filter by approval type, combined with date sorting — MISSING
- Evidence: the only filter is the status tab row, Pending/Approved/Blocked (`Approvals.tsx:342-362`). There is no `message_type` filter and no sort control.

### 5. Alphabetical sort by prospect, grouping a prospect's emails in sequence order — MISSING
- Evidence: no sort state exists in `Approvals.tsx` (grep for "sort" returns nothing). The list order is whatever the query returns.
- The pending query sorts `created_at ASC, id ASC` (`useClientApprovals.ts:167-168`). This does not group by prospect, so a prospect's D3 and D7 can be far apart. `STEP_ORDER` (`Approvals.tsx:50`) exists but is only used for the confirm dialog.
- Sorting must be client-side across the full loaded list, because the page slices 10 rows after fetch (`Approvals.tsx:198-200`).

### 6. Default sort (Scheduled Send Date, oldest first) — PARTIAL
- Evidence: `useClientApprovals.ts:167`. The default is `created_at` ascending, which is oldest-drafted first. It is not by scheduled date, and the user cannot change it.

### 7. Save button in the Edit draft modal / visible to CLIENT role — BUILT in code, but a client-side failure is possible (cause unverified)
- Evidence: the `Save` button is at `Approvals.tsx:865-871`, inside the `EditModal` footer (861-880), between Cancel and "Save & approve". It has **no role or permission condition**. The modal only receives `readOnly` (view-as-client), and `readOnly` is handled in the handler (`handleSaveDraft`, 140-147), not by hiding the button. The page is mounted for clients at `src/App.tsx:187` with no `isAdmin`.
- Visibility caveat: the button is `disabled={!dirty || saving}` (`:867`) with `disabled:opacity-50` (`:868`). Until the subject or body is changed, it renders faded and unclickable. It is present but easy to miss on a pristine draft.
- Build/deploy: the Save/`saveEdits` code arrived in `9074c07` (2026-10-22). It is in HEAD `a36edcf`, the working tree is clean for these files, and the local `dist/` built 2026-10-25 12:16 contains the Save and "Save & approve" strings. Deployment is Vercel via `../vercel.json` with `outputDirectory: app/dist`. There is no CI deploy gate. I cannot see what is live, so Martin may be on a pre-10-22 deploy or a cached tab. Confirm in the Vercel dashboard that the production deployment's commit is at or after `9074c07`.
- Likely functional cause if the button is visible but "does nothing": `saveEdits` (`useClientApprovals.ts:272-284`) does a direct `messages` update with `.eq('id', id)` and **no `.select('id')` and no row-count check**. If RLS gives clients no UPDATE on `messages`, PostgREST returns 200 with 0 rows, no error. The UI then shows "Draft saved" (`Approvals.tsx:144`) and the edit is lost. `approve()` and `reject()` do guard on row count (`:266, :296`); `saveEdits` does not. The RLS policy is not in the repo and needs checking: `select polname, cmd from pg_policy where polrelid='public.messages'::regclass`.

### 8. Pagination / 1,000-row cap / rows loaded — BUILT
- Evidence: `useClientApprovals.ts:157-172`. The pending list is fetched in 1,000-row pages through `fetchAllRows` (`src/lib/fetchAllRows.ts:4-33`) up to `MAX_LOADED_ROWS = 5000`. Display paging is client-side, 10 rows per page (`Approvals.tsx:48, 198-200, 580-600`).
- `stats.pending` is an exact head-count (`:180-181`), and the UI detects truncation with `pendingCapped` (`Approvals.tsx:175-176`) and turns off select-all.
- The Approved and Blocked tabs are capped at 200 each (`APPROVED_LIST_LIMIT`, `useClientApprovals.ts:50, 84, 88`). The UI says "Showing the latest N of M" (`Approvals.tsx:376-378`).
- Cost: each row carries the full body and a joined prospect, so up to 5,000 rows are loaded per client. This also happens on every client page, not just Approvals (see risk 1 in section C).

### 9. Czech characters in Edit modal and table — BUILT (no frontend defect found; not data-verified)
- Evidence: `index.html:4` has `<meta charset="UTF-8">`. The modal subject is a controlled `<input>` (`Approvals.tsx:829-834`) and the body a controlled `<textarea>` (`839-845`). The table cell is plain text with CSS `truncate` (`483-486`). No transform, encoding or normalisation is applied anywhere (no `normalize`, `encodeURI` or ASCII-folding hits). The Prospects iframe preview declares `<meta charset="utf-8">` (`Prospects.tsx:721`).
- Fonts: Plus Jakarta Sans and Inter load from Google Fonts (`index.html:57-74`). Google serves latin-ext via unicode-range, so č/ř/ž/ě render in-font.
- If garbled text (e.g. `Ä`, `Å™`) appears, it was stored mojibake from the generator or n8n, not produced by this UI. Check the raw `messages.subject` in the DB.
- Related: `dirty` compares `.trim()` values (`Approvals.tsx:782-783`), so a whitespace-only edit is not saveable.

### 10. Counts — PARTIAL (computed correctly, but the definitions don't match what the tiles imply)
All tiles are exact head-counts in `fetchClientStats` (`useClientApprovals.ts:174-196`).
- **Awaiting Review** = messages with `approval_status='pending'` (`:180-181`). The pending tab count is `Math.max(stats.pending, items.length)` (`Approvals.tsx:175`) over the same filter, so they match unless the list is capped. The pending list does not exclude prospects in terminal status or policy-held drafts. `approve_sequences` does exclude them, so "Approve all pending" can say "Nothing to approve" (`Approvals.tsx:244-247`). A separate prospect-level count, `awaitingProspects` (`useClientApprovals.ts:36-46`), is fetched but never shown on this page.
- **Approved Today** = `approval_status='approved'` and `approved_at >= start of day` (`:182-183`). It includes drafts already sent and is not the same as the Approved tab, which shows approved and `not_sent` (`:86`). It will not match the table.
- **Sent Today** = `send_status='sent'` and `sent_at >= start of day` (`:184-185`). It is not shown in the table at all.
- **Rejected** = all-time rejected (`:186-187`), labelled like a daily number.
- "Start of day" is the **browser's local midnight** (`:175-177`), not the business timezone (`clients.send_timezone`). A user in a different zone sees a different "today". Stats have `staleTime` 60s versus 30s for the list (`:214, :225`), so tiles can briefly disagree with the table.

---

## B. OTHER ITEMS FROM THE CLIENT

### 11. "Stop follow-ups" action / followups_stopped / sequence_paused display — MISSING (action); PARTIAL (display)
- The row menu with Won / Lost / Edit / Delete is the **admin** Prospects page: `src/screens/admin/Prospects.tsx:200-228` builds the items and `:264` renders `RowMenu`. The **client** Prospects table has no row menu (`src/screens/client/Prospects.tsx:237-307`).
- `stop_followups` has zero references in `src/` (grep). No `supabase.rpc('stop_followups')` exists anywhere.
- Closest existing actions are in the client Prospects side panel (`SequencePanel`, `Prospects.tsx:437-620`): Pause/Resume via `set_sequence_paused` (`:472-478`, button `:613`) and "Cancel unsent emails" via `cancel_unsent_sequence` (`:479-488`, button `:618`, wrapper `useSequenceActions.ts:75-81`). Neither is `stop_followups`.
- `sequence_paused` is displayed only inside that panel (`useClientPipeline.ts:156-167`, banner around `Prospects.tsx:552`). The row-level pill uses `sequence_status` from `client_pipeline` (`Prospects.tsx:242-246`).
- `followups_stopped` is never displayed. It appears only in a test comment (`src/lib/blockReasons.test.ts:13`), so `blockInfo()` falls back to the generic path for that reason.

### 12. Prospects search: server-side? any of 2,000+? — BUILT (server-side); coverage of 2,000+ depends on RPC (unverified)
- Client: the search is server-side via `client_pipeline(p_search, p_limit=50, p_offset)` (`src/hooks/useClientPipeline.ts:58-64`), 350 ms debounce (`Prospects.tsx:72-77`), and pages of 50 (`:99-100, 194-214`). It does not filter a capped list in the browser. The result total is the RPC's `total`, so 2,000+ prospects are reachable by paging.
- Admin: the search is server-side `ilike` on `business_name, email, contact_name` (`src/lib/prospectQuery.ts:7-26`), 50 per page.
- Unverified/risk: whether the RPC searches phone or website is unknown (the placeholder says "business, email, or contact"). Plain `ilike` is not accent-insensitive, so searching "Cafe" will not find "Café" (relevant for Czech names) unless the RPC uses `unaccent`.

### 13. Admin Clients: Active vs "Resend invite" — BROKEN (for already-activated clients)
- Logic: `InviteCell` (`src/screens/admin/Clients.tsx:375-428`) picks, in order: Internal (`is_internal`), No email, Sending, Sent, then **"Activated" if `phase==='active' || client.activated_at`** (`:402`). Otherwise it shows a button that reads "Resend invite" when `has_profile` and "Send invite" when not (`:421-423`).
- The data is `profiles.activated_at`, read by a second query in `fetchClients` (`src/hooks/useAdminData.ts:520-531`). The map is keyed by `client_id`.
- Why Tutel and Shorty Harris can show "Resend invite" while working (ranked by likelihood):
  1. **Row-menu label ignores activation.** `Clients.tsx:210` labels the menu item "Resend invite" whenever `phase==='sent' || c.has_profile`, then disables it for activated clients (`:212`). So the menu says "Resend invite" (greyed out) for every working client. This is almost certainly what is seen.
  2. **Multiple profile rows per `client_id`.** `useAdminData.ts:523-525` builds `new Map(rows.map(p => [p.client_id, p.activated_at]))`, which is last-wins. If a client has more than one profile (staff or admin linked to the same client, or a re-invited user), a row with null `activated_at` can overwrite the activated one. Shorty Harris, being the owner's own client, is a likely candidate.
  3. **Backfill missed these rows or the trigger isn't live.** The comment at `Clients.tsx:99` says "A DB trigger stamps `profiles.activated_at` on first sign-in", but no such trigger or backfill is in `../supabase/migrations/`. Run `select id, client_id, activated_at from profiles where client_id in (...)`.
  4. **Query errors are swallowed.** The profiles query at `useAdminData.ts:520-525` ignores `error`. If it fails, `has_profile` becomes false and the label would read "Send invite", not "Resend". So the "Resend" symptom means the query returned rows with null `activated_at`.
  5. **Staleness.** The clients query has a 3-minute `staleTime` (`useAdminData.ts:580`).
- Related bug: `sendClientInvite` (`useAdminData.ts:673-690`) checks `if (error) return {error: error.message}` **before** reading `data.error === 'user_already_active'`. The edge function returns that case as HTTP **409** (`invite-client/index.ts:117-120`). `supabase.functions.invoke` surfaces non-2xx as an `error` (generic "Edge Function returned a non-2xx status code") and no usable `data`. So the `alreadyActive` branch (`useAdminData.ts:687`, `Clients.tsx:92-96`) is effectively dead. Clicking Resend on an active client shows the generic error toast (`Clients.tsx:95`) and the "already active" pill never appears. Verify against the installed `@supabase/supabase-js` behaviour.

### 14. Invitation email copy and invite-client usage — PARTIAL
Source: `../supabase/email-templates/invite-user.html` (repo copy only; the live copy is whatever was pasted into Supabase Dashboard → Auth → Email Templates → Invite user).
- Subject (suggested in the file comment, not enforced): **"You're invited to Shorty Harris"**
- Title: "You're invited to Shorty Harris"; heading: "You've been invited"
- Body: "An admin has set up your Shorty Harris account for `{{ .Email }}`. Set a password to get in and see your leads, messages, and results in one place."
- Button: "Set your password" → `{{ .ConfirmationURL }}`
- Fallback: "Button not working? Paste this link into your browser: `{{ .ConfirmationURL }}`"
- Footer: "This link expires after a while and can only be used once. If it's stopped working, ask the admin who invited you to resend it." / "© 2026 Shorty Harris. If you weren't expecting this, you can ignore this email."

How it is called: `sendClientInvite` (`useAdminData.ts:673-690`) invokes `invite-client` with `{email, client_id, full_name, redirect_to: window.location.origin + '/auth/set-password'}`. The edge function checks the caller is an admin and calls `auth.admin.inviteUserByEmail` (`invite-client/index.ts:68-72`).

Awkward or risky:
- "An admin has set up…" is impersonal. The client does not know who "the admin" is, and there is no sender name, contact or support email. "Ask the admin who invited you" gives nothing to reply to.
- "expires after a while" is vague (no hours or days).
- The footer year is hard-coded to 2026.
- **Resend sends a different email.** If the user already exists but has never signed in, the function calls `resetPasswordForEmail` (`invite-client/index.ts:123-131`). The client then gets the **Reset password** template, not this invite copy. The admin UI still says "Invite sent" (`Clients.tsx:104-105`).
- `full_name` is passed as `c.business_name` (`Clients.tsx:90`), so `profiles.full_name` becomes the business name, not a person. It is shown as the header `displayName` (`App.tsx:173`).
- `redirect_to` uses the admin's current origin. An invite sent from localhost or a preview URL produces a link to that host, and the host must also be in Supabase's allowed redirect URLs.
- SMTP: the file header notes the built-in Supabase mailer is ~2 emails/hour and often lands in spam (`invite-client/index.ts:5-8`). Whether custom SMTP is configured is unknown.

### 15. Targeting "Rebuild from my website" — PARTIAL
- Call chain: button → `handleRebuild` (`src/screens/client/TargetingProfile.tsx:85-101`) → `buildClientIcp` (`src/hooks/useClientIcp.ts:226-247`) → `supabase.functions.invoke('rebuild-client-targeting', {client_id})`.
- The function source is **not in the repo** (`../supabase/functions/` has no `rebuild-client-targeting`).
- Response handling: only `ok === true` and `limited_data` are read (`useClientIcp.ts:242-246`). On success it invalidates `['client-icp', id]`, the page calls `reload()` (`TargetingProfile.tsx:95`), and shows "Rebuilt from your website - your own edits were left alone." plus a "limited information" note when `limited_data` is true. The returned payload is not inspected. The UI cannot tell "ok but nothing written" from success.
- Why Business Types, Decision-maker roles and Pain points can be empty after a "successful" rebuild:
  1. **Decision-maker roles are not derived at all.** The UI says so (`TargetingProfile.tsx:36-39`: "We don't derive this yet").
  2. **Edited-field lock.** Any save through `commitArray` (`:61-71`, via `save_client_icp`) marks the field as edited, including saving an **empty** array when someone deletes the last tag. Rebuild never overwrites edited fields (copy at `:21, :98, :133`), so a field cleared once stays empty forever. The "your edit - won't be overwritten" badge (`:168-172`) shows when this has happened.
  3. **`limited_data: true`.** Hard-to-read or JS-rendered sites return `ok` with few or no fields. The toast shows only a secondary sentence.
  4. **Silent read failure.** The `client_icp` select uses `maybeSingle()` and `if (!data) return EMPTY_ICP` (`useClientIcp.ts:147-153`). An RLS miss or a different `client_id` returns an empty profile with no error.
  5. **Stale draft shadowing.** `valuesFor` prefers `draft[key]` over server data (`TargetingProfile.tsx:57-59`). A failed save leaves `draft[key]` set (`:65-67`), so a later rebuild's data stays hidden until reload.
  6. **Backend wrote to different columns or fields** than `target_business_types`, `decision_maker_roles` and `pain_points` (unverified, no function source).
- Check: `select target_business_types, decision_maker_roles, pain_points, edited_fields, derived_at from client_icp where client_id = '…'`.

### 16. Password reset flow — BUILT, with one routing bug
- Trigger: Login "Forgot password?" link (`src/screens/Login.tsx:52`) → `/forgot-password` → `ForgotPassword.tsx` → `useAuth().resetPassword` (`src/auth/AuthProvider.tsx:98-103`) → `supabase.auth.resetPasswordForEmail(email, {redirectTo: origin + '/auth/set-password'})`.
- Template: Supabase Auth's **"Reset password"** template, configured in the dashboard. The repo contains only `invite-user.html`, so the reset template's copy is not version-controlled and was not inspected. The same call is used by the invite-resend path (`invite-client/index.ts:124`).
- Landing: `SetPassword.tsx` calls `supabase.auth.updateUser({password})` (`:44`). An expired or used link shows a dedicated message (`:58-95`).
- Bug: on success it always navigates to `/app` (`SetPassword.tsx:48`). For an **admin** reset, `/app` renders `NoClientAccount` ("No client account linked"; `App.tsx:68-74, 376-392`), because `RequireClient` checks `client_id`. Admins should go to `/admin/approvals`, as `LoginRoute` does (`App.tsx:94`).

### 17. sandbox / is_sandbox / test mode in the UI — MISSING (nothing in the UI)
- No UI reference to `sandbox`, `is_sandbox` or test mode in `src/`. The only `sandbox` hit is the iframe attribute `sandbox=""` (`src/screens/client/Prospects.tsx:867`).
- `is_sandbox` appears only in SQL: `../supabase/migrations/20261008120000_prospect_sequence_status.sql:73, 91, 152, 159` (`coalesce(p.is_sandbox,false)=false` filters in the pipeline views). So sandbox prospects are hidden server-side but there is no visible indicator, and the admin lists do not filter them.
- `../docs/KNOWN_ISSUES.md` mentions "Twilio notifications are sandbox-logged" and Stripe "test mode" in the contract, which are documentation only.

---

## C. GENERAL

### 18. Routes and roles (`src/App.tsx:396-471`, nested in `src/screens/admin/Layout.tsx:131-144` and App.tsx:183-198)

| Route | Who can see it | Guard |
|---|---|---|
| `/`, `/blog`, `/blog/:slug`, `/pricing`, `/gmail-data-use`, `/privacy`, `/terms`, `/cookies`, `/unsubscribe` | Public | none |
| `/login`, `/signup` | Signed-out only (signed-in users are redirected, or signed out if they have neither role nor `client_id`) | `LoginRoute` / `SignupRoute` |
| `/forgot-password` | Public | none |
| `/auth/set-password` | Anyone with an invite or recovery session (redirects to `/login` without a session unless a link error is present) | none at route level |
| `/__preview-dashboard` | **Public** (dev preview shell with `clientId="__preview__"`) | none |
| `/admin/approvals` `blog` `clients` `prospects` `campaigns` `hot-leads` `results` `analytics` `monitoring` `docs` `domains` | `profile.role === 'admin'` | `RequireAdmin` |
| `/admin/impersonate/:clientId/*` (index, campaigns, prospects, approvals, analytics, results, targeting, billing) | Admin only; read-only unless "Edit as admin" | `RequireAdmin` |
| `/app` (index/Dashboard), `campaigns`, `prospects`, `approvals`, `analytics`, `results`, `targeting`, `settings`, `billing` | Any signed-in user with a `client_id` (`RequireClient`). An admin without a `client_id` sees "No client account linked". | `RequireClient` |
| `/docs`, `/docs/:slug` | Any signed-in user (content scoped by RLS) | `RequireAuth` |
| `*` | Public (NotFound) | none |

### 19. Tests and CI (listing only)
- Runner: Vitest 4 + jsdom + Testing Library, configured in `vite.config.ts:14-18`; setup `src/test/setup.ts`; scripts `test` and `test:watch` in `package.json`. No e2e tooling (no Playwright or Cypress).
- Test files (26):
  - components: `CountrySelect.test.tsx`, `LocationAreaInput.test.tsx`, `TagInput.test.tsx`, `TargetAreaChips.test.tsx`, `TimezoneSelect.test.tsx`
  - hooks: `useClientDashboard.test.tsx`, `useClientIcp.rebuild.test.ts`
  - lib: `blockReasons`, `campaignLimits`, `chunkedBulk`, `countries`, `fetchAllRows`, `geoCircle`, `googleAnalytics`, `postkingBlogSync`, `prospectDetail`, `prospectQuery`, `replyIntents`, `targetAreas`, `timezones` (all `.test.ts`)
  - screens: `Blog.test.tsx`, `Unsubscribe.test.tsx`, `admin/Domains.purge.test.tsx`, `admin/ReplyBreakdown.test.tsx`, `client/Dashboard.viewed.test.tsx`, `client/Prospects.bodyRender.test.ts`
- CI: the only workflow is `../.github/workflows/sync-postking-blog.yml`, a scheduled/manual blog sync. The cron is `'17 5 * * 1'` (Mondays only) while its comment says "Daily". There is no workflow that runs lint, tsc, tests or build on PRs or pushes.
- Deploy config: `../vercel.json` (`outputDirectory: app/dist`, SPA rewrites) and `../lovable.toml`.
- There are no tests for `Approvals.tsx`, `useClientApprovals.ts`, `Clients.tsx`, `TargetingProfile.tsx` or `SetPassword.tsx`.

### 20. Top 10 risks and bugs not covered above
1. **The whole pending queue loads on every client page.** `ClientZone` calls `useClientApprovals(clientId)` just for the sidebar badge (`App.tsx:127-129`). That runs the full paged pending fetch (up to 5,000 rows with bodies and joined prospects, `useClientApprovals.ts:160-172`) plus approved, blocked and held queries (`:76-148`) on dashboard load. A count query would do.
2. **`saveEdits` and `saveStepEdit` can report success without writing.** Both do direct `messages` updates with no row-count check (`useClientApprovals.ts:272-284`, `useSequenceActions.ts:96-106`). Under RLS, a 0-row update returns no error. `saveEdits` also has no `approval_status` guard, unlike `approve` and `reject`.
3. **Single-email approve bypasses the sequence RPC.** `approve()` (`useClientApprovals.ts:252-269`) and `approveOneEmail` (`useSequenceActions.ts:109-120`) write `approval_status` directly. They skip `approve_sequences`' exclusions (terminal prospects, held drafts), and `approveOneEmail` has no `pending` guard. The file's own comment says writes should go through RPCs (`useSequenceActions.ts:7-8`). The result is two approval paths with different rules.
4. **Admin password reset lands on "No client account linked"** (`SetPassword.tsx:48`).
5. **`user_already_active` (409) handling is dead code**, so admins get a generic error (see item 13).
6. **Resend invite silently sends the reset-password template**, while the admin UI says "Invite sent" (see item 14).
7. **"Today" uses the browser clock, not the business timezone** (`useClientApprovals.ts:175-177`), and no date on the page uses `clients.send_timezone`.
8. **Backend is not reproducible from the repo.** There are 8 migrations. `client_pipeline`, `approve_sequences`, `stop_followups`, `set_sequence_paused`, the `activated_at` trigger, `messages` RLS and `rebuild-client-targeting` have no source here. UI and backend can drift unnoticed.
9. **No automated gate before deploy.** CI never runs `tsc`, lint or tests (the build script runs `tsc -b` only on the Vercel build), and the highest-risk screens (Approvals, Clients, Targeting) have no tests.
10. **Duplicated approval UIs.** The client `Approvals.tsx` and admin `ApprovalQueue.tsx` each have their own `TYPE_LABEL`, edit modal and stats. Every requested change (labels, columns, sort) must be made twice or the two will diverge. Also, `/__preview-dashboard` is a public route (`App.tsx:414-420`), harmless now but easy to forget if it ever receives real data.

Lower priority: `activated_at` and `has_profile` queries ignore errors (`useAdminData.ts:520-525`); the Prospects `debounce` is re-created each render (`Prospects.tsx:72`); the sync workflow's comment and cron disagree.

---

## Follow-ups after the implementation pass

Changes made in `app/` after this audit, and what is still open. Backend items were not touched.

- **Resend invite still sends the password-reset email.** `supabase/functions/invite-client/index.ts:123-131` calls `resetPasswordForEmail` for a user who exists but has never signed in. `auth.admin.generateLink({type:'invite'})` only returns a link and does not send mail, so a real invite resend needs a mail sender (custom SMTP or Resend) in the edge function. Documented in the UI instead: the admin toast now says the resend went out as a password-setup (reset) email. The function was not changed or redeployed.
- **Invite template** (`supabase/email-templates/invite-user.html`) now names the Shorty Harris team, drops the hard-coded year, and has two placeholders that must be replaced before pasting into Supabase: `[EXPIRY]` and `[SUPPORT_EMAIL]`. The live template in the dashboard is not updated.
- **Empty lists are still marked as edited.** The Targeting page cannot stop `save_client_icp` from adding a field to `edited_fields` when the saved list is empty; that happens in the RPC. The page now hides the "your edit" badge on empty fields, explains why Rebuild skips them, and lists filled, skipped and still-empty fields after a rebuild. The RPC should skip empty arrays when it records edits.
- **`approvals_schedule` is per client.** The admin queue shows Scheduled Send Date only after one client is picked in the filter. "Today" counts on the admin queue still use the browser clock because the queue spans clients with different timezones.
- **`pending_since` source.** Both pages now read the message's own `pending_since` (client: `messages`, admin: `messages_with_sender`), then the `approvals_schedule` row, then `created_at`.
- **Held by send rules.** The client Approvals page hides these messages everywhere: lists, tab counts, stat tiles and the sidebar badge (using `approvals_schedule`). The "Held by send rules" badge shows only in the admin queue and in admin "View as client". Held ones that fall outside the 200-row approved list are taken off the Approved count, not the Blocked count, since their list is unknown.
- **`saveStepEdit`** (Prospects side panel) also allows `approved` drafts that are still unsent, because that panel deliberately lets clients edit them; sent messages are rejected by the `send_status = 'not_sent'` guard.
- **"Approved today"** keeps counting everything approved since local midnight in the business timezone, including emails already sent, and is labelled accordingly.
- **Needs a live check:** `client_pipeline` returning `followups_stopped` / `sequence_paused` (the row pills only show when those keys are present), and the shape returned by `stop_followups`.

## Summary table

| Item | Status | One-line fix |
|---|---|---|
| 1 Type labels | PARTIAL | Change `TYPE_LABEL` in `Approvals.tsx:41-46` and `ApprovalQueue.tsx:38-43` to First Touch / Follow-Up 1 / 2 / 3 (share one constant). |
| 2 Scheduled Send Date | MISSING | Add a column fed by `prospect_sequence.due_at` or a computed estimate, labelled "Estimated", with sort and an overdue highlight. |
| 3 Pending Since | MISSING | Render `created_at` as "Oct 9, 2026 (4 days)" in `send_timezone`; add a backend `pending_since` if reset-on-revise is required. |
| 4 Filter by type | MISSING | Add a `message_type` select above the table and combine it with the sort. |
| 5 Alphabetical, grouped by prospect | MISSING | Add client-side sort on the full list: prospect name, then `STEP_ORDER`, before slicing to 10. |
| 6 Default sort | PARTIAL | Default to the scheduled-date sort ascending once item 2 exists (currently `created_at` ASC, no control). |
| 7 Save button (client) | BUILT | Code has no role gate; confirm production is on ≥ `9074c07`, add `.select('id')` to `saveEdits` and check the `messages` UPDATE RLS for the client role. |
| 8 Pagination / 1,000 cap | BUILT | Keep; swap the badge's full fetch for a count (see risk 1). Approved/Blocked are capped at 200 by design. |
| 9 Czech characters | BUILT | No UI defect found; if text is garbled, fix the encoding at the source (DB/n8n). |
| 10 Counts | PARTIAL | Align "Approved Today" with a table view, count "today" in business timezone, and relabel "Rejected" as all-time. |
| 11 Stop follow-ups / paused display | MISSING | Add a "Stop follow-ups" action calling `stop_followups(p_prospect_id)` in the client Prospects row/panel and show `followups_stopped`/`sequence_paused` in the row pill. |
| 12 Prospects search | BUILT | Server-side already; confirm `client_pipeline` uses `unaccent` for Czech diacritics. |
| 13 Active vs Resend invite | BROKEN | Make the menu label "Activated"/disabled when `activated_at` is set, take the latest profile per client in `fetchClients`, and read `data` on non-2xx in `sendClientInvite`. |
| 14 Invite email copy | PARTIAL | Name the sender, give an expiry time and a support contact, remove the hard-coded year, and send the invite template (not reset) on resend. |
| 15 Targeting rebuild | PARTIAL | Surface what the function wrote (counts or fields); don't mark a field "edited" when saving an empty list; commit the function source. |
| 16 Password reset | BUILT | Route to `/admin/approvals` for admins after `updateUser`; add the reset template to the repo. |
| 17 Sandbox / test mode | MISSING | No UI references; add an indicator or admin filter only if needed. |
| 18 Routes and roles | BUILT | Listed above; consider removing or guarding `/__preview-dashboard`. |
| 19 Tests and CI | PARTIAL | Add a PR workflow running `tsc`, lint and `vitest`, plus tests for `Approvals` and `useClientApprovals`. |
| 20 Other risks | — | See the top 10 above; start with risks 1, 2 and 4. |
