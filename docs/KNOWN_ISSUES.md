# Known Issues & Limitations

Honest accounting of what's built, what's partial, and what's deferred — as of this MVP build.

## Fully working
- 24-table schema with RLS; multi-client isolation enforced at the database.
- Auth (Supabase) with admin/client roles.
- All 6 workflows, tested end-to-end against the live database.
- Approval gate — no send without human approval.
- Pre-send gate: compliance (CAN-SPAM/TCPA/DNC), collision prevention, and campaign-pause enforcement.
- Do-not-contact enforcement at import and at send.
- Credit deduction on hot-lead routing.
- Weekend/holiday avoidance in follow-ups.
- Admin console: Approvals, Prospects, Campaigns (create + pause/activate), Hot leads, Analytics, Monitoring.
- Client dashboard: hot leads, lead detail with call/email/WhatsApp, won/lost, billing UI, stats.

## Partial / deferred

### Payments — billing UI built, checkout not wired
The billing screen (balance, packages, history, ledger) is complete and reads live data, but the actual checkout + webhook is not connected. The payment provider is undecided (the client could not complete Stripe onboarding; alternatives like Lemon Squeezy/Paddle are under consideration). Wiring is a contained task once a provider is chosen. Contract specifies Stripe **test mode** — switching providers is a scope change requiring written client agreement.

### A/B testing — results display only
The data model and the Analytics results view are built (variants, reply rates, leading-variant highlight). The **assignment logic** — actually splitting prospects between variants in WF2 — is not built. So tests can be shown but not yet run.

### Automated test suite — not built
The contract asks for a test suite with 70%+ coverage (unit/integration/E2E). There are currently no automated tests. This is the single largest remaining contract item by effort.

### Apify scraping — Phase 2 (out of scope for this contract)
Prospects currently enter via manual/CSV/Sheets import (and the webhook). The campaign scrape-config fields exist and the "create campaign" form captures them, ready for an Apify discovery workflow — but that workflow (WF0) is not built. Per the contract, live Apify scraping is explicitly Phase 2.

## Smaller notes
- **Pre-send gate uses the publishable key inline** in WF3's HTTP node. It's browser-safe and the function is `security definer`, so it's acceptable, but the tidy version uses an n8n HTTP-header credential.
- **SMS/WhatsApp sending** is not live (TCPA risk for cold US outreach); Twilio notifications are sandbox-logged. Email is the outreach channel by design.
- **Email enrichment**: Google Maps (Phase 2 source) does not return emails reliably. A website-email enrichment step will be needed before scraped prospects can be emailed.
- **n8n manual-run testing** doesn't populate webhook bodies fully; use real POSTs or the live triggers to test.
- **Temporary anon policies** were used during early prototyping and have been removed; the database now relies entirely on proper admin/client RLS.
