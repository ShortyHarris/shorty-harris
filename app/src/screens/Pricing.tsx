import { Link } from "react-router-dom";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { CtaPhoto } from "@/components/PublicCta";
import { Faq, type FaqItem } from "@/components/PublicFaq";
import { useSeo } from "@/hooks/useSeo";
import { PackCards, StarterOffer, WhatYouPayFor } from "@/components/PricingBlocks";
import { LAUNCHES, PACKS, PRICING_MODEL, fmtUsd, lowestPerLeadPack } from "@/lib/pricing";
import { PRICING_FAQ, pricingSubhead } from "@/lib/pricingCopy";
import { PUBLIC_PAGES } from "@/lib/publicPages";
import { CTA_LABEL } from "@/lib/marketing";

// Editorial pricing page (the "Pricing page" artboards of the landing page
// redesign). Every number comes from lib/pricing.ts, the same list the Billing
// page sells, so the public prices and what a client pays never drift.

const PACK_NAMES = ["Starter", "Growth", "Scale"];

const INCLUDED = [
  "Hot leads delivered with the reply, a summary and a next step",
  `Your first ${LAUNCHES.freePerMonth} campaign launches each month are free`,
  "Finding, writing, sending and follow-ups included",
  "Nothing renews. Buy another pack when you need one",
];

const ALWAYS_FREE = [
  "Finding businesses to contact",
  "Writing each email personally",
  "Sending and follow-ups",
  "Reading every reply",
  "Approval queue and dashboard",
];

const USES_A_LEAD = [
  "A hot lead delivered to you",
  `Launching a campaign, after your first ${LAUNCHES.freePerMonth} each month`,
];

const FAQS: FaqItem[] = [
  {
    q: "What counts as a hot lead?",
    a: "A business that replies to your outreach with genuine interest, such as asking about pricing, availability or a meeting. Our AI reads every reply. Out-of-office messages, unsubscribes and “no thanks” replies are filtered out and never count as a hot lead.",
  },
  { q: "What if I don't get any hot leads?", a: PRICING_FAQ.noLeads },
  { q: PRICING_FAQ.howItWorksQ, a: PRICING_FAQ.howItWorksA },
  {
    q: "What is a campaign launch?",
    a: `Each time you start a new campaign, that is a launch. Your first ${LAUNCHES.freePerMonth} each month are free, then each one uses ${LAUNCHES.creditsAfterFree} lead from your pack.`,
  },
];

const SERIF_H2 = "m-0 font-serif font-normal leading-none tracking-[-0.03em]";

function Tick() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0 text-brand">
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

export function Pricing() {
  useSeo(PUBLIC_PAGES.pricing);

  return (
    <div className="min-h-screen flex flex-col bg-white text-ink-strong font-inter antialiased">
      <PublicNav />
      <main>
        <section className="px-5 pb-10 pt-14 text-center lg:px-12 lg:pb-16 lg:pt-[88px]">
          <h1 className={SERIF_H2} style={{ fontSize: "clamp(52px, 6.7vw, 96px)" }}>
            Pay as you go.
            <br />
            <i className="text-brand">No subscription.</i>
          </h1>
          <p className="m-0 mx-auto mt-5 max-w-[460px] text-[17px] leading-[1.5] text-ink-muted lg:mt-7 lg:text-[20px]">
            {pricingSubhead()}
          </p>
        </section>

        {PRICING_MODEL === "packs" ? <Packs /> : <CreditsFallback />}

        <section className="px-5 pt-20 lg:px-12 lg:pt-28">
          <div className="relative mx-auto h-[480px] max-w-[1344px] overflow-hidden rounded-3xl bg-[#1a1a1a] lg:h-[540px] lg:rounded-[28px]">
            <img
              src="/images/landing/hero-laundromat.webp"
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "60% 40%" }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.05)_25%,rgba(0,0,0,.78)_100%)]" aria-hidden />
            <div className="absolute inset-x-6 bottom-7 flex flex-wrap items-end justify-between gap-5 text-white lg:inset-x-14 lg:bottom-[52px] lg:gap-8">
              <h2 className="m-0 max-w-[700px] font-serif font-normal leading-[1.02] tracking-[-0.03em]" style={{ fontSize: "clamp(36px, 4.7vw, 68px)" }}>
                You only pay when a business wants to talk.
              </h2>
              <p className="m-0 max-w-[340px] text-[16px] leading-[1.55] text-white/90 lg:text-[18px]">
                Finding, writing and following up are always free. A lead leaves your pack only when a real reply reaches you.
              </p>
            </div>
          </div>
        </section>

        <section className="px-5 pt-20 lg:px-12 lg:pt-28">
          <div className="mx-auto max-w-[1000px]">
            <h2 className={`${SERIF_H2} mb-8 text-center lg:mb-12`} style={{ fontSize: "clamp(42px, 4.5vw, 64px)" }}>
              What you pay for
            </h2>
            <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
              <PayList title="Always free" rows={ALWAYS_FREE} value="Free" accent />
              <PayList title="Uses 1 lead from your pack" rows={USES_A_LEAD} value="1 lead" />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[900px] px-5 pb-20 pt-20 lg:px-12 lg:pb-28 lg:pt-28">
          <h2 className={`${SERIF_H2} mb-7 lg:mb-10`} style={{ fontSize: "clamp(42px, 4.5vw, 64px)" }}>
            Questions about pricing
          </h2>
          <Faq items={FAQS} />
        </section>

        <CtaPhoto title={<>Ready when <i>you are.</i></>} />
      </main>
      <PublicFooter />
    </div>
  );
}

function Packs() {
  const best = lowestPerLeadPack();
  return (
    <section className="px-5 lg:px-12">
      <ul className="m-0 mx-auto grid max-w-[1240px] list-none grid-cols-1 gap-4 p-0 md:grid-cols-3 lg:gap-5">
        {PACKS.map((p, k) => {
          const highlight = p.credits === best.credits;
          const per = fmtUsd(Math.round(p.priceUsd / p.credits));
          return (
            <li
              key={p.credits}
              className={`flex flex-col rounded-3xl p-7 lg:p-8 ${
                highlight ? "border-2 border-solid border-brand bg-[#fbf7ff]" : "border border-solid border-hairline bg-white"
              }`}
            >
              <div className={`text-[13px] font-semibold uppercase tracking-[0.08em] ${highlight ? "text-brand" : "text-ink-muted"}`}>
                {highlight ? "Best value" : PACK_NAMES[k] ?? `${p.credits} leads`}
              </div>
              <div className="mt-4 text-[17px] text-ink-muted">{p.credits} hot leads</div>
              <div className="mt-1.5 font-serif text-[72px] leading-none tracking-[-0.03em] lg:text-[80px]">{fmtUsd(p.priceUsd)}</div>
              <div className="mt-2.5 text-[15px] text-ink-muted">about {per} per hot lead{highlight ? ", the lowest" : ""}</div>
              <Link
                to="/signup"
                className={`mt-7 flex h-14 items-center justify-center rounded-full text-[16px] font-semibold no-underline transition-colors ${
                  highlight
                    ? "bg-brand text-white hover:bg-brand-deep"
                    : "border border-solid border-ink-strong bg-white text-ink-strong hover:bg-[#f5f5f5]"
                }`}
              >
                {CTA_LABEL}
              </Link>
              <div className="my-7 h-px bg-[#e6e6e6]" />
              <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                {INCLUDED.map((t) => (
                  <li key={t} className="flex gap-3 text-[15px] leading-[1.5] text-[#2a2a2a]">
                    <Tick />
                    {t}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="m-0 mt-7 text-center text-[14px] text-ink-muted">Prices in USD.</p>
    </section>
  );
}

function PayList({ title, rows, value, accent = false }: { title: string; rows: string[]; value: string; accent?: boolean }) {
  return (
    <div>
      <h3 className="m-0 mb-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{title}</h3>
      <ul className="m-0 list-none border-0 border-b border-solid border-[#e6e6e6] p-0">
        {rows.map((r) => (
          <li key={r} className="flex justify-between gap-6 border-0 border-t border-solid border-[#e6e6e6] py-[18px] text-[17px]">
            <span>{r}</span>
            <span className={`whitespace-nowrap font-semibold ${accent ? "text-brand" : "text-ink-strong"}`}>{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* The credits model (PRICING_MODEL = 'credits') keeps the shared pricing blocks until it gets its own design. */
function CreditsFallback() {
  return (
    <section className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-5 lg:px-12">
      <StarterOffer />
      <PackCards />
      <WhatYouPayFor />
    </section>
  );
}
