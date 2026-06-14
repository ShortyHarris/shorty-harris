# Database

Supabase project (sandbox): `ernbmxvdtmbvzqmhljsw`. PostgreSQL 17. 24 tables, all with Row-Level Security enabled.

The complete, runnable schema + seed is in `shorty-harris-schema-and-seed.sql` — that file is the source of truth and can rebuild the whole database on a fresh project.

## Security model (RLS)

Every table has RLS on. Two roles, resolved from the `profiles` table:

- **admin** — full read/write on everything. Policy pattern: `admin_all_*` using a `is_admin()` helper.
- **client** — read-only, and only rows where `client_id` matches their own profile's `client_id`. Resolved by a `current_client_id()` helper. A client literally cannot query another client's data — Postgres blocks it at the row level.

Two helper functions back this:
- `is_admin()` → true if the logged-in user's profile role is admin.
- `current_client_id()` → the logged-in user's client_id.

`audit_logs` is append-only, enforced by a trigger that rejects any UPDATE or DELETE.

## Tables by group

### Identity & billing
- **clients** — the businesses Shorty Harris does outreach *for*. `business_name, business_type, location, contact_email, contact_phone, status`.
- **profiles** — app users, linked 1:1 to `auth.users`. `role` (admin/client), `client_id` (null for admins). A trigger auto-creates a profile on signup.
- **billing_profiles** — one per client. `credits_remaining, sms_credits_remaining, stripe_customer_id`.
- **credit_transactions** — append ledger. `amount` (negative = deduction), `type` (purchase / hot_lead_deduction / sms_deduction / adjustment / refund).
- **payments** — test-mode payments. `amount_cents, credits_purchased, status`.

### Lead source
- **campaigns** — outreach campaigns, belong to a client. `name, status (draft/active/paused/completed), channel`. Plus scrape config for Phase 2 Apify: `search_queries[], target_locations[], max_results, scrape_enabled, last_scraped_at`.
- **prospect_imports** — each import batch, with counts (imported / duplicate / dnc_blocked).
- **prospects** — the businesses being contacted. `business_name, contact_name, email, phone, category, location, website, pipeline_status (new→contacted→replied→hot_lead→won→lost), is_sandbox`.
- **do_not_contact** — suppression list by email/phone, with reason.

### Outreach pipeline
- **messages** — generated outreach. Key fields: `body, subject, message_type (initial/follow_up_d3/d7/d14), approval_status (pending/approved/rejected/edited), send_status (not_sent/queued/sent/failed/blocked_dnc)`. The approval gate lives here.
- **replies** — inbound responses. `body, intent (interested/maybe/not_interested/stop/wrong_person/out_of_office), intent_confidence`.
- **follow_up_schedules** — day 3/7/14 follow-up jobs. `due_at, status, reschedule_reason`.
- **hot_leads** — qualified opportunities (one per prospect). `ai_summary, suggested_action, status (new/viewed/contacted/won/lost), credit_deducted`. This is what the client dashboard shows.
- **notifications** — hot-lead pings. Sandbox-logged in MVP.

### Compliance, A/B, scheduling
- **compliance_checks** — log of every pre-send check. `check_type (can_spam/gdpr/tcpa/dnc), passed, warnings`.
- **prospect_collisions** — logged when two clients would hit the same prospect; records who won and the reschedule.
- **ab_tests / ab_variants / ab_assignments / ab_metrics** — A/B testing data model (results display built; assignment logic is Phase 2).
- **holidays** — dates the follow-up engine avoids.

### Monitoring
- **error_logs** — every workflow/system error, with `source, severity, resolved`.
- **audit_logs** — append-only record of significant actions.
- **api_request_logs** — third-party API call monitoring (Gemini/Gmail/Stripe/Twilio).

## Database functions (the business logic)

- **run_compliance_check(message_id)** → evaluates CAN-SPAM / TCPA / DNC / GDPR, logs to `compliance_checks`, returns `{passed, warnings}`.
- **check_prospect_collision(message_id)** → blocks same-day cross-client contact, logs to `prospect_collisions`, returns `{collision, ...}`.
- **presend_gate(message_id)** → the single gate WF3 calls: campaign-active + compliance + collision, returns `{allow, reason, warnings}`.
- **handle_new_user()** → trigger; auto-creates a profile when an auth user signs up.
- **is_admin() / current_client_id()** → RLS helpers.
- **prevent_audit_mutation()** → trigger; keeps `audit_logs` append-only.
