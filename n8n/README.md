# n8n workflow code

`code/` holds the JavaScript of the n8n Code nodes that carry business rules, one file per
node, exactly as it runs live. Automated tests (`app/src/n8n/*.test.ts`) run these files with
sample data on every pull request, so a change to sending or follow-up logic is tested before
it goes live.

| File | Workflow > node |
| --- | --- |
| `code/wf2.5-compute-per-client-send-batch.js` | WF2.5 - Approval Trigger > Compute Per-Client Send Batch |
| `code/wf3-schedule-next-follow-up.js` | WF3 - Send Outreach Message > Schedule Next Follow-up |
| `code/wf2-template-instruction.js` | WF2 - Message Generation and WF5 - Follow-up Engine > Build Template Instruction (new, Campaign Wizard) |

**Changing one of these nodes:** edit the file here, run the tests (`cd app && npx vitest run src/n8n`),
then paste the same code into the node (in a `-dev` copy first, see `docs/SANDBOX.md`). The
file and the live node must stay identical.

**Full workflow export:** `N8N_API_KEY=... node scripts/export-n8n-workflows.mjs` writes every
workflow to this folder as JSON (secrets redacted). It must be run from a machine that can
reach n8n.shortyharris.com; the cloud sessions used for development cannot.

## Backend-only calls (WF3a)

`claim_message_for_send` and `release_message_claim` can only be called by the backend
(service role) since 2026-11-07; the public key is refused. WF3's **Claim Send** and
**Release Claim** nodes therefore call **WF3a - Send Claim (backend)** (`zBzxccx9CMq5Qkzq`),
whose single HTTP node uses the n8n "Supabase account" credential. Inputs: `action`
(`claim` or `release`), `message_id`, `error`. Do not switch these calls back to the
publishable key: they would fail with "permission denied".

## Campaign Wizard: emails follow the campaign template (manual step)

Wizard campaigns store a four-email template in `campaigns.sequence`. To have the AI
personalise that template instead of writing from scratch, add two nodes to the **-dev**
copies of WF2 and WF5 first (see `docs/SANDBOX.md`), test, then copy to the live workflows:

1. **Template Input** (Set node), just before the Gemini node, with these fields:
   `message_type` (initial in WF2; the follow-up's message_type in WF5), `campaign_sequence`
   (the campaign's `sequence` column; add it to the campaign lookup's select),
   `campaign_language`, `prospect_business`, `prospect_contact`, `sender_name`.
2. **Build Template Instruction** (Code node) after it, with the code of
   `code/wf2-template-instruction.js` pasted in unchanged.
3. In the Gemini prompt, append `{{ $json.prompt_instruction }}` at the end. It is empty for
   campaigns without a template, so their emails are written exactly as today.
4. Optional: if the Gemini call fails and `has_template` is true, use `prefilled_subject` /
   `prefilled_body` (placeholders already filled) instead of skipping the prospect.

Sandbox check: create a wizard campaign for a sandbox client, launch it, and confirm the first
email in Approvals follows the template's subject and offer, with names filled in. Then do
the same for a manual campaign and confirm its emails look as they did before.

## WF3 sends the claimed copy (2026-11-13)

`claim_message_for_send` only claims an email that is still `approved`, and returns its `subject`
and `body`. WF3's **Build HTML Body** reads them from **Claim Send** (falling back to **Get Message**)
and outputs `subject`, `body` and `html_body`; **Send Via Client Gmail** sends those. This is what
makes edits, Move back to pending and Cancel in the send queue (Approvals > Approved, admin
Send queue) take effect up to the moment of sending. Do not point the Gmail node back at
**Get Message** for the subject or body.

