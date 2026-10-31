# Pre-push review (read-only) - 2026-10-27

Branch `fix/seo-www-canonical`, 25 modified + 17 untracked files. Nothing was changed, committed or pushed except this file.

## A. Checks

| Check | Result |
|---|---|
| `tsc --noEmit -p .` | Exit 0 but **meaningless**: root tsconfig has `"files": []`, so it checks nothing. |
| `tsc -b --noEmit` (what `npm run build` runs) | **Clean**, no errors. |
| `vitest run` | **34 files, 262 tests, all pass.** |
| `eslint .` | **Exit 1.** Error in `src/auth/AuthProvider.tsx:32` (`loadProfile` accessed before declared). File is NOT in the diff, so pre-existing. Full error/warning count not captured. |
| `npm run build` | Not run (it also runs the blog-html generator). |

The Supabase project was queried read-only (information_schema, pg_proc, pg_constraint) to verify names. Nothing written.

### Names verified against the live DB
- `messages.angle`, `observation`, `observation_source_url`, `pending_since`: exist. `messages_with_sender.pending_since`: exists.
- RPC `approvals_schedule(p_client_id uuid)`: exists, SECURITY DEFINER, EXECUTE granted to `authenticated`, gated by `can_manage_client`. Returns a table (bare array), which `fetchApprovalsSchedule` handles. Column names match `ScheduleRow`.
- RPC `stop_followups(p_prospect_id uuid)`: exists, name and arg match the frontend.
- `replies.intent` CHECK has the 13 values listed in the brief.
- No typos found in new field or RPC names.

### Per-file summary
- `App.tsx`: sidebar badge now uses `usePendingApprovalCount` (head count minus held). Impersonation Shell now gets real credits. Does what it says.
- `useClientApprovals.ts`: adds `pending_since`, send-timezone "today", held-row hiding (`hideSendRuleHeld`), pending-count hook, `saveDraftEdits`. Does what it claims; see B.
- `useApprovalsSchedule.ts` (new): wraps the RPC. OK.
- `lib/approvalsView.ts` (new): tz helpers, sort, filter, held logic. Tested. OK.
- `lib/approvalLabels.ts` (new): shared labels (First Touch / Follow-Up 1-3). OK.
- `components/ApprovalCells.tsx` (new): Scheduled, Pending, Waiting, Held cells. See B6.
- `lib/draftEdits.ts` (new): guarded update that errors on zero rows. Correct. Note `saveStepEdit` allows `approved` status, which is intentional.
- `useApprovalQueue.ts`: selects `pending_since` and `send_timezone`, uses `saveDraftEdits`. OK. Its own "approved today" stat still uses browser midnight (see B6).
- `useSequenceActions.ts`: `stopFollowups` calls `stop_followups`, invalidates caches. OK.
- `useAdminData.ts`: `activationByClient` (any profile activated), profile query now throws on error, 409 body parsed from `error.context`, `resent` flag. OK.
- `admin/Clients.tsx`: "Activated" label and resend toast. OK.
- `SetPassword.tsx`: admins go to `/admin/approvals` after setting a password, clients to `/app`. OK.
- `TargetingProfile.tsx` + `lib/rebuildSummary.ts`: before/after summary. OK.
- `admin/ApprovalQueue.tsx`, `client/Approvals.tsx`: new columns, sort, type filter, review modal, Save draft fix. OK, see B.
- `invite-user.html`: copy changed and contains literal `[EXPIRY]` and `[SUPPORT_EMAIL]` placeholders.
- Migration `20261027120000_count_launch_on_campaign_approval.sql`: trigger counting launches. Not yet confirmed applied.

### Unrequested changes in the diff
These were not in your list and are sizeable:
- `client/Prospects.tsx`: about 350 changed lines (table collapsed from 7 to 4 columns, new Activity column, formatPhone, new icons, restyled buttons).
- `client/Shell.tsx`: sidebar regrouped into Daily / Outreach / Account, credits chip hidden when not numeric.
- `client/Campaigns.tsx` (~115 lines), `Home.tsx`, `Results.tsx`, `BlockedDomains.tsx`, `Settings.tsx`, `CampaignsAndLeads.tsx`, `theme-client.css`, new `lib/clientButtons.ts` and `lib/campaignStatus.ts`: a button-style system and restyle.
- Line endings: `git diff` shows `Prospects.tsx` as 1912 lines changed, but only ~346 are real (CRLF noise). Several files will get LF-to-CRLF warnings.
- Untracked and probably not for this push: `FRONTEND_AUDIT.md` (repo root), `app/public/images/video-poster.png`.

### Debug leftovers
- `console.debug('[rebuild-client-targeting] ...')` x3 in `useClientIcp.ts:239,243` and `TargetingProfile.tsx:105`. All guarded by `import.meta.env.DEV`, so they never run in production. Still worth deleting.
- No `.only`, `debugger`, TODO or FIXME in the diff. No hardcoded ids, no `.env` or secrets in the changed or untracked files.
- Existing `eslint-disable-next-line` comments are all pre-existing.

## B. Runtime safety

5. **Null handling.** The new columns are handled safely.
   - `pending_since` null: falls back to schedule row, then `created_at`, then renders `-`. Safe.
   - Schedule row missing: `scheduledDisplay` returns `-`. `estimated_send_at` null: shows a reason from the basis map, or "No date yet" for unknown or null basis.
   - `basis` values not in `NO_DATE_REASON` (`queue_position_and_daily_cap`, `previous_email_sent` with a null date): "No date yet". Fine.
   - `angle`, `observation`, `observation_source_url`: **not read anywhere**, so there is nothing to render or break yet.
6. **Timezone.**
   - Client "today" for stats uses `clients.send_timezone` via `startOfDayInTz`. Good. Falls back to the browser zone only if the profile has not loaded or the value is empty. Caveat: the RPC falls back to `America/Chicago` when `send_timezone` is empty; the frontend falls back to the browser zone. Mismatch only for clients with no timezone set.
   - **Inconsistent day counts (SHOULD FIX).** `PendingCell` and the tooltip use calendar days in the business tz (`calendarDaysBetween`). `WaitingCell` (the "2d" shown in the Waiting column) uses elapsed 24-hour blocks, not tz-aware. A draft that entered the queue at 11pm yesterday shows "1h" in the cell and "(1 day)" in the tooltip.
   - **Admin stat still browser-midnight (SHOULD FIX).** `useApprovalQueue.ts:96-98` still uses `setHours(0,0,0,0)` for the admin "Approved today" tile. Admin queue spans many clients, so there is no single correct tz; at least label it.
7. **Lists.** Keys are stable (`item.id`). Sort is on a copy (`slice().sort`), so no state mutation. Sort and filter run on the whole loaded list before pagination. Sort has deterministic tie-breaks. Caveat: the pending list is capped (existing behaviour), so sorting is over the loaded rows only; the existing "only N of M loaded" note covers that. Admin `approvable` is computed from `clientItems` (ignores the Type filter), so "Approve all N" can disagree with the filtered list shown. See SHOULD FIX.
8. **Queries.**
   - `usePendingApprovalCount` is one head count plus the schedule RPC, `staleTime` 30s, refetched on realtime events. Fine, and cheaper than the old full-queue load.
   - The schedule RPC now runs in three places for a client (Shell badge, `useClientApprovals`, the Approvals page); all share one react-query key, so one request.
   - `heldApprovedToday` query key embeds the joined id list; harmless but large keys for big held sets.
   - `useApprovalsSchedule` is not paginated; the RPC returns one row per unsent message for the client. Fine at current scale.
   - Stats key now includes tz, so a refetch happens once when the profile arrives (brief flicker of tile numbers).

## C. Reply intents (exact answer)

DB allows 13 values: interested, question, resend_request, referred, maybe, not_interested, stop, wrong_person, out_of_office, automated, auto_reply, bounced, uncertain. (Your brief said 11; the live constraint has 13.)

Places that map intent:

1. `lib/replyIntents.ts` (admin Analytics reply breakdown, `ReplyBreakdown.tsx`).
   - Handled: interested, maybe, not_interested, wrong_person, stop (human); automated, auto_reply, out_of_office (grouped as automated); bounced.
   - **Unhandled: question, resend_request, referred, uncertain.** `replyGroup()` returns `null`. Effect: no crash, but those replies are silently dropped. They count in `total` only, never appear in the pie, the human count, the percentages, or the "all replies" list (`filterReplies` excludes null). A real "question" or "referred" reply is invisible in this view.
2. `hooks/useClientAnalytics.ts:138,140,209` (client Analytics reply rate and trend). Only `bounced` and `auto_reply` are excluded; everything else counts as a real reply. So **automated, out_of_office and uncertain are counted as real replies** and inflate reply rate and the weekly trend. question, resend_request and referred are counted (correct).
3. `screens/client/Prospects.tsx:711` (reply list in the prospect panel). Shows the raw token upper-cased with underscores replaced: "RESEND REQUEST", "OUT OF OFFICE", "UNCERTAIN", "REFERRED". Never blank, never a crash. Readable but unlabelled/uncoloured.
4. `useClientPipeline.ts:131` and `useAnalytics.ts`: carry `intent` as `string | null`, no mapping.

There is no icon or colour mapping outside `replyIntents.ts`.

## D. Known gaps

10. **Held rows hidden from the client: mostly done, with holes.**
    - Done: the client Approvals page calls `useClientApprovals(..., hideSendRuleHeld = !isAdmin)`. Held rows are removed from the pending list, the approved/blocked lists (and their counts), the Pending and Approved-today tiles, and the sidebar badge (`usePendingApprovalCount` subtracts held pending). The "Held by send rules" badge is rendered only `isAdmin`, and in the admin queue.
    - Hole 1 (fail-open): hiding depends on the `approvals_schedule` fetch. While it loads, or if it errors (the hook swallows the error into `error`, which no one reads), held rows are shown to the client and counted in the badge. On first page load they briefly flash.
    - Hole 2: "Approve all pending" calls the `approve_sequences` RPC, which will also approve held drafts the client cannot see; the confirm dialog's per-step counts then won't match the visible list.
    - Hole 3: other client surfaces still use unfiltered counts: `clientAwaitingProspectsKey` (awaiting prospects), `campaignPendingProspectsPrefix` (Campaigns pending), Dashboard. Not checked in detail.
    - Hole 4: `isAdmin` also covers admin view-as-client, which will show held rows there. Probably intended.
    - Hole 5: only `basis === 'held_by_send_rules'` is hidden. `prospect_stopped`, `mailbox_paused`, `previous_step_missing` rows are shown to the client with reason text in the Scheduled column. Confirm that is wanted.
11. **Observation and source link: not displayed anywhere**, and not selected by any query. Natural homes: (a) the client `EditModal` in `screens/client/Approvals.tsx` and the admin `EditModal` in `screens/admin/ApprovalQueue.tsx`, in the details grid under "Waiting since" (observation text plus a "Source" link, `rel="noopener noreferrer"`, `target="_blank"`, only when non-null); (b) optionally a small angle pill (SOCIAL/GEO) next to the type pill in the table row. Requires adding `angle, observation, observation_source_url` to `MESSAGE_SELECT` (`useClientApprovals.ts`), the admin select in `useApprovalQueue.ts`, and the types in `types.ts`. Validate the URL scheme (`https?:` only) before rendering as a link.

## E. Verdict

### BLOCKING
No hard blockers for the code that is there: typecheck clean, 262 tests pass, DB names verified. Two things to decide before pushing:

1. **Scope.** This diff contains an unrequested Prospects redesign, sidebar regrouping and a client-wide button restyle (`Prospects.tsx`, `Shell.tsx`, `Campaigns.tsx`, `clientButtons.ts`, etc.) that is not in your list of work. Either review those on purpose or split them out. Pushing them blind is the real risk here.
2. **Held-row leak (fail-open), if you treat the client-hide requirement as strict.** In `useClientApprovals.ts` (the `held`/`items` memos around line 283-302), a failed or slow schedule fetch leaves held drafts visible to the client. Proposed change, not applied:
   - Return `scheduleReady = !isFetching && !error` from `useApprovalsSchedule` (it already exposes `isFetching` and `error`).
   - In `useClientApprovals`, when `hideSendRuleHeld && !scheduleReady`, treat the list as loading (`loading = loading || (hideSendRuleHeld && scheduleLoading)`) rather than rendering unfiltered rows.
   - In `usePendingApprovalCount`, return `0` until the schedule has loaded.
   - Better, long term: have the server filter held rows out for non-admins.

### SHOULD FIX (today)
- Add `question`, `resend_request`, `referred`, `uncertain` to `lib/replyIntents.ts`. `replyGroup` currently returns null and the replies vanish from the admin breakdown. Also exclude `automated`/`out_of_office` (and probably `uncertain`) in `useClientAnalytics.ts:140,209`; use `AUTOMATED_INTENTS` from `replyIntents.ts`.
- Make `WaitingCell` use `calendarDaysBetween(..., tz)` so it agrees with Pending Since.
- `approve_sequences` can approve held drafts the client cannot see (confirm dialog counts will disagree). Decide server-side.
- Admin "Approve all N for client" ignores the Type filter; either respect it or word the label.
- Fill `[EXPIRY]` and `[SUPPORT_EMAIL]` in `invite-user.html` when pasting into the Supabase dashboard (and note the placeholders would ship literally if pasted as is).
- Remove the three `console.debug` calls.
- Don't commit `FRONTEND_AUDIT.md` or `video-poster.png` unless intended.
- Confirm the migration `20261027120000_count_launch_on_campaign_approval.sql` is applied and decide how it should treat campaigns inserted directly as `active` (the trigger only fires on UPDATE of status from draft/pending_review).
- Normalise line endings (a `.gitattributes` or `core.autocrlf`) so the CRLF noise does not land in the commit.

### LATER
- Show `angle`, `observation`, `observation_source_url` (section D11).
- Give the new intents labels and colours in the prospect reply list instead of the raw token.
- Pre-existing lint error in `AuthProvider.tsx:32`.
- Root `tsconfig.json` has `files: []`, so plain `tsc --noEmit` checks nothing; use `tsc -b`.
- Align the frontend tz fallback with the RPC's `America/Chicago` default.
- Admin tz-aware "today" for the multi-client queue.
- Large `heldApprovedToday` query key.
