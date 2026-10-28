import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { useSeo } from "@/hooks/useSeo";
import { PACKS } from "@/lib/pricing";
import { PUBLIC_PAGES } from "@/lib/publicPages";

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
const BTN_SECONDARY =
  "inline-flex items-center justify-center h-12 px-7 rounded-full border border-[#8f8aa8] bg-white text-[#0e0822] text-[15px] font-semibold no-underline hover:bg-[#f9f6ff] transition-colors whitespace-nowrap";

const INCLUDED = [
  "Finding businesses that fit",
  "Emails written for each business",
  "Follow-ups on day 3, 7 and 14",
  "Hot leads with their reply and a next step",
];

const FREE = [
  "Replies that aren't interested",
  "Out-of-office messages",
  "Bounced emails and unsubscribes",
  "Prospecting, writing and follow-ups",
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "What counts as a hot lead?",
    a: "A business that replies to your outreach with genuine interest, such as asking about pricing, availability, or a meeting. Our AI reads every reply. Out-of-office messages, unsubscribes and \"no thanks\" replies are filtered out and never cost a credit.",
  },
  {
    q: "Do credits cost anything if I get no hot leads?",
    a: "No. A credit is only used when a hot lead is routed to you. Prospecting, writing and follow-ups don't use credits.",
  },
  {
    q: "Is there a subscription or setup fee?",
    a: "No. You buy a pack of credits when you want one and use them at your own pace. Buy more any time from your dashboard.",
  },
];

export function Pricing() {
  useSeo(PUBLIC_PAGES.pricing);

  return (
    <div className="min-h-screen flex flex-col bg-paper text-[#0e0822] antialiased" style={FONT}>
      <PublicNav />
      <main>
        <section className="max-w-[1160px] mx-auto px-6 lg:px-12 pt-20 lg:pt-28 pb-14 text-center flex flex-col items-center">
          <h1
            className="font-semibold tracking-[-0.035em] leading-[1.05] m-0 mb-5 max-w-[760px]"
            style={{ fontSize: "clamp(38px, 5.4vw, 64px)" }}
          >
            <span className="text-brand">Pay only when it works.</span>{" "}
            Not before.
          </h1>
          <p className="text-[17px] lg:text-[18px] leading-[1.6] text-[#605978] max-w-[500px] m-0">
            No subscription and no setup fee. You buy credits, and one credit is used only when a
            business replies with real interest and lands on your dashboard.
          </p>
        </section>

        <motion.section
          className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[960px] mx-auto w-full px-6 lg:px-12"
          initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
        >
          {PACKS.map((p) => {
            const featured = p.tag === "Most popular";
            const perLead = Math.round(p.priceUsd / p.credits);
            return (
              <motion.div
                key={p.credits}
                variants={fadeUp}
                className={`relative flex flex-col rounded-2xl border p-7 ${
                  featured ? "bg-white border-2 border-brand text-[#0e0822]" : "bg-white border-[#e8e3f7] text-[#0e0822]"
                }`}
              >
                {p.tag && (
                  <span className={`absolute top-5 right-5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    "bg-lilac text-brand"
                  }`}>
                    {p.tag}
                  </span>
                )}
                <div className={`text-[14px] font-semibold ${"text-[#605978]"}`}>
                  {p.credits} hot leads
                </div>
                <div className="mt-3 text-[44px] font-semibold tracking-[-0.04em] leading-none">${p.priceUsd}</div>
                <div className={`mt-2 text-[13.5px] ${"text-[#605978]"}`}>
                  about ${perLead} per hot lead
                </div>
                <Link
                  to="/signup"
                  className={`mt-8 ${featured
                    ? BTN_PRIMARY
                    : BTN_SECONDARY}`}
                >
                  Get started
                </Link>
              </motion.div>
            );
          })}
        </motion.section>
        <p className="mt-6 text-center text-[13px] text-[#605978]">Prices in USD.</p>

        <section className="max-w-[960px] mx-auto w-full px-6 lg:px-12 py-24 lg:py-32">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
            <ListBlock title="What a credit covers" items={INCLUDED} tone="brand" />
            <ListBlock title="What never costs a credit" items={FREE} tone="grey" />
          </div>
        </section>

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
            Get started
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone: "brand" | "grey" }) {
  return (
    <div>
      <h2 className="text-[24px] font-semibold tracking-[-0.02em] m-0 mb-6">{title}</h2>
      <ul className="m-0 p-0 list-none flex flex-col gap-3.5">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-3 text-[16px] leading-[1.5] text-[#605978]">
            <Check
              size={18}
              strokeWidth={2.4}
              className={`mt-[3px] shrink-0 ${tone === "brand" ? "text-[#7412ef]" : "text-[#605978]"}`}
            />
            {t}
          </li>
        ))}
      </ul>
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
