import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { useSeo } from "@/hooks/useSeo";
import { PackCards, StarterOffer, WhatYouPayFor } from "@/components/PricingBlocks";
import { PRICING_FAQ, pricingSubhead } from "@/lib/pricingCopy";
import { PUBLIC_PAGES } from "@/lib/publicPages";
import { CTA_LABEL } from "@/lib/marketing";

const FONT: React.CSSProperties = {
  fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.11 } } };
const VIEW = { once: true, margin: "-60px" } as const;

const BTN_PRIMARY =
  "inline-flex items-center justify-center h-12 px-7 rounded-full bg-brand text-white text-[15px] font-semibold no-underline hover:bg-brand-deep transition-colors whitespace-nowrap";

// Numbers and model-dependent answers come from lib/pricing.ts via lib/pricingCopy.ts.
const FAQS: { q: string; a: string }[] = [
  {
    q: "What counts as a hot lead?",
    a: "A business that replies to your outreach with genuine interest, such as asking about pricing, availability, or a meeting. Our AI reads every reply. Out-of-office messages, unsubscribes and \"no thanks\" replies are filtered out and never count as a hot lead.",
  },
  { q: "What if I don't get any hot leads?", a: PRICING_FAQ.noLeads },
  { q: PRICING_FAQ.howItWorksQ, a: PRICING_FAQ.howItWorksA },
];

export function Pricing() {
  useSeo(PUBLIC_PAGES.pricing);

  return (
    <div className="min-h-screen flex flex-col bg-paper text-[#0e0822] antialiased" style={FONT}>
      <PublicNav />
      <main>
        <section className="max-w-[1160px] mx-auto px-6 lg:px-12 pt-20 lg:pt-28 pb-14 text-center flex flex-col items-center">
          <h1
            className="font-semibold tracking-[-0.035em] leading-[1.05] m-0 mb-5 max-w-[760px] text-balance"
            style={{ fontSize: "clamp(38px, 5.4vw, 64px)" }}
          >
            <span className="text-brand">Pay as you go.</span>
            <br />
            No subscription.
          </h1>
          <p className="text-[17px] lg:text-[18px] leading-[1.6] text-[#605978] max-w-[500px] m-0 text-balance">
            {pricingSubhead()}
          </p>
        </section>

        <motion.section
          className="flex flex-col gap-4 max-w-[960px] mx-auto w-full px-6 lg:px-12"
          initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
        >
          <motion.div variants={fadeUp}><StarterOffer /></motion.div>
          <motion.div variants={fadeUp}><PackCards /></motion.div>
          <motion.div variants={fadeUp}><WhatYouPayFor /></motion.div>
          <motion.div variants={fadeUp} className="flex flex-col items-center gap-3 mt-6">
            <Link to="/signup" className={BTN_PRIMARY}>{CTA_LABEL}</Link>
            <p className="m-0 text-[13px] text-[#605978]">Prices in USD.</p>
          </motion.div>
        </motion.section>

        <div className="h-24 lg:h-32" />

        <Faq />

        <section className="max-w-[1160px] mx-auto w-full px-6 lg:px-12 pb-24 text-center flex flex-col items-center">
          <h2
            className="font-semibold tracking-[-0.03em] leading-[1.1] m-0 mb-6"
            style={{ fontSize: "clamp(30px, 3.6vw, 46px)" }}
          >
            Ready when you are.
          </h2>
          <Link
            to="/signup"
            className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-brand text-white text-[15px] font-semibold no-underline hover:bg-brand-deep transition-colors"
          >
            {CTA_LABEL}
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="max-w-[800px] mx-auto w-full px-6 lg:px-12 pb-24">
      <h2
        className="font-semibold tracking-[-0.03em] leading-[1.1] text-center m-0 mb-10"
        style={{ fontSize: "clamp(30px, 3.6vw, 46px)" }}
      >
        Questions about pricing
      </h2>
      <div className="rounded-2xl border border-[#e8e3f7] bg-white divide-y divide-[#e8e3f7]">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left bg-transparent border-0 cursor-pointer"
              >
                <span className="text-[16px] font-semibold text-[#0e0822]">{f.q}</span>
                <Plus
                  size={18}
                  strokeWidth={2.2}
                  className={`shrink-0 text-[#605978] transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="m-0 px-6 pb-5 text-[15px] leading-[1.7] text-[#605978]">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
