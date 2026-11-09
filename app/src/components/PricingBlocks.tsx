// Pricing pieces shared by the home page and /pricing. Every number comes from
// lib/pricing.ts; the copy switches with PRICING_MODEL.
import { Check } from "lucide-react";
import {
  CREDIT_MODEL, LAUNCHES, PACKS, PRICING_MODEL,
  fmtNum, fmtUsd, lowestPerLeadPack,
} from "@/lib/pricing";

const CARD = "relative flex flex-col rounded-2xl bg-white p-7";
const TAG = "self-start mb-3 rounded-full bg-lilac px-2.5 py-1 text-[11px] font-semibold text-brand";

/** The pack cards. Only the pack the numbers support is highlighted. */
export function PackCards() {
  if (PRICING_MODEL === "credits") {
    const bestRate = Math.max(...CREDIT_MODEL.packs.map((p) => p.credits / p.priceUsd));
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CREDIT_MODEL.packs.map((p) => {
          const best = p.credits / p.priceUsd === bestRate;
          return (
            <div key={p.priceUsd} className={`${CARD} ${best ? "border-2 border-brand" : "border border-[#e8e3f7]"}`}>
              {best && <span className={TAG}>Most credits per dollar</span>}
              <div className="text-[44px] font-semibold tracking-[-0.04em] leading-none">{fmtUsd(p.priceUsd)}</div>
              <div className="mt-2 text-[15px] font-semibold text-[#0e0822]">{fmtNum(p.credits)} credits</div>
            </div>
          );
        })}
      </div>
    );
  }

  const best = lowestPerLeadPack();
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {PACKS.map((p) => {
        const isBest = p === best;
        return (
          <div key={p.credits} className={`${CARD} ${isBest ? "border-2 border-brand" : "border border-[#e8e3f7]"}`}>
            {isBest && <span className={TAG}>Lowest price per lead</span>}
            <div className="text-[15px] font-semibold text-[#0e0822]">{fmtNum(p.credits)} hot leads</div>
            <div className="mt-3 text-[44px] font-semibold tracking-[-0.04em] leading-none">{fmtUsd(p.priceUsd)}</div>
            <div className="mt-2 text-[13.5px] text-[#605978]">about {fmtUsd(Math.round(p.priceUsd / p.credits))} per hot lead</div>
          </div>
        );
      })}
    </div>
  );
}

/** Starter offer (credit model only). */
export function StarterOffer() {
  if (PRICING_MODEL !== "credits") return null;
  const s = CREDIT_MODEL.starter;
  return (
    <div className="rounded-2xl bg-paper-deep px-7 py-5 text-[15px] leading-[1.6] text-[#0e0822]">
      <span className="font-semibold">Start with {fmtNum(s.credits)} free credits</span>{" "}
      <span className="text-[#605978]">
        ({fmtUsd(s.credits * CREDIT_MODEL.usdPerCredit)}), no card needed, valid {fmtNum(s.validDays)} days.
        {s.firstLaunchFree && " Your first campaign launch is free."}
      </span>
    </div>
  );
}

/** What is charged and what is free. */
export function WhatYouPayFor() {
  const rows: { label: string; value: string }[] =
    PRICING_MODEL === "credits"
      ? [
          { label: "Launching a campaign", value: `${fmtNum(CREDIT_MODEL.costs.launch)} credits${CREDIT_MODEL.starter.firstLaunchFree ? " (your first one is free)" : ""}` },
          { label: "Businesses found", value: `${fmtNum(CREDIT_MODEL.costs.businessesFound)} credits per ${fmtNum(CREDIT_MODEL.costs.businessesPerBlock)} we find for you` },
          { label: "Hot lead", value: `${fmtNum(CREDIT_MODEL.costs.hotLead)} credits, only when one is delivered` },
        ]
      : [
          { label: "Hot lead", value: "1 from your pack, only when one is delivered" },
          { label: "Launching a campaign", value: `Your first ${fmtNum(LAUNCHES.freePerMonth)} each month are free, then each uses ${fmtNum(LAUNCHES.creditsAfterFree)} lead from your pack` },
        ];
  const free =
    PRICING_MODEL === "credits"
      ? "Sending, follow-ups and replies are always free."
      : "Finding businesses, writing, sending, follow-ups and replies are always free.";

  return (
    <div className="rounded-2xl border border-[#e8e3f7] bg-white px-7 py-6">
      <div className="text-[15px] font-semibold text-[#0e0822] mb-3">What you pay for</div>
      <dl className="m-0 grid grid-cols-1 gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-0.5 sm:gap-4 text-[15px] leading-[1.55]">
            <dt className="font-semibold text-[#0e0822]">{r.label}</dt>
            <dd className="m-0 text-[#605978]">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 mt-4 flex items-start gap-2 text-[15px] leading-[1.55] text-[#0e0822]">
        <Check size={17} strokeWidth={2.5} className="mt-[3px] shrink-0 text-[#7412ef]" aria-hidden />
        {free}
      </p>
    </div>
  );
}
