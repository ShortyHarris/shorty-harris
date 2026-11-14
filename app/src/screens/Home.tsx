import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, Play, Plus, Mail, Sparkles, ArrowRight } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { useSeo } from "@/hooks/useSeo";
import { PRICING_MODEL } from "@/lib/pricing";
import { PackCards, StarterOffer, WhatYouPayFor } from "@/components/PricingBlocks";
import { PRICING_FAQ, pricingSubhead } from "@/lib/pricingCopy";
import { CTA_LABEL } from "@/lib/marketing";
import "./Home.css";

const FONT: React.CSSProperties = {
  fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};
const stagger  = { hidden: {}, show: { transition: { staggerChildren: 0.11 } } };
const VIEW = { once: true, margin: "-60px" } as const;

/* One button language for the whole public site - matches the nav pills. */
const BTN_PRIMARY =
  "inline-flex items-center justify-center h-12 px-7 rounded-full bg-brand text-white text-[15px] font-semibold no-underline hover:bg-brand-deep transition-colors whitespace-nowrap";

const H2 = "font-semibold tracking-[-0.03em] leading-[1.1] text-[#0e0822] m-0 mb-4 text-balance";
const H2_SIZE: React.CSSProperties = { fontSize: "clamp(30px, 3.6vw, 46px)" };
const LEAD = "text-[16px] text-[#605978] max-w-[540px] leading-[1.6] m-0";

/* Shown twice at most: under the hero and next to pricing. */
const TRUST = ["No subscription", "No set-up fee", "You approve every email"];

// ── Root ─────────────────────────────────────────────────────────────────────

export function Home() {
  useSeo({
    title: "Shorty Harris - Skip outreach. Talk to hot leads.",
    description: "We find local businesses, write to them and follow up. You talk to the ones who reply interested. You approve every email.",
    path: '/',
  });

  return (
    <div className="min-h-screen flex flex-col bg-paper text-[#0e0822] antialiased" style={FONT}>
      <PublicNav />
      <main>
        <Hero />
        <HowItWorks />
        <HotLeadExample />
        <Pricing />
        <Faq />
        <DataUse />
        <CtaBand />
      </main>
      <PublicFooter />
    </div>
  );
}

function TrustLine({ className = "" }: { className?: string }) {
  return (
    <ul className={`m-0 p-0 list-none flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[13px] text-[#605978] ${className}`}>
      {TRUST.map((t) => (
        <li key={t} className="inline-flex items-center gap-1.5">
          <Check size={14} strokeWidth={2.6} className="text-[#7412ef]" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

/* Product video, public/videos/product.mp4 (1920x1080, 1:15). */
const VIDEO_SRC = "/videos/product.mp4";

function Hero() {
  return (
    <section className="relative pt-16 lg:pt-28 pb-8">
      <motion.div
        className="flex flex-col items-center text-center max-w-[1160px] mx-auto px-6 lg:px-12"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h1
          className="font-semibold tracking-[-0.035em] leading-[1.04] text-[#0e0822] m-0 mb-6 max-w-[880px] text-balance"
          style={{ fontSize: "clamp(40px, 6.4vw, 80px)" }}
        >
          <span className="block text-[#0e0822]">Skip outreach.</span>
          <span className="block text-brand">Talk to <span className="whitespace-nowrap">hot leads.</span></span>
        </h1>

        <p className="text-[17px] lg:text-[19px] leading-[1.6] text-[#605978] max-w-[520px] m-0 mb-9 text-balance">
          We find, email and follow up with local businesses. You talk to the interested ones.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-6">
          <Link to="/signup" className={BTN_PRIMARY}>{CTA_LABEL}</Link>
          <a href="/#how" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#0e0822] no-underline hover:text-[#7412ef]">
            See how it works <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
          </a>
        </div>

        <TrustLine />
      </motion.div>

      <motion.div
        className="max-w-[1040px] mx-auto px-6 lg:px-12 mt-12 lg:mt-20"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
      >
        <VideoFrame />
      </motion.div>
    </section>
  );
}

function VideoFrame() {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  function play() {
    setPlaying(true);
    ref.current?.play().catch(() => {});
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[28px] bg-paper-deep">
      <video
        ref={ref}
        src={VIDEO_SRC}
        poster="/images/video-poster.webp"
        className="absolute inset-0 h-full w-full object-cover"
        controls={playing}
        preload="none"
        playsInline
      />
      {!playing && (
        <button
          type="button"
          onClick={play}
          aria-label="Play the Shorty Harris video"
          className="group absolute inset-0 flex items-end justify-end border-0 bg-transparent cursor-pointer p-5"
        >
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#e8dafd] bg-white transition-transform duration-200 group-hover:scale-105">
            <Play size={20} fill="#7412ef" strokeWidth={0} className="ml-1" />
          </span>
          <span className="absolute bottom-5 left-6 rounded-full bg-white/85 px-3.5 py-1.5 text-[13px] font-medium text-[#0e0822] backdrop-blur">
            Watch how it works · 1:15
          </span>
        </button>
      )}
    </div>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────
// Three steps, nothing more. The mechanics (how many emails, when follow-ups
// go out) live in the FAQ below.

const STEPS = [
  {
    title: "Tell us who you want to win",
    body: "The kind of businesses you want as customers, the area you cover and what you offer. It takes a couple of minutes, and there's no call to book.",
  },
  {
    title: "We do the outreach",
    body: "We find the businesses, write to each one personally and follow up. Nothing is sent until you've read it and said yes.",
  },
  {
    title: "You get hot leads",
    body: "When a business replies wanting to talk, you get their message, who they are and what to do next.",
  },
];

/* Process facts only: no promises about how many leads or how soon. */
const PROCESS_NOTES =
  PRICING_MODEL === "credits"
    ? ["You see an estimate and approve it before any credits are spent.", "Nothing is sent until you've approved it."]
    : ["Nothing is sent until you've approved it.", "Pause or stop any campaign at any time."];

function HowItWorks() {
  return (
    <section id="how" className="max-w-[1100px] mx-auto w-full px-6 lg:px-12 py-16 lg:py-24 scroll-mt-20">
      <motion.div
        className="text-center flex flex-col items-center mb-12"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.h2 variants={fadeUp} className={H2} style={H2_SIZE}>How it works</motion.h2>
        <motion.p variants={fadeUp} className={LEAD}>You set it up and approve. We do the rest.</motion.p>
      </motion.div>

      <motion.ol
        className="m-0 p-0 list-none grid grid-cols-1 md:grid-cols-3 gap-4"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        {STEPS.map((s, i) => (
          <motion.li key={s.title} variants={fadeUp} className="rounded-2xl border border-[#e8e3f7] bg-white p-7">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lilac text-brand text-[15px] font-semibold mb-5">
              {i + 1}
            </div>
            <h3 className="text-[20px] font-semibold tracking-[-0.02em] leading-[1.25] text-[#0e0822] m-0 mb-2.5">{s.title}</h3>
            <p className="text-[15.5px] leading-[1.6] text-[#605978] m-0">{s.body}</p>
          </motion.li>
        ))}
      </motion.ol>

      <motion.ul
        className="m-0 mt-6 list-none rounded-2xl bg-paper-deep px-7 py-5 flex flex-col md:flex-row md:justify-center gap-3 md:gap-10"
        initial="hidden" whileInView="show" viewport={VIEW} variants={fadeUp}
      >
        {PROCESS_NOTES.map((t) => (
          <li key={t} className="flex items-start gap-2 text-[15.5px] leading-[1.55] text-[#0e0822]">
            <Check size={17} strokeWidth={2.5} className="mt-[3px] shrink-0 text-[#7412ef]" aria-hidden />
            {t}
          </li>
        ))}
      </motion.ul>
    </section>
  );
}

// ── What a hot lead looks like ───────────────────────────────────────────────
// Shows exactly what the money buys. Clearly marked as an example: this is
// not a customer quote.

function HotLeadExample() {
  return (
    <section className="max-w-[1100px] mx-auto w-full px-6 lg:px-12 pb-16 lg:pb-24">
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.div variants={fadeUp}>
          <h2 className={H2} style={H2_SIZE}>What a hot lead looks like</h2>
          <p className={`${LEAD} mb-5`}>
            A hot lead is a business that replied wanting to talk: asking about price, availability
            or a meeting. You get their reply, a short summary and a suggested next step, so you can
            call them back the same day.
          </p>
          <p className={LEAD}>
            Out-of-office messages, "no thanks", bounces and unsubscribes are filtered out. You never pay for them.
          </p>
        </motion.div>

        <motion.figure variants={fadeUp} className="m-0 rounded-2xl border border-[#e8e3f7] bg-white p-6 shadow-[0_18px_50px_-30px_rgba(46,16,101,0.35)]">
          <div className="flex items-center justify-between gap-3 mb-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f9ef] px-2.5 py-1 text-[12px] font-semibold text-[#137a3b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1fa855]" aria-hidden /> Hot lead
            </span>
            <span className="rounded-full border border-[#e8e3f7] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8f8aa8]">
              Example
            </span>
          </div>
          <div className="text-[17px] font-semibold text-[#0e0822]">Brightside Dental Studio</div>
          <div className="text-[13.5px] text-[#605978] mb-4">Practice manager · in your area</div>

          <div className="rounded-xl bg-paper px-4 py-3.5 mb-4">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#8f8aa8] mb-1.5">
              <Mail size={13} strokeWidth={2.2} aria-hidden /> Their reply
            </div>
            <p className="m-0 text-[15px] leading-[1.55] text-[#0e0822]">
              "Thanks for reaching out. We've been meaning to sort this. Could you send prices for
              our two locations? Thursday afternoon works for a quick call."
            </p>
          </div>

          <div className="flex items-start gap-2.5 text-[14px] leading-[1.5] text-[#605978]">
            <Sparkles size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[#7412ef]" aria-hidden />
            <span><span className="font-semibold text-[#0e0822]">Next step:</span> send pricing for two sites and offer a call on Thursday afternoon.</span>
          </div>
        </motion.figure>
      </motion.div>
    </section>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────────
// Numbers come from lib/pricing.ts via the shared PricingBlocks.

function Pricing() {
  return (
    <motion.section
      id="pricing"
      className="max-w-[1000px] mx-auto w-full px-6 lg:px-12 py-16 lg:py-24 scroll-mt-20"
      initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
    >
      <div className="text-center flex flex-col items-center mb-10">
        <motion.h2 variants={fadeUp} className={H2} style={H2_SIZE}>
          <span className="text-brand">Pay as you go.</span>
          <br />
          No subscription.
        </motion.h2>
        <motion.p variants={fadeUp} className={`${LEAD} text-balance`}>{pricingSubhead()}</motion.p>
      </div>

      <motion.div variants={fadeUp} className="flex flex-col gap-4">
        <StarterOffer />
        <PackCards />
        <WhatYouPayFor />
        <div className="rounded-2xl border border-[#e8e3f7] bg-white px-7 py-6">
          <div className="text-[15px] font-semibold text-[#0e0822] mb-1.5">What we need from you</div>
          <p className="m-0 text-[15px] leading-[1.6] text-[#605978]">
            The kind of businesses you want to reach, the area you cover, what you sell, and an email
            address for your hot leads. That's it.
          </p>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-5">
        <Link to="/signup" className={BTN_PRIMARY}>{CTA_LABEL}</Link>
        <TrustLine />
        <Link to="/pricing" className="text-[14px] font-semibold text-[#7412ef] no-underline hover:underline">
          Full pricing details
        </Link>
      </motion.div>
    </motion.section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
// Answers the worries people have before they buy. The mechanics live here,
// not at the top of the page.

const GMAIL_ANSWER = (
  <>
    No, it's optional. Connecting Gmail means outreach goes out from your real business address,
    which usually gets better replies. We use it only to send your approved emails and spot replies
    to them. We never read unrelated mail or share your data, and you can disconnect it any time
    from Settings.{" "}
    <Link to="/gmail-data-use" className="font-semibold text-[#7412ef] no-underline hover:underline">How we use Gmail</Link>
  </>
);

const FAQS: { q: string; a: React.ReactNode }[] = [
  { q: "What if I don't get any hot leads?", a: PRICING_FAQ.noLeads },
  { q: "What if a \"hot lead\" isn't really interested?", a: PRICING_FAQ.notInterested },
  { q: PRICING_FAQ.howItWorksQ, a: PRICING_FAQ.howItWorksA },
  {
    q: "Will this look like spam, or hurt my reputation?",
    a: "Each email is written for that one business, not copied from a template, and nothing goes out until you approve it. When someone replies, we stop writing to them. Anyone who asks not to be contacted is never emailed again.",
  },
  {
    q: "Which businesses will you contact?",
    a: "Only the kind you ask for: the business types, area and decision-makers you set. You can see every business before anything is sent to them.",
  },
  {
    q: "How does the follow-up work?",
    a: "Each business gets a first email, then up to three follow-ups on days 3, 7 and 14, sent on business days only. The moment someone replies, the follow-ups to them stop.",
  },
  { q: "Do I need to connect my Gmail?", a: GMAIL_ANSWER },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="max-w-[800px] mx-auto w-full px-6 lg:px-12 pb-24 scroll-mt-20">
      <div className="text-center flex flex-col items-center mb-10">
        <h2 className={H2} style={H2_SIZE}>Questions, answered</h2>
      </div>

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
                  className={`shrink-0 text-[#605978] transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="m-0 px-6 pb-5 text-[15px] leading-[1.7] text-[#605978]">{f.a}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[14px] text-[#605978]">
        Still have a question?{" "}
        <a href="mailto:hello@shortyharris.com" className="font-semibold text-[#7412ef] no-underline hover:underline">
          hello@shortyharris.com
        </a>
      </p>
    </section>
  );
}

// ── Gmail note ────────────────────────────────────────────────────────────────
// The full Gmail explanation is in the FAQ answer above. This one visible line
// stays on the homepage because Google's OAuth verification of the Gmail scope
// expects the homepage to say how Gmail data is used and link to the details.

function DataUse() {
  return (
    <p className="max-w-[640px] mx-auto w-full px-6 pb-16 -mt-14 m-0 text-center text-[13.5px] leading-[1.7] text-[#605978]">
      Connecting Gmail is optional, and we only use it to send your approved emails and spot replies.{" "}
      <Link to="/gmail-data-use" className="font-semibold text-[#7412ef] no-underline hover:underline">
        How we use Gmail
      </Link>
    </p>
  );
}

// ── CTA band ──────────────────────────────────────────────────────────────────
// The one full purple block on the page: flat brand purple, no photo or gradient.
const CTA_BG =
  "#7412ef";

function CtaBand() {
  return (
    <section className="max-w-300 mx-auto w-full px-6 lg:px-12 pb-20">
      {/* No overflow clipping and a trigger that always fires (amount, not a
          negative margin): the button used to show up cut off when the slide-up
          animation was caught part-way or never started on short screens. */}
      <motion.div
        className="rounded-[28px] px-8 py-14 md:py-20 text-center"
        style={{ background: CTA_BG }}
        initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}
      >
        <motion.h2
          variants={fadeUp}
          className="font-semibold tracking-[-0.035em] leading-[1.05] text-white m-0 mb-4 text-balance"
          style={{ fontSize: "clamp(34px, 4.6vw, 60px)" }}
        >
          Your next client is already out there.
        </motion.h2>
        <motion.p variants={fadeUp} className="text-[17px] text-white/80 max-w-[460px] mx-auto leading-[1.6] m-0 mb-9">
          Tell us who you want to reach. We'll do the outreach and hand you the ones ready to talk.
        </motion.p>
        <motion.div variants={fadeUp} className="flex flex-col items-center">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-white text-[#0e0822] text-[15px] font-semibold no-underline hover:bg-[#f1e9ff] transition-colors"
          >
            {CTA_LABEL}
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
