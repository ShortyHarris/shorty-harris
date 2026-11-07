# Sandbox

A sandbox is a normal customer account inside production with `clients.is_sandbox = true`.
It runs the same app, database and workflows as real customers, but every email can only
reach the tester's own mailbox and paid or customer-facing integrations are simulated.
Testing it means testing what actually runs.

## Safety rules (enforced in the database)

| Risk | Guard |
| --- | --- |
| Emailing a real business | Every sandbox prospect address is derived from the tester's connected Gmail (`you+sbx-01@gmail.com`). `sandbox_address_allowed` refuses any other address, at insert and again in `sendable_messages`. |
| Texts (Twilio) | Notifications are logged as `sandbox_logged` and WF6 skips Twilio for them. |
| Card payments (Stripe) | Billing's Buy records a no-charge purchase (`sandbox_simulate_purchase`). |
| Apify credits | Campaign launches are completed by `simulate_sandbox_discovery`: made-up businesses go through the real import. |
| Reporting | Admin Analytics, `optout_stats` and the mailbox health monitor exclude sandbox accounts. They stay visible, with a red Sandbox badge, in the admin Clients and Hot Leads lists; a sandbox hot lead does not raise the admin Hot Leads alert count. |
| A reset deleting live data | Every `sandbox_*` function refuses non-sandbox accounts. |

Gemini (writing emails, reading websites) runs for real: a few cents per full run.

## Setting up a tester

1. Admin > Clients > **+ New sandbox**: tester's name and email. They get a login invite.
2. The tester logs in, opens Settings and connects **their own** Gmail (never a client's).
3. Sandbox page > **Reset sandbox**: 20 prospects, 10,000 credits, clock at today.

Give each tester their own sandbox so nobody resets someone else's test. Admins can also
open any sandbox with Clients > View as client > Edit mode.

## The controls (Sandbox page)

| Control | What it does |
| --- | --- |
| **Run next step** | Moves one prospect forward: write first email > approve > send > skip to next follow-up. The button names the next action; when nothing can happen (hot lead, replied, unsubscribed) it says why instead. |
| **Simulate reply** | Interested (hot lead + credit charge), Question, Not interested, Unsubscribe (do-not-contact, all future email blocked), Out of office (sequence continues), Bounce. Status rules match production's WF4. You can also reply for real from Gmail; WF4 picks it up within a few minutes. |
| **Sandbox clock** | +1 / +4 hours, +1 / +3 / +7 days, and **Next 9am** (the next weekday 09:00). Moves the account's whole timeline back, so production's own rules apply unchanged: the 3/5/7 business-day follow-up gaps, approval reminders, the recalculation after a late approval, the 24-hour bounce pause. The sandbox also keeps its own time of day (`clients.sandbox_minutes_advanced`), shown as "Sandbox time", which the send window and "sent today" follow. |
| **Sending rules** | Real (default): the warm-up (5 a day in week 1, then 10, 20, 30, 40, spaced through the day) and sending hours (9am to 5pm Mon-Fri on the sandbox clock, in the account's send time zone). Fast testing: up to 100 a day at any hour, no spacing. |
| **Reset sandbox** | Deletes the account's test data and reseeds; clock back to now. |

Scenarios:
- **Sending hours**: with real rules, press +4 hours until Sandbox time is after 17:00 and approve a
  draft. It waits. Press **Next 9am**: it sends within a couple of minutes.
- **Follow-up cadence**: send a first email, press Skip to next follow-up, approve, send. Repeat.
- **Overdue approval**: leave a draft unapproved, Advance time 7-10 days, check the reminder
  email and Approvals, then approve and confirm the next follow-up is scheduled from the
  actual send date.
- **Unsubscribe**: Simulate reply > Unsubscribe. The row shows "Unsubscribed: all emails
  blocked"; Analytics counts an opt-out.
- **Campaign launch**: create a campaign and launch it; up to 8 simulated businesses appear.

The follow-up engine (WF5) only runs on business days, so time travelled on a weekend
produces its drafts on Monday's run.

How the clock stays out of production: `sandbox_clock_offset()` is zero for every
non-sandbox client, and `client_send_limits.clock_offset_minutes` / `sandbox_fast` are 0 /
false for them, so `send_pacing` and WF2.5 compute real clients' window and daily count
exactly as before. Only `sandbox_*` functions move timestamps, and they refuse real clients.

## Testing a change before it reaches customers

**App changes (React):** open a pull request. Vercel builds a preview URL; log into a
sandbox on the preview and test there. Merging deploys to production.

**Database changes:** write the migration as a file in `supabase/migrations` first, never
in the dashboard alone. For a risky change, apply it to a Supabase preview branch, test,
then apply it to production from the same file. Afterwards run the sandbox once against
production.

**n8n workflow changes:** never edit the live workflow first.
1. Duplicate the workflow and rename every webhook path with a `-dev` suffix
   (`wf3-send-outreach` becomes `wf3-send-outreach-dev`). Both copies can be active.
2. In the dev copy, filter to sandbox clients only, so a stray run cannot touch a real one.
   Leave scheduled dev copies inactive and run them by hand.
3. Set `platform_settings.sandbox_webhook_suffix = '-dev'`. Every sandbox button now calls
   the dev copies; production traffic still uses the live paths.
4. Test in the sandbox. When it works, copy the nodes into the live workflow, delete the
   dev copy, and set the suffix back to null.
5. Run `N8N_API_KEY=... node scripts/export-n8n-workflows.mjs` and commit the `n8n/`
   diff with the change, so workflow history lives in git. The script redacts secrets;
   review the diff anyway.

See `SANDBOX-TESTS.md` for the acceptance test plan.

## Not covered yet

- Automated regression checks on every pull request and a nightly run (planned separately).
- The future BDR agent: it can act as a sandbox customer through the same `sandbox_*`
  functions the buttons call; an agent login has not been set up.
