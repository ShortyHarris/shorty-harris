import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Play, Plus } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { useSeo } from "@/hooks/useSeo";
import { PACKS } from "@/lib/pricing";
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
  "inline-flex items-center justify-center h-12 px-7 rounded-full bg-forest text-white text-[15px] font-semibold no-underline hover:bg-forest-deep transition-colors whitespace-nowrap";
const BTN_SECONDARY =
  "inline-flex items-center justify-center h-12 px-7 rounded-full border border-[#d6cbb2] bg-white text-[#1a1c17] text-[15px] font-semibold no-underline hover:bg-[#efe6d3] transition-colors whitespace-nowrap";

const H2 = "font-semibold tracking-[-0.03em] leading-[1.1] text-[#1a1c17] m-0 mb-4";
const H2_SIZE: React.CSSProperties = { fontSize: "clamp(30px, 3.6vw, 46px)" };
const LEAD = "text-[16px] text-[#5b5648] max-w-[520px] leading-[1.6] m-0";

// ── Root ─────────────────────────────────────────────────────────────────────

export function Home() {
  useSeo({
    title: 'Shorty Harris - AI-Powered Outbound for Small & Family Businesses',
    description: "Shorty Harris finds ideal customers, writes outreach, follows up, and routes hot leads to your team - outbound prospecting on autopilot for small and family businesses.",
    path: '/',
  });

  return (
    <div className="min-h-screen flex flex-col bg-cream text-[#1a1c17] antialiased" style={FONT}>
      <PublicNav />
      <main>
        <Hero />
        <Story />
        <Facts />
        <Pricing />
        <Faq />
        <DataUse />
        <CtaBand />
      </main>
      <PublicFooter />
    </div>
  );
}


// ── Hero ─────────────────────────────────────────────────────────────────────

/* Product video, public/videos/product.mp4 (1920x1080, 1:15). */
const VIDEO_SRC = "/videos/product.mp4";

function Hero() {
  return (
    <section className="relative pt-20 lg:pt-32 pb-8">
      <motion.div
        className="flex flex-col items-center text-center max-w-[1160px] mx-auto px-6 lg:px-12"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h1
          className="font-semibold tracking-[-0.035em] leading-[1.04] text-[#1a1c17] m-0 mb-6 max-w-[820px]"
          style={{ fontSize: "clamp(40px, 6vw, 76px)" }}
        >
          <span className="text-[#aaa28f]">We do the outreach.</span>{" "}
          <span className="text-forest">You close the deals.</span>
        </h1>

        <p className="text-[17px] lg:text-[18px] leading-[1.6] text-[#5b5648] max-w-[440px] m-0 mb-9">
          We find local businesses that fit, write to them for you, and follow up.
          You only hear from the ones who want to talk.
        </p>

        <div className="flex items-center gap-3 flex-wrap justify-center mb-5">
          <Link to="/signup" className={BTN_PRIMARY}>Get started</Link>
          <a href="/#how" className={BTN_SECONDARY}>How it works</a>
        </div>

        <p className="text-[13px] text-[#7d7766] m-0">
          No card to sign up · You approve every email · Pay only for hot leads
        </p>
      </motion.div>

      <motion.div
        className="max-w-[1040px] mx-auto px-6 lg:px-12 mt-14 lg:mt-20"
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
    <div className="relative aspect-video w-full overflow-hidden rounded-[28px] bg-cream-deep shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)]">
      <video
        ref={ref}
        src={VIDEO_SRC}
        poster="/images/video-poster.png"
        className="absolute inset-0 h-full w-full object-cover"
        controls={playing}
        preload="metadata"
        playsInline
      />
      {!playing && (
        <button
          type="button"
          onClick={play}
          aria-label="Play the Shorty Harris video"
          className="group absolute inset-0 flex items-center justify-center border-0 bg-black/10 cursor-pointer p-0"
        >
          <span className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-sun shadow-[0_8px_30px_rgba(0,0,0,0.18)] transition-transform duration-200 group-hover:scale-105">
            <Play size={24} fill="#1a1c17" strokeWidth={0} className="ml-1" />
          </span>
          <span className="absolute bottom-5 left-6 rounded-full bg-white/85 px-3.5 py-1.5 text-[13px] font-medium text-[#1a1c17] backdrop-blur">
            Watch how it works · 1:15
          </span>
        </button>
      )}
    </div>
  );
}

// ── Story sections ────────────────────────────────────────────────────────────
// One idea per block, image on alternating sides. Photos live in
// public/images/; until one exists the frame stays a quiet warm-grey panel.

const STORY = [
  {
    id: "how",
    img: "/images/problem.jpg",
    title: "You're busy doing the work.",
    body: "You're great at what you do. Finding new customers is the job that never gets done. We take it off your plate, so your calendar fills while you stay on the job.",
  },
  {
    img: "/images/find.jpg",
    title: "We find the right people.",
    body: "We look up local businesses that fit who you want to work with, by type, size and area. No lists to buy and no hours of searching.",
  },
  {
    img: "/images/write.jpg",
    title: "We write to them for you.",
    body: "Each message is written for that business, not copied from a template. Nothing goes out until you've read it and said yes.",
  },
  {
    img: "/images/follow-up.jpg",
    title: "We follow up so you don't have to.",
    body: "If they don't answer, we try again a few days later, up to four emails in all. The moment someone replies, we stop.",
  },
  {
    img: "/images/reply.jpg",
    title: "You only talk to people who want to talk.",
    body: "When a business says \"tell me more\", it lands on your dashboard with what they said and what to do next. You only pay for these.",
  },
];

function StoryImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-[28px] bg-cream-deep">
      {!failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function Story() {
  return (
    <div>
      {STORY.map((s, i) => (
        <section
          key={s.title}
          id={s.id}
          className="max-w-[1100px] mx-auto w-full px-6 lg:px-12 py-8 lg:py-14 scroll-mt-20"
        >
          <motion.div
            className={`grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-20 items-center ${i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}
            initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
          >
            <motion.div variants={fadeUp} className="max-w-[420px]">
              <h2
                className="font-semibold tracking-[-0.03em] leading-[1.08] text-[#1a1c17] m-0 mb-5"
                style={{ fontSize: "clamp(30px, 3.6vw, 46px)" }}
              >
                {s.title}
              </h2>
              <p className="text-[17px] leading-[1.65] text-[#5b5648] m-0">{s.body}</p>
            </motion.div>
            <motion.div variants={fadeUp} className="max-w-[540px] w-full md:justify-self-center">
              <StoryImage src={s.img} />
            </motion.div>
          </motion.div>
        </section>
      ))}
    </div>
  );
}

// ── Facts band ────────────────────────────────────────────────────────────────
// What the product actually does - every line here is true of the system
// today (4-step sequence, approval queue, auto-stop rules, credit model).

const FACTS = [
  { n: "4", l: "Emails per business", sub: "A first touch, then follow-ups on day 3, 7 and 14" },
  { n: "100%", l: "Reviewed by you", sub: "Nothing sends until you approve it - or turn on auto-approve" },
  { n: "1", l: "Credit per hot lead", sub: "Cold replies, bounces and unsubscribes cost nothing" },
];

function Facts() {
  return (
    <motion.section
      className="grid grid-cols-1 md:grid-cols-3 bg-forest divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.07)]"
      initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
    >
      {FACTS.map((s) => (
        <motion.div key={s.l} variants={fadeUp} className="py-14 px-10 text-center">
          <div className="font-semibold tracking-[-0.04em] leading-none text-sun mb-2.5" style={{ fontSize: "clamp(40px, 4.2vw, 54px)" }}>
            {s.n}
          </div>
          <div className="text-[15px] text-white font-semibold">{s.l}</div>
          <div className="mt-1.5 text-[13.5px] text-white/70 leading-[1.5] max-w-[260px] mx-auto">{s.sub}</div>
        </motion.div>
      ))}
    </motion.section>
  );
}

// ── Pricing teaser ────────────────────────────────────────────────────────────
// Full details live on /pricing.

function Pricing() {
  const from = Math.min(...PACKS.map((p) => Math.round(p.priceUsd / p.credits)));
  return (
    <motion.section
      className="max-w-[760px] mx-auto w-full px-6 lg:px-12 py-16 lg:py-24 text-center flex flex-col items-center"
      initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
    >
      <motion.h2 variants={fadeUp} className={H2} style={H2_SIZE}>
        <span className="text-[#aaa28f]">Pay only when it works.</span>{" "}
        No subscription, no setup fee.
      </motion.h2>
      <motion.p variants={fadeUp} className={`${LEAD} mb-8`}>
        You buy credits, and one is used only when a business replies with real interest.
        Hot leads start at about ${from} each.
      </motion.p>
      <motion.div variants={fadeUp}>
        <Link to="/pricing" className={BTN_SECONDARY}>See pricing</Link>
      </motion.div>
    </motion.section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQS: { q: string; a: string }[] = [
  {
    q: "What counts as a hot lead?",
    a: "A business that replies to your outreach with genuine interest - asking about pricing, availability, or a meeting. Our AI reads every reply; out-of-office messages, unsubscribes and \"no thanks\" replies are filtered out and never cost a credit.",
  },
  {
    q: "Who writes the emails?",
    a: "Our AI drafts a personal message for each business based on what it does and where it is. Every email lands in your approval queue first - you can edit, approve or reject it. If you'd rather not review, auto-approve can be turned on.",
  },
  {
    q: "Do I need to connect my Gmail?",
    a: "No, it's optional. Connecting Gmail means outreach goes out from your real business address, which usually gets better replies. You can disconnect it at any time from Settings.",
  },
  {
    q: "What happens when someone replies?",
    a: "Automated follow-ups to that person stop immediately. If the reply shows interest, it appears on your dashboard as a hot lead with what they said, a suggested next step and their contact details, and we notify you.",
  },
  {
    q: "Can I pause or stop a campaign?",
    a: "Yes. You can pause or cancel any campaign or individual sequence from your dashboard. Replies, unsubscribes and bounces always stop sending automatically.",
  },
  {
    q: "Do credits cost anything if I get no hot leads?",
    a: "No. Credits are only used when a hot lead is routed to you. Prospecting, writing and follow-ups don't use credits.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="max-w-[800px] mx-auto w-full px-6 lg:px-12 pb-24 scroll-mt-20">
      <div className="text-center flex flex-col items-center mb-10">
        <h2 className={H2} style={H2_SIZE}>Questions, answered</h2>
      </div>

      <div className="rounded-2xl border border-[#e4dbc8] bg-white divide-y divide-[#e4dbc8]">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left bg-transparent border-0 cursor-pointer"
              >
                <span className="text-[16px] font-semibold text-[#1a1c17]">{f.q}</span>
                <Plus
                  size={18}
                  strokeWidth={2.2}
                  className={`shrink-0 text-[#7d7766] transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
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
                    <p className="m-0 px-6 pb-5 text-[15px] leading-[1.7] text-[#5b5648]">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[14px] text-[#7d7766]">
        Still have a question?{" "}
        <a href="mailto:hello@shortyharris.com" className="font-semibold text-[#3c7a5b] no-underline hover:underline">
          hello@shortyharris.com
        </a>
      </p>
    </section>
  );
}

// ── Gmail note ────────────────────────────────────────────────────────────────
// A short, plain-language disclosure kept visible on the public homepage for
// Google OAuth verification of the Gmail scope; the full text lives on
// /gmail-data-use.

function DataUse() {
  return (
    <p className="max-w-[640px] mx-auto w-full px-6 pb-16 m-0 text-center text-[14px] leading-[1.7] text-[#7d7766]">
      Connecting Gmail is optional. We use it only to send your approved emails and spot replies to them. We never read unrelated mail or share your data.{" "}
      <Link to="/gmail-data-use" className="font-semibold text-[#3c7a5b] no-underline hover:underline">
        How we use Gmail
      </Link>
    </p>
  );
}

// ── CTA band ──────────────────────────────────────────────────────────────────
// Background photo at public/images/cta.jpg. Without it the dark gradient
// underneath still shows.

const CTA_BG =
  "linear-gradient(rgba(22,56,41,0.55), rgba(22,56,41,0.82)), url(/images/cta.jpg), radial-gradient(60% 80% at 50% 0%, rgba(143,209,172,0.22) 0%, transparent 100%), #163829";

function CtaBand() {
  return (
    <section className="max-w-300 mx-auto w-full px-6 lg:px-12 pb-24">
      <motion.div
        className="relative overflow-hidden rounded-[28px] px-8 py-24 md:py-36 text-center"
        style={{ background: CTA_BG, backgroundSize: "cover", backgroundPosition: "center" }}
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.h2
          variants={fadeUp}
          className="font-semibold tracking-[-0.035em] leading-[1.05] text-white m-0 mb-4"
          style={{ fontSize: "clamp(34px, 4.6vw, 60px)" }}
        >
          Your next client is out there.
        </motion.h2>
        <motion.p variants={fadeUp} className="text-[17px] text-white/80 max-w-[440px] mx-auto leading-[1.6] m-0 mb-9">
          Tell us about your business and we'll build your first campaign. You only pay when a hot lead comes in.
        </motion.p>
        <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-sun text-[#163829] text-[15px] font-semibold no-underline hover:bg-[#f6c566] transition-colors"
          >
            Get started
          </Link>
          <Link
            to="/pricing"
            className="inline-flex items-center justify-center h-12 px-7 rounded-full border border-white/40 text-white text-[15px] font-semibold no-underline hover:bg-white/10 transition-colors"
          >
            See pricing
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
