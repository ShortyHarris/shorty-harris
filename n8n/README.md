# n8n workflow code

`code/` holds the JavaScript of the n8n Code nodes that carry business rules, one file per
node, exactly as it runs live. Automated tests (`app/src/n8n/*.test.ts`) run these files with
sample data on every pull request, so a change to sending or follow-up logic is tested before
it goes live.

| File | Workflow > node |
| --- | --- |
| `code/wf2.5-compute-per-client-send-batch.js` | WF2.5 - Approval Trigger > Compute Per-Client Send Batch |
| `code/wf3-schedule-next-follow-up.js` | WF3 - Send Outreach Message > Schedule Next Follow-up |

**Changing one of these nodes:** edit the file here, run the tests (`cd app && npx vitest run src/n8n`),
then paste the same code into the node (in a `-dev` copy first, see `docs/SANDBOX.md`). The
file and the live node must stay identical.

**Full workflow export:** `N8N_API_KEY=... node scripts/export-n8n-workflows.mjs` writes every
workflow to this folder as JSON (secrets redacted). It must be run from a machine that can
reach n8n.shortyharris.com; the cloud sessions used for development cannot.
