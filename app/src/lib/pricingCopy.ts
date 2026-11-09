// Pricing wording that depends on the pricing model. Numbers come from
// lib/pricing.ts; nothing here is hard-coded.
import { CREDIT_MODEL, LAUNCHES, PACKS, PRICING_MODEL, fmtNum, fmtUsd } from "@/lib/pricing";

/** One line under the pricing headline. */
export function pricingSubhead(): string {
  return PRICING_MODEL === "credits"
    ? "Start with free credits. Buy more when you need them."
    : "Buy a pack of hot leads when you need one. Nothing renews.";
}

/** FAQ answers that depend on the pricing model. */
export const PRICING_FAQ = {
  noLeads:
    PRICING_MODEL === "credits"
      ? "A hot lead is only charged when one is delivered to you. Launching a campaign and the businesses we find do use credits, and you see an estimate and approve it first. Credits held for businesses we don't end up finding are returned."
      : `A hot lead is only charged when one is delivered to you, and finding businesses, writing and follow-ups are included. The one other charge is campaign launches: your first ${LAUNCHES.freePerMonth} each month are free, then each uses ${LAUNCHES.creditsAfterFree} lead from your pack.`,
  notInterested:
    PRICING_MODEL === "credits"
      ? "Our AI reads every reply and only counts clear interest, like asking about price, availability or a meeting. If one still isn't real, mark it \"Not a real lead\" in one click and the credits are refunded."
      : "Our AI reads every reply and only counts clear interest, like asking about price, availability or a meeting. Out-of-office messages, \"no thanks\" replies, bounces and unsubscribes are filtered out and never count. If you think one isn't genuine, email us and we'll look at it.",
  howItWorksQ: PRICING_MODEL === "credits" ? "How do credits work?" : "How do packs work?",
  howItWorksA:
    PRICING_MODEL === "credits"
      ? `One credit is ${fmtUsd(CREDIT_MODEL.usdPerCredit)}. New accounts start with ${fmtNum(CREDIT_MODEL.starter.credits)} free credits, no card needed, valid ${CREDIT_MODEL.starter.validDays} days. After that you buy packs (${CREDIT_MODEL.packs.map((p) => `${fmtUsd(p.priceUsd)} for ${fmtNum(p.credits)}`).join(", ")}). You see an estimate and approve it before any credits are spent. There's no subscription and nothing renews.`
      : `You buy a pack of ${PACKS.map((p) => fmtNum(p.credits)).join(", ").replace(/, (?=[^,]*$)/, " or ")} hot leads. Each delivered hot lead uses one from your pack. There's no subscription and nothing renews; buy another pack from your dashboard whenever you need one.`,
};
