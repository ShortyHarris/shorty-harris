import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Plus, ShieldCheck } from "lucide-react";
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
  "inline-flex items-center justify-center h-12 px-7 rounded-full bg-[#0a0a0a] text-white text-[15px] font-semibold no-underline hover:bg-[#3c7a5b] transition-colors whitespace-nowrap";
const BTN_SECONDARY =
  "inline-flex items-center justify-center h-12 px-7 rounded-full border border-[#d4d4d4] bg-white text-[#0a0a0a] text-[15px] font-semibold no-underline hover:bg-[#f5f5f5] transition-colors whitespace-nowrap";

const EYEBROW =
  "inline-flex items-center px-3.5 py-[6px] rounded-full bg-[#edf4ef] text-[#3c7a5b] text-[11.5px] font-bold tracking-[0.07em] uppercase mb-4";
const H2 = "font-extrabold tracking-[-0.03em] text-[#0a0a0a] m-0 mb-3";
const H2_SIZE: React.CSSProperties = { fontSize: "clamp(28px, 3vw, 40px)" };
const LEAD = "text-[16px] text-[#525252] max-w-[520px] leading-[1.6] m-0";

// ── Root ─────────────────────────────────────────────────────────────────────

export function Home() {
  useSeo({
    title: 'Shorty Harris - AI-Powered Outbound for Small & Family Businesses',
    description: "Shorty Harris finds ideal customers, writes outreach, follows up, and routes hot leads to your team - outbound prospecting on autopilot for small and family businesses.",
    path: '/',
  });

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#0a0a0a] antialiased" style={FONT}>
      <PublicNav />
      <main>
        <Hero />
        <Features />
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

const INDUSTRIES = ["Cleaning", "Gyms", "Hotels", "Clinics", "Retail", "Logistics"];

/* One calm glow instead of five competing ones. */
const HERO_BG =
  "radial-gradient(70% 60% at 50% -10%, rgba(60,122,91,0.18) 0%, transparent 100%), #ffffff";

function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-0 lg:pt-28" style={{ background: HERO_BG }}>
      <motion.div
        className="relative z-10 flex flex-col items-center text-center max-w-[1160px] mx-auto px-6 lg:px-12"
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: "easeOut" }}
      >
        <span className="inline-flex items-center gap-2 px-4 py-[7px] rounded-full bg-white/70 backdrop-blur-sm border border-[#c8e0d2] text-[#2d5e46] text-[11.5px] font-bold tracking-[0.07em] uppercase mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3c7a5b] lm-pulse-dot inline-block" />
          AI-powered outbound
        </span>

        <h1
          className="font-extrabold tracking-[-0.045em] leading-[1.02] text-[#0a0a0a] m-0 mb-6 max-w-[860px]"
          style={{ fontSize: "clamp(42px, 6.2vw, 82px)" }}
        >
          We do the outreach.{" "}
          <em className="not-italic text-[#3c7a5b]">You close the deals.</em>
        </h1>

        <p className="text-[17px] lg:text-[19px] leading-[1.65] text-[#525252] max-w-[520px] m-0 mb-9">
          We find the right businesses, write personalized messages,
          and route only the warm replies straight to you.
        </p>

        <div className="flex items-center gap-3 flex-wrap justify-center mb-5">
          <Link to="/signup" className={BTN_PRIMARY}>Get started</Link>
          <a href="/#how" className={BTN_SECONDARY}>How it works</a>
        </div>

        {/* Honest reassurance - facts, not invented numbers */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-[#737373] font-medium mb-10">
          <span className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.6} className="text-[#3c7a5b]" /> No card to sign up</span>
          <span className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.6} className="text-[#3c7a5b]" /> Pay only for hot leads</span>
          <span className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.6} className="text-[#3c7a5b]" /> You approve every email</span>
        </div>

        <div className="flex flex-wrap gap-2 justify-center mb-14">
          {INDUSTRIES.map((t) => (
            <span
              key={t}
              className="inline-flex px-3.5 py-[6px] rounded-full border border-[#e5e5e5] bg-white/70 text-[12.5px] font-medium text-[#525252]"
            >
              {t}
            </span>
          ))}
        </div>
      </motion.div>

      <div className="h-20 bg-gradient-to-b from-transparent to-white" />
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

const FEATURES = [
  { title: "Find businesses who match", body: "We scan local directories and identify businesses by category, location, and size. No lists to buy, no manual research.", Visual: ProspectVisual, align: "items-end" },
  { title: "AI writes every message", body: "Each outreach is drafted personally for that business - not a template. You review before anything goes out.", Visual: MessageVisual, align: "items-end" },
  { title: "Only warm replies reach you", body: "Emails go out and follow up on their own. Only businesses that reply with genuine interest make it to your dashboard.", Visual: FilterVisual, align: "items-center" },
  { title: "Close with full context", body: "See what they said, the suggested next step, and their contact details - all in one tap. Just show up and close.", Visual: LeadCardVisual, align: "items-end" },
];

function Features() {
  return (
    <section id="how" className="max-w-300 mx-auto w-full px-6 lg:px-12 pb-20 scroll-mt-20">
      <motion.div
        className="text-center flex flex-col items-center mb-10"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.span variants={fadeUp} className={EYEBROW}>How it works</motion.span>
        <motion.h2 variants={fadeUp} className={H2} style={H2_SIZE}>Everything handled for you</motion.h2>
        <motion.p variants={fadeUp} className={LEAD}>
          From finding the right targets to warming them up - we run the full outbound loop.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        {FEATURES.map(({ title, body, Visual, align }, i) => (
          <motion.div
            key={title}
            variants={fadeUp}
            className="bg-white border border-[#e5e5e5] rounded-2xl overflow-hidden flex flex-col hover:border-[#b4d5c0] transition-colors"
          >
            <div className={`flex ${align} justify-center px-8 pt-8 pb-0 bg-[#f5f5f5] min-h-[190px]`}>
              <Visual />
            </div>
            <div className="p-7 pt-6">
              <div className="text-[12px] font-bold text-[#3c7a5b] mb-1.5">Step {i + 1}</div>
              <h3 className="text-[18px] font-bold tracking-[-0.02em] text-[#0a0a0a] m-0 mb-2">{title}</h3>
              <p className="text-[14.5px] leading-[1.6] text-[#525252] m-0">{body}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

/* ── Feature card visuals (illustrative sample data) ─────────────────────── */

function ProspectVisual() {
  const rows = [
    { name: "Prairie Laundry Co.",   cat: "Laundry · Bloomington, IL", match: true  },
    { name: "Main Street Cleaning",  cat: "Cleaning · Normal, IL",     match: true  },
    { name: "Ironworks Fitness",     cat: "Fitness · Peoria, IL",      match: false },
    { name: "Heartland Freight",     cat: "Logistics · Bloomington, IL", match: true },
  ];
  return (
    <div className="w-full max-w-[340px] flex flex-col gap-1.5 pb-1">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2.5 bg-white rounded-[10px] border border-[#e5e5e5] px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className={`w-7 h-7 rounded-[7px] shrink-0 grid place-items-center text-[11px] font-bold ${r.match ? "bg-[#edf4ef] text-[#3c7a5b]" : "bg-[#f5f5f5] text-[#737373]"}`}>
            {r.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] font-bold text-[#0a0a0a] truncate">{r.name}</div>
            <div className="text-[10.5px] text-[#737373] truncate">{r.cat}</div>
          </div>
          {r.match && (
            <span className="text-[9.5px] font-bold bg-[#edf4ef] text-[#3c7a5b] rounded-full px-2 py-0.5 shrink-0">Match</span>
          )}
        </div>
      ))}
    </div>
  );
}

function MessageVisual() {
  return (
    <div className="w-full max-w-[340px] bg-white rounded-[13px] border border-[#e5e5e5] overflow-hidden shadow-[0_4px_16px_-4px_rgba(0,0,0,0.10)] mb-1">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#e5e5e5] bg-[#fafafa]">
        <div className="w-2 h-2 rounded-full bg-[#3c7a5b] animate-pulse" />
        <span className="text-[10px] font-semibold text-[#737373]">AI drafting message…</span>
        <div className="ml-auto flex gap-[3px] items-end">
          {[0, 150, 300].map((d) => (
            <div key={d} className="w-1 h-1 rounded-full bg-[#3c7a5b] animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
      <div className="px-3.5 py-2.5 flex flex-col gap-1.5">
        <div className="text-[10.5px] text-[#737373]">To: <span className="text-[#0a0a0a] font-semibold">Prairie Laundry Co.</span></div>
        <div className="text-[10.5px] text-[#737373]">Subject: <span className="text-[#0a0a0a] font-semibold">A quick idea for Prairie Laundry</span></div>
        <div className="h-px bg-[#e5e5e5] my-0.5" />
        <p className="text-[10.5px] text-[#525252] leading-relaxed m-0">
          Hi there, I came across Prairie Laundry in Bloomington and wanted to reach out about bringing you more commercial accounts nearby…
        </p>
        <div className="flex flex-col gap-1 mt-0.5">
          <div className="h-2 bg-[#e5e5e5] rounded-full w-full" />
          <div className="h-2 bg-[#e5e5e5] rounded-full w-4/5" />
        </div>
      </div>
    </div>
  );
}

function FilterVisual() {
  return (
    <div className="flex items-center gap-4 w-full max-w-[320px]">
      <div className="flex flex-col gap-1.5 flex-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-white rounded-[7px] border border-[#e5e5e5] px-2 py-1.5">
            <div className="w-3.5 h-3.5 rounded-[3px] bg-[#f5f5f5] shrink-0" />
            <div className="flex-1 flex flex-col gap-[3px]">
              <div className="h-1.5 bg-[#e5e5e5] rounded-full" />
              <div className="h-1.5 bg-[#e5e5e5] rounded-full w-3/5" />
            </div>
          </div>
        ))}
        <div className="text-[9.5px] text-[#737373] text-center font-semibold mt-0.5">Emails sent</div>
      </div>

      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <div className="w-10 h-10 rounded-[10px] bg-[#3c7a5b] grid place-items-center shadow-[0_2px_8px_rgba(60,122,91,0.30)]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M4.5 8h7M7 12h2" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="text-[9px] text-[#737373] font-semibold">AI filter</div>
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
          <path d="M2 6h12M10 2l4 4-4 4" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <div className="flex flex-col gap-1.5 flex-1">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-white rounded-[7px] border border-[#b4d5c0] px-2 py-1.5 shadow-[0_1px_6px_rgba(60,122,91,0.12)]">
            <div className="w-3.5 h-3.5 rounded-[3px] bg-[#edf4ef] shrink-0" />
            <div className="flex-1 flex flex-col gap-[3px]">
              <div className="h-1.5 bg-[#b4d5c0] rounded-full" />
              <div className="h-1.5 bg-[#b4d5c0] rounded-full w-3/5" />
            </div>
          </div>
        ))}
        <div className="text-[9.5px] text-[#3c7a5b] text-center font-bold mt-0.5">Hot leads</div>
      </div>
    </div>
  );
}

function LeadCardVisual() {
  return (
    <div className="w-full max-w-[340px] bg-white rounded-[13px] border border-[#e5e5e5] overflow-hidden shadow-[0_4px_16px_-4px_rgba(0,0,0,0.10)] mb-1">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[#e5e5e5] bg-[#fafafa]">
        <div className="w-6 h-6 rounded-[6px] bg-[#edf4ef] grid place-items-center text-[10px] font-black text-[#3c7a5b] shrink-0">M</div>
        <span className="text-[11.5px] font-bold text-[#0a0a0a]">Main Street Cleaning</span>
        <span className="ml-auto text-[9px] font-bold bg-[#edf4ef] text-[#3c7a5b] rounded-full px-2 py-[2px] shrink-0">New</span>
      </div>
      <div className="px-3.5 py-2.5 flex flex-col gap-2">
        <div>
          <div className="text-[9px] text-[#737373] font-bold uppercase tracking-wider mb-1">What they said</div>
          <p className="text-[10.5px] text-[#525252] italic leading-relaxed m-0">"Please send over your pricing. We've been looking for a partner like this."</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-[#3c7a5b] font-semibold">
          <ArrowRight size={11} strokeWidth={2.6} /> Call them today - they're ready to talk
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1 rounded-[7px] bg-[#3c7a5b] text-white text-[10px] font-bold text-center py-1.5">Call</div>
          <div className="flex-1 rounded-[7px] border border-[#e5e5e5] text-[#525252] text-[10px] font-semibold text-center py-1.5">Email</div>
          <div className="flex-1 rounded-[7px] border border-[#e5e5e5] text-[#525252] text-[10px] font-semibold text-center py-1.5">WhatsApp</div>
        </div>
      </div>
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
      className="grid grid-cols-1 md:grid-cols-3 bg-[#0a0a0a] divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.07)]"
      initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
    >
      {FACTS.map((s) => (
        <motion.div key={s.l} variants={fadeUp} className="py-14 px-10 text-center">
          <div className="font-extrabold tracking-[-0.04em] leading-none text-white mb-2.5" style={{ fontSize: "clamp(40px, 4.2vw, 54px)" }}>
            {s.n}
          </div>
          <div className="text-[15px] text-white font-semibold">{s.l}</div>
          <div className="mt-1.5 text-[13.5px] text-white/55 leading-[1.5] max-w-[260px] mx-auto">{s.sub}</div>
        </motion.div>
      ))}
    </motion.section>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────

function Pricing() {
  return (
    <section id="pricing" className="max-w-300 mx-auto w-full px-6 lg:px-12 py-24 scroll-mt-20">
      <motion.div
        className="text-center flex flex-col items-center mb-12"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.span variants={fadeUp} className={EYEBROW}>Pricing</motion.span>
        <motion.h2 variants={fadeUp} className={H2} style={H2_SIZE}>Pay only when it works</motion.h2>
        <motion.p variants={fadeUp} className={LEAD}>
          No subscription and no setup fee. You buy credits, and one credit is used only when a
          business replies with real interest and lands in your dashboard as a hot lead.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[960px] mx-auto"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        {PACKS.map((p) => {
          const featured = p.tag === 'Most popular';
          const perLead = Math.round(p.priceUsd / p.credits);
          return (
            <motion.div
              key={p.credits}
              variants={fadeUp}
              className={`relative flex flex-col rounded-2xl border p-7 ${
                featured ? 'bg-[#0a0a0a] border-[#0a0a0a] text-white' : 'bg-white border-[#e5e5e5] text-[#0a0a0a]'
              }`}
            >
              {p.tag && (
                <span className={`absolute top-5 right-5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  featured ? 'bg-[#3c7a5b] text-white' : 'bg-[#edf4ef] text-[#3c7a5b]'
                }`}>
                  {p.tag}
                </span>
              )}
              <div className={`text-[14px] font-semibold ${featured ? 'text-white/70' : 'text-[#525252]'}`}>
                {p.credits} hot leads
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[44px] font-extrabold tracking-[-0.04em] leading-none">${p.priceUsd}</span>
              </div>
              <div className={`mt-2 text-[13.5px] ${featured ? 'text-white/60' : 'text-[#737373]'}`}>
                about ${perLead} per hot lead
              </div>
              <ul className={`mt-6 mb-7 flex flex-col gap-2.5 p-0 list-none text-[14px] ${featured ? 'text-white/85' : 'text-[#404040]'}`}>
                {['Prospecting and AI-written emails', 'Automatic follow-ups', 'Hot leads with reply + next step'].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={16} strokeWidth={2.4} className={`mt-0.5 shrink-0 ${featured ? 'text-[#8fd1ac]' : 'text-[#3c7a5b]'}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`mt-auto ${featured
                  ? 'inline-flex items-center justify-center h-12 px-7 rounded-full bg-white text-[#0a0a0a] text-[15px] font-semibold no-underline hover:bg-[#edf4ef] transition-colors'
                  : BTN_SECONDARY}`}
              >
                Get started
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

      <p className="mt-6 text-center text-[13px] text-[#737373]">
        Prices in USD. Buy more credits any time from your dashboard.
      </p>
    </section>
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
        <span className={EYEBROW}>FAQ</span>
        <h2 className={H2} style={H2_SIZE}>Questions, answered</h2>
      </div>

      <div className="rounded-2xl border border-[#e5e5e5] bg-white divide-y divide-[#e5e5e5]">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left bg-transparent border-0 cursor-pointer"
              >
                <span className="text-[16px] font-semibold text-[#0a0a0a]">{f.q}</span>
                <Plus
                  size={18}
                  strokeWidth={2.2}
                  className={`shrink-0 text-[#737373] transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
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
                    <p className="m-0 px-6 pb-5 text-[15px] leading-[1.7] text-[#525252]">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[14px] text-[#737373]">
        Still have a question?{" "}
        <a href="mailto:hello@shortyharris.com" className="font-semibold text-[#3c7a5b] no-underline hover:underline">
          hello@shortyharris.com
        </a>
      </p>
    </section>
  );
}

// ── Data use ──────────────────────────────────────────────────────────────────
// Explicit, plain-language disclosure of why Shorty Harris requests Gmail
// access - required to be visible on the public homepage (not just the
// privacy policy) for Google OAuth verification of the Gmail scope.

function DataUse() {
  return (
    <motion.section
      className="max-w-[960px] mx-auto w-full px-6 lg:px-12 pb-20"
      initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
    >
      <motion.div
        variants={fadeUp}
        className="flex flex-col md:flex-row gap-6 rounded-2xl border border-[#d6e8dc] bg-[#f3f8f4] p-7 md:p-9"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#3c7a5b] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <ShieldCheck size={22} strokeWidth={2} />
        </span>
        <div>
          <h2 className="m-0 mb-3 text-[22px] font-extrabold tracking-[-0.02em] text-[#0a0a0a]">How we use your Gmail</h2>
          <p className="text-[15px] leading-[1.7] text-[#525252] m-0 mb-3">
            Clients can optionally connect their own Gmail account so outreach emails go out from their real business address instead of a shared one. We use that access only to send those emails and detect replies to them - we never read unrelated mail, and we never sell or share this data with anyone.
          </p>
          <p className="text-[15px] leading-[1.7] text-[#525252] m-0">
            Gmail access can be disconnected at any time from your dashboard's Settings page. Full details are in our{" "}
            <Link to="/privacy" className="text-[#3c7a5b] font-semibold underline underline-offset-2">Privacy Policy</Link>.
          </p>
        </div>
      </motion.div>
    </motion.section>
  );
}

// ── CTA band ──────────────────────────────────────────────────────────────────

function CtaBand() {
  return (
    <section className="max-w-300 mx-auto w-full px-6 lg:px-12 pb-24">
      <motion.div
        className="relative overflow-hidden rounded-2xl bg-[#0a0a0a] px-8 py-16 md:py-20 text-center"
        style={{ background: "radial-gradient(60% 80% at 50% 0%, rgba(143,209,172,0.22) 0%, transparent 100%), #0a0a0a" }}
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.h2
          variants={fadeUp}
          className="font-extrabold tracking-[-0.03em] text-white m-0 mb-3"
          style={{ fontSize: "clamp(28px, 3.2vw, 44px)" }}
        >
          Your next client is out there.
        </motion.h2>
        <motion.p variants={fadeUp} className="text-[16px] text-white/70 max-w-[440px] mx-auto leading-[1.6] m-0 mb-8">
          Tell us about your business and we'll build your first campaign. You only pay when a hot lead comes in.
        </motion.p>
        <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-white text-[#0a0a0a] text-[15px] font-semibold no-underline hover:bg-[#edf4ef] transition-colors"
          >
            Get started
          </Link>
          <a
            href="/#pricing"
            className="inline-flex items-center justify-center h-12 px-7 rounded-full border border-white/25 text-white text-[15px] font-semibold no-underline hover:bg-white/10 transition-colors"
          >
            See pricing
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
