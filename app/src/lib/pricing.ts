// Every pricing number the site shows lives in this file. Components read from
// here; nothing is hard-coded in copy or JSX, so prices and counts can change
// in one place.
//
// PROVISIONAL: none of these prices is final.

// ── Live model: hot-lead packs ───────────────────────────────────────────────
// What the app sells today. The Billing page (what a client actually buys) and
// the public pricing both read PACKS, so the two never drift.
// One credit = one confirmed hot lead routed to the client.
export interface Pack { credits: number; priceUsd: number; tag?: string; }

export const PACKS: Pack[] = [
  { credits: 2,  priceUsd: 49 },
  { credits: 5,  priceUsd: 99,  tag: 'Most popular' },
  { credits: 10, priceUsd: 179, tag: 'Best value' },
];

/** Campaign launches. Mirrors the launch gate (lib/scrapeEnqueue.ts and the
 *  database's count_launch_on_enqueue): the first 5 launches each month are
 *  free, after that each launch uses 1 credit. Change both together. */
export const LAUNCHES = { freePerMonth: 5, creditsAfterFree: 1 };

// ── Proposed model: credits (Pricing Proposal v1, policy-v2.0) ───────────────
// PROVISIONAL and NOT LIVE: signup, billing and the "Not a real lead" dispute
// for this model are not built yet. Keep PRICING_MODEL on 'packs' until they are,
// or the site will promise things the app doesn't do.
export const CREDIT_MODEL = {
  usdPerCredit: 0.1,
  starter: { credits: 500, validDays: 90, firstLaunchFree: true },
  packs: [
    { priceUsd: 25,  credits: 250 },
    { priceUsd: 100, credits: 1100 },
    { priceUsd: 250, credits: 3000 },
  ],
  costs: {
    launch: 50,               // per campaign launch (first one free)
    businessesFound: 50,      // per block of businesses actually found
    businessesPerBlock: 100,
    hotLead: 100,             // per hot lead, only when delivered
  },
};

/** Which model the public site shows. Flip to 'credits' once the credit model
 *  is live in signup and billing. */
export const PRICING_MODEL: 'packs' | 'credits' = 'packs';

// ── Formatting helpers ───────────────────────────────────────────────────────

const num = new Intl.NumberFormat('en-US');
/** 1100 -> "1,100" */
export const fmtNum = (n: number) => num.format(n);
/** 25 -> "$25", 0.1 -> "$0.10" */
export const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);

/** The pack with the lowest price per hot lead (live model). */
export function lowestPerLeadPack(): Pack {
  return PACKS.reduce((best, p) => (p.priceUsd / p.credits < best.priceUsd / best.credits ? p : best));
}
