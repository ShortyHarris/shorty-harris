// Credit packs - the single source for both the Billing page (what a client
// actually buys) and the public Pricing section, so the two never drift.
// One credit = one confirmed hot lead routed to the client.
export interface Pack { credits: number; priceUsd: number; tag?: string; }

export const PACKS: Pack[] = [
  { credits: 2,  priceUsd: 49 },
  { credits: 5,  priceUsd: 99,  tag: 'Most popular' },
  { credits: 10, priceUsd: 179, tag: 'Best value' },
];
