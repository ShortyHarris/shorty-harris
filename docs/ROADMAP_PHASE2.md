# Phase 2 Roadmap

Items beyond the MVP contract, roughly in suggested order.

## 1. Payment processor — go live
- Decide the provider (the client could not onboard with Stripe; Lemon Squeezy or Paddle — both Merchant-of-Record, lighter onboarding — are strong candidates for a solo operator).
- Wire the billing screen's "Buy" button to the provider's hosted checkout.
- Build the success webhook → add credits to `billing_profiles` and log a `payments` row.
- Keep test mode until the provider account is verified.

## 2. Apify prospect discovery (WF0)
- Add an Apify Google Maps scraper, driven by each campaign's `search_queries` + `target_locations`, gated by `scrape_enabled` + `status = active`.
- Add a **second** Apify actor (or enrichment step) to extract emails from scraped business websites — Google Maps does not return emails, and email is the send channel.
- Hold (don't drop) prospects with no findable email; flag them so they never enter the send queue.
- Feed scraped + enriched prospects into the existing WF1.

## 3. A/B test assignment
- Build the admin "create A/B test" flow (define variants).
- Add assignment logic to WF2: split prospects between variants, store in `ab_assignments`, record outcomes in `ab_metrics`.
- The results dashboard already exists to display them.

## 4. Automated test suite
- Unit + integration + E2E to the contract's 70% coverage target.
- Cover: RLS isolation, the pre-send gate logic, credit deduction, the approval gate, and the workflow handoffs.

## 5. SMS / WhatsApp (carefully)
- Only with proper consent capture (TCPA). Likely an opt-in channel for warm leads, not cold outreach.
- The schema already supports it (`channel` on messages/campaigns; Twilio wired for notifications).

## 6. Operational hardening
- Move the pre-send gate's key to an n8n credential.
- Real Twilio sending for hot-lead notifications (currently sandbox-logged).
- Richer analytics: time-series trends, exportable reports, per-campaign ROI.
- Collision dashboard surfacing `prospect_collisions` in the admin UI.
