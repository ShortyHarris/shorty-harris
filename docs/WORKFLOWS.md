# Workflows (n8n)

Six workflows form the pipeline, all running on n8n cloud and writing to Supabase via the `Supabase account` credential. They hand off to each other by webhook.

> All workflows were migrated from an earlier n8n Data Tables version to Supabase. The Supabase versions are the live ones; the old Data Table versions are inactive.

## WF1 — Prospect Import
**Trigger:** webhook `/webhook/wf1-import` (POST a prospect).
**Does:** normalises the input → checks `do_not_contact` (blocks if listed) → checks for a duplicate by email (skips if exists) → inserts the prospect → forwards to WF2 to generate a message.
**Output:** `imported` / `blocked` / `skipped(duplicate)`.

## WF2 — Message Generation (Gemini)
**Trigger:** webhook `/webhook/wf2-generate` (called by WF1).
**Does:** loads the prospect + client → Gemini 2.5 Flash writes a personalised email → **appends a CAN-SPAM-compliant footer** (sender postal address + unsubscribe line) → inserts the message as `pending` (awaiting approval).
**Note:** the footer is what lets generated messages pass the compliance gate later.

## WF2.5 — Approval Trigger
**Trigger:** schedule, every minute.
**Does:** finds messages that are `approved` + `not_sent`, marks them `queued`, and dispatches each to WF3. This is the bridge between a human approving in the UI and the message actually sending.

## WF3 — Send Outreach
**Trigger:** webhook `/webhook/wf3-send-outreach` (called by WF2.5).
**Does:**
1. Loads the message, confirms it's `approved`.
2. **Pre-send gate** — calls the `presend_gate` Postgres function: campaign active? compliant (CAN-SPAM/TCPA/DNC)? no collision? If it fails, marks the message `failed` and stops.
3. Checks do-not-contact again at send time.
4. Sends via Gmail.
5. Marks the message `sent`, the prospect `contacted`.
6. Creates day 3 / 7 / 14 follow-up schedule rows.

## WF4 — Intent Classification
**Trigger:** Gmail trigger (polls for replies).
**Does:** extracts the sender → looks up the prospect by email → Gemini classifies the reply intent (normalised to lowercase tokens) → inserts a `reply` row → marks the prospect `replied` → routes:
- **interested** → calls WF6 (hot lead)
- **stop** → adds the sender to `do_not_contact`
- anything else → logged only.

## WF5 — Follow-up Engine
**Trigger:** schedule, daily at 8am.
**Does:** if today is a business day (skips weekends + `holidays`), finds `contacted` prospects with a due follow-up schedule, generates a follow-up with Gemini, queues it as a `pending` message (so it also passes through the approval gate), and marks the schedule done.

## WF6 — Hot Lead Router
**Trigger:** webhook `/webhook/wf6-hot-lead` (called by WF4).
**Does:** confirms intent is `interested` → loads prospect + billing → checks the client has credits → creates a `hot_lead` (with AI summary + suggested action) → marks the prospect `hot_lead` → deducts 1 credit (ledger + balance) → logs a notification.
**If no credits:** skips routing.

## Credentials used
- **Supabase account** — database read/write (all workflows).
- **Google Gemini (PaLM) API** — WF2, WF4, WF5.
- **Gmail OAuth2** — WF3 (send), WF4 (reply trigger).
- The pre-send gate HTTP node calls Supabase's RPC endpoint with the publishable key.

## Testing note
Workflows triggered from the n8n UI's manual run don't fully populate webhook bodies, so message lookups can come up empty in manual tests. Real POSTs (and the live scheduled/webhook triggers) work correctly. The pipeline has been verified end-to-end against the live database.
