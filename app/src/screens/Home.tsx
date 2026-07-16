import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { LogoCloud } from "@/components/ui/logo-cloud-3";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { useSeo } from "@/hooks/useSeo";
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

// ── Root ─────────────────────────────────────────────────────────────────────

export function Home() {
  useSeo({
    title: 'Shorty Harris — AI-Powered Outbound for Small & Family Businesses',
    description: "Shorty Harris finds ideal customers, writes outreach, follows up, and routes hot leads to your team — outbound prospecting on autopilot for small and family businesses.",
    path: '/',
  });

  return (
    <div className="min-h-screen flex flex-col bg-[#f7f4ee] text-[#1a1b17] antialiased" style={FONT}>
      <PublicNav />
      <main>
        <Hero />
        <Logos />
        <Features />
        <StatsBar />
        <BigQuote />
        <DataUse />
        <CtaBand />
      </main>
      <PublicFooter />
    </div>
  );
}


// ── Hero ─────────────────────────────────────────────────────────────────────

const INDUSTRIES = ["Cleaning", "Gyms", "Hotels", "Clinics", "Retail", "Logistics"];

const HERO_BG = [
  /* green glow — top center */
  "radial-gradient(72% 55% at 50% -8%,  rgba(60,122,91,0.28)  0%, transparent 100%)",
  /* amber glow — upper right */
  "radial-gradient(55% 65% at 95% 22%,  rgba(212,135,15,0.24) 0%, transparent 100%)",
  /* teal-blue glow — left */
  "radial-gradient(48% 55% at 2%  65%,  rgba(42,122,158,0.20) 0%, transparent 100%)",
  /* coral glow — lower right */
  "radial-gradient(40% 48% at 90% 90%,  rgba(196,82,58,0.18)  0%, transparent 100%)",
  /* lime accent — lower left */
  "radial-gradient(38% 40% at 12% 92%,  rgba(106,178,60,0.14) 0%, transparent 100%)",
  /* base */
  "#faf9f7",
].join(", ");

function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-0 lg:pt-28" style={{ background: HERO_BG }}>

      {/* Decorative vertical border lines — desktop only */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        <div
          className="absolute left-[calc(50%-580px)] inset-y-0 w-px"
          style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(26,27,23,0.10) 30%, rgba(26,27,23,0.10) 80%, transparent 100%)" }}
        />
        <div
          className="absolute right-[calc(50%-580px)] inset-y-0 w-px"
          style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(26,27,23,0.10) 30%, rgba(26,27,23,0.10) 80%, transparent 100%)" }}
        />
      </div>

      {/* ── Copy ── */}
      <motion.div
        className="relative z-10 flex flex-col items-center text-center max-w-[1160px] mx-auto px-6 lg:px-12"
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: "easeOut" }}
      >
        {/* Badge */}
        <span className="inline-flex items-center gap-2 px-4 py-[7px] rounded-full bg-white/70 backdrop-blur-sm border border-[#c8e0d2] text-[#2d5e46] text-[11.5px] font-bold tracking-[0.07em] uppercase mb-7 shadow-[0_1px_6px_rgba(60,122,91,0.12)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3c7a5b] lm-pulse-dot inline-block" />
          AI-powered outbound
        </span>

        {/* Headline */}
        <h1
          className="font-extrabold tracking-[-0.045em] leading-[1.02] text-[#1a1b17] m-0 mb-6 max-w-[860px]"
          style={{ fontSize: "clamp(42px, 6.2vw, 82px)" }}
        >
          We do the outreach.{" "}
          <em className="not-italic text-[#3c7a5b]" >
            You close the deals.
          </em>
        </h1>

        {/* Subtitle */}
        <p className="text-[17px] lg:text-[19px] leading-[1.65] text-[#54574e] max-w-[500px] m-0 mb-9">
          We find the right businesses, write personalized messages,
          and route only the warm replies straight to you.
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-3 flex-wrap justify-center mb-5">
          <Link
            to="/login"
            className="inline-flex items-center bg-[#1a1b17] text-white px-7 py-[15px] rounded-[14px] text-[15px] font-bold no-underline hover:bg-[#3c7a5b] transition-all hover:-translate-y-0.5 whitespace-nowrap shadow-[0_2px_0_rgba(0,0,0,0.3),0_8px_24px_rgba(26,27,23,0.22)]"
          >
            Get started free
          </Link>
          <a
            href="#how"
            className="inline-flex items-center gap-1.5 border border-[#d8d4cc] bg-white/60 backdrop-blur-sm text-[#1a1b17] px-6 py-[14px] rounded-[14px] text-[15px] font-semibold no-underline hover:bg-white hover:border-[#c4bfb5] transition-all whitespace-nowrap"
          >
            How it works →
          </a>
        </div>

        {/* Social proof */}
        <div className="flex items-center gap-2 text-[13px] text-[#9b9e96] font-medium mb-10 justify-center">
          <span className="tracking-[3px] text-[11px] text-[#3c7a5b]">★★★★★</span>
          <span>Trusted by 200+ local businesses</span>
        </div>

        {/* Industry pills */}
        <div className="flex flex-wrap gap-2 justify-center mb-14">
          {INDUSTRIES.map((t) => (
            <span
              key={t}
              className="inline-flex px-3.5 py-[6px] rounded-full border border-[#ddd9d0] bg-white/70 backdrop-blur-sm text-[12.5px] font-medium text-[#54574e] shadow-[0_1px_3px_rgba(26,27,23,0.06)]"
            >
              {t}
            </span>
          ))}
        </div>
      </motion.div>

      
      {/* Fade to cream */}
      <div className="h-20 bg-gradient-to-b from-transparent to-[#f7f4ee]" />
    </section>
  );
}

// ── Logos ─────────────────────────────────────────────────────────────────────

const LOGO_ITEMS = [
  { src: "https://storage.efferd.com/logo/supabase-wordmark.svg", alt: "Supabase" },
  { src: "https://storage.efferd.com/logo/openai-wordmark.svg",   alt: "OpenAI" },
  { src: "https://storage.efferd.com/logo/vercel-wordmark.svg",   alt: "Vercel" },
  { src: "https://storage.efferd.com/logo/github-wordmark.svg",   alt: "GitHub" },
  { src: "https://storage.efferd.com/logo/claude-wordmark.svg",   alt: "Claude AI" },
  { src: "https://storage.efferd.com/logo/turso-wordmark.svg",    alt: "Turso" },
];

function Logos() {
  return (
    <motion.div
      className="border-t border-[#e5ddd3] py-10 lg:pb-16 text-center"
      initial="hidden" whileInView="show" viewport={VIEW} variants={fadeUp}
    >
      <span className="block text-[11px] font-bold tracking-[0.1em] uppercase text-[#9b9e96] mb-6">
        Built on tools you already trust
      </span>
      <LogoCloud
        logos={LOGO_ITEMS}
        className="opacity-40 hover:opacity-60 transition-opacity duration-300"
      />
    </motion.div>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

function Features() {
  return (
    <section id="how" className="max-w-300 mx-auto w-full px-6 lg:px-12 pb-20">
      <motion.div
        className="text-center flex flex-col items-center mb-10"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.span variants={fadeUp} className="inline-flex items-center px-3.5 py-[6px] rounded-full bg-[#edf4ef] text-[#3c7a5b] text-[11.5px] font-bold tracking-[0.07em] uppercase mb-4">
          What we do
        </motion.span>
        <motion.h2 variants={fadeUp} className="font-extrabold tracking-[-0.03em] text-[#1a1b17] m-0 mb-3" style={{ fontSize: "clamp(28px, 3vw, 40px)" }}>
          Everything handled for you
        </motion.h2>
        <motion.p variants={fadeUp} className="text-[16px] text-[#54574e] max-w-[480px] leading-[1.55] m-0">
          From finding the right targets to warming them up — we run the full outbound loop.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        {/* Card 1 — Find businesses */}
        <motion.div variants={fadeUp} className="bg-white border border-[#e5ddd3] rounded-[20px] overflow-hidden flex flex-col hover:border-[#b4d5c0] hover:shadow-[0_12px_32px_-12px_rgba(60,122,91,0.15)] transition-all">
          <div className="flex items-end justify-center px-8 py-10 pb-0 bg-[#f7f4ee] min-h-[190px]">
            <ProspectVisual />
          </div>
          <div className="p-7 pt-6">
            <h3 className="text-[18px] font-bold tracking-[-0.02em] text-[#1a1b17] m-0 mb-2">Find businesses who match</h3>
            <p className="text-[14.5px] leading-[1.6] text-[#54574e] m-0">We scan local directories and identify businesses by category, location, and size. No lists to buy, no manual research.</p>
          </div>
        </motion.div>

        {/* Card 2 — AI writes */}
        <motion.div variants={fadeUp} className="bg-white border border-[#e5ddd3] rounded-[20px] overflow-hidden flex flex-col hover:border-[#b4d5c0] hover:shadow-[0_12px_32px_-12px_rgba(60,122,91,0.15)] transition-all">
          <div className="flex items-end justify-center px-8 pt-8 pb-0 bg-[#f7f4ee] min-h-[190px]">
            <MessageVisual />
          </div>
          <div className="p-7 pt-6">
            <h3 className="text-[18px] font-bold tracking-[-0.02em] text-[#1a1b17] m-0 mb-2">AI writes every message</h3>
            <p className="text-[14.5px] leading-[1.6] text-[#54574e] m-0">Each outreach is drafted personally for that business — not a template. Your team reviews before anything goes out.</p>
          </div>
        </motion.div>

        {/* Card 3 — Filter */}
        <motion.div variants={fadeUp} className="bg-white border border-[#e5ddd3] rounded-[20px] overflow-hidden flex flex-col hover:border-[#b4d5c0] hover:shadow-[0_12px_32px_-12px_rgba(60,122,91,0.15)] transition-all">
          <div className="flex items-center justify-center px-8 pt-8 pb-0 bg-[#f7f4ee] min-h-[190px]">
            <FilterVisual />
          </div>
          <div className="p-7 pt-6">
            <h3 className="text-[18px] font-bold tracking-[-0.02em] text-[#1a1b17] m-0 mb-2">Only warm replies reach you</h3>
            <p className="text-[14.5px] leading-[1.6] text-[#54574e] m-0">Hundreds of emails go out. Only the businesses that reply with genuine interest make it to your dashboard. Zero noise.</p>
          </div>
        </motion.div>

        {/* Card 4 — Close */}
        <motion.div variants={fadeUp} className="bg-white border border-[#e5ddd3] rounded-[20px] overflow-hidden flex flex-col hover:border-[#b4d5c0] hover:shadow-[0_12px_32px_-12px_rgba(60,122,91,0.15)] transition-all">
          <div className="flex items-end justify-center px-8 pt-8 pb-0 bg-[#f7f4ee] min-h-[190px]">
            <LeadCardVisual />
          </div>
          <div className="p-7 pt-6">
            <h3 className="text-[18px] font-bold tracking-[-0.02em] text-[#1a1b17] m-0 mb-2">Close with full context</h3>
            <p className="text-[14.5px] leading-[1.6] text-[#54574e] m-0">See what they said, the suggested next step, and their contact details - all in one tap. Just show up and close.</p>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ── Feature card visuals ─────────────────────────────────────────────────── */

function ProspectVisual() {
  const rows = [
    { name: "Kabwata Laundry Co.",  cat: "Laundry · Lusaka",   match: true  },
    { name: "GreenClean Services",  cat: "Cleaning · Lusaka",  match: true  },
    { name: "Apex Fitness Hub",     cat: "Fitness · Cairo Rd", match: false },
    { name: "Northwind Logistics",  cat: "Logistics · Ndola",  match: true  },
  ];
  return (
    <div className="w-full max-w-[340px] flex flex-col gap-1.5 pb-1">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2.5 bg-white rounded-[10px] border border-[#e8e3da] px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className={`w-7 h-7 rounded-[7px] shrink-0 grid place-items-center text-[11px] font-bold ${r.match ? "bg-[#edf4ef] text-[#3c7a5b]" : "bg-[#f5f2ec] text-[#9b9e96]"}`}>
            {r.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] font-bold text-[#1a1b17] truncate">{r.name}</div>
            <div className="text-[10.5px] text-[#9b9e96] truncate">{r.cat}</div>
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
    <div className="w-full max-w-[340px] bg-white rounded-[13px] border border-[#e8e3da] overflow-hidden shadow-[0_4px_16px_-4px_rgba(0,0,0,0.10)] mb-1">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#e8e3da] bg-[#faf8f5]">
        <div className="w-2 h-2 rounded-full bg-[#3c7a5b] animate-pulse" />
        <span className="text-[10px] font-semibold text-[#9b9e96]">AI drafting message…</span>
        <div className="ml-auto flex gap-[3px] items-end">
          {[0, 150, 300].map((d) => (
            <div key={d} className="w-1 h-1 rounded-full bg-[#3c7a5b] animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
      <div className="px-3.5 py-2.5 flex flex-col gap-1.5">
        <div className="text-[10.5px] text-[#9b9e96]">To: <span className="text-[#1a1b17] font-semibold">Kabwata Laundry Co.</span></div>
        <div className="text-[10.5px] text-[#9b9e96]">Subject: <span className="text-[#1a1b17] font-semibold">Partnership opportunity</span></div>
        <div className="h-px bg-[#ece8df] my-0.5" />
        <p className="text-[10.5px] text-[#54574e] leading-relaxed m-0">
          Hi there, I came across Kabwata Laundry in Lusaka and wanted to reach out about connecting you with more corporate clients in your area…
        </p>
        <div className="flex flex-col gap-1 mt-0.5">
          <div className="h-2 bg-[#ece8df] rounded-full w-full" />
          <div className="h-2 bg-[#ece8df] rounded-full w-4/5" />
        </div>
      </div>
    </div>
  );
}

function FilterVisual() {
  return (
    <div className="flex items-center gap-4 w-full max-w-[320px]">
      {/* Outbound emails */}
      <div className="flex flex-col gap-1.5 flex-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-white rounded-[7px] border border-[#e8e3da] px-2 py-1.5">
            <div className="w-3.5 h-3.5 rounded-[3px] bg-[#f5f2ec] shrink-0" />
            <div className="flex-1 flex flex-col gap-[3px]">
              <div className="h-1.5 bg-[#e8e3da] rounded-full" />
              <div className="h-1.5 bg-[#e8e3da] rounded-full w-3/5" />
            </div>
          </div>
        ))}
        <div className="text-[9.5px] text-[#9b9e96] text-center font-semibold mt-0.5">200+ sent</div>
      </div>

      {/* Filter */}
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <div className="w-10 h-10 rounded-[10px] bg-[#3c7a5b] grid place-items-center shadow-[0_2px_8px_rgba(60,122,91,0.30)]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M4.5 8h7M7 12h2" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="text-[9px] text-[#9b9e96] font-semibold">AI filter</div>
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
          <path d="M2 6h12M10 2l4 4-4 4" stroke="#c4bfb5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Hot leads */}
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
    <div className="w-full max-w-[340px] bg-white rounded-[13px] border border-[#e8e3da] overflow-hidden shadow-[0_4px_16px_-4px_rgba(0,0,0,0.10)] mb-1">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[#e8e3da] bg-[#faf8f5]">
        <div className="w-6 h-6 rounded-[6px] bg-[#edf4ef] grid place-items-center text-[10px] font-black text-[#3c7a5b] shrink-0">G</div>
        <span className="text-[11.5px] font-bold text-[#1a1b17]">GreenClean Services</span>
        <span className="ml-auto text-[9px] font-bold bg-[#edf4ef] text-[#3c7a5b] rounded-full px-2 py-[2px] shrink-0">New</span>
      </div>
      <div className="px-3.5 py-2.5 flex flex-col gap-2">
        <div>
          <div className="text-[9px] text-[#9b9e96] font-bold uppercase tracking-wider mb-1">What they said</div>
          <p className="text-[10.5px] text-[#54574e] italic leading-relaxed m-0">"Please send over your pricing. We've been looking for a partner like this."</p>
        </div>
        <div className="text-[10px] text-[#3c7a5b] font-semibold">→ Call them today — they're ready to talk</div>
        <div className="flex gap-1.5">
          <div className="flex-1 rounded-[7px] bg-[#3c7a5b] text-white text-[10px] font-bold text-center py-1.5">Call</div>
          <div className="flex-1 rounded-[7px] border border-[#e8e3da] text-[#54574e] text-[10px] font-semibold text-center py-1.5">Email</div>
          <div className="flex-1 rounded-[7px] border border-[#e8e3da] text-[#54574e] text-[10px] font-semibold text-center py-1.5">WhatsApp</div>
        </div>
      </div>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar() {
  return (
    <motion.section
      className="grid grid-cols-1 md:grid-cols-3 bg-[#121510] divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.07)]"
      id="results"
      initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
    >
      {[
        { n: "2,400+", l: "Hot leads delivered" },
        { n: "4.2×",   l: "Avg. ROI per campaign" },
        { n: "< 48h",  l: "Time to first lead" },
      ].map((s) => (
        <motion.div key={s.l} variants={fadeUp} className="py-16 px-12 text-center">
          <div className="font-extrabold tracking-[-0.04em] leading-none text-white mb-2.5" style={{ fontSize: "clamp(44px, 4.5vw, 58px)" }}>
            {s.n}
          </div>
          <div className="text-[14px] text-white/50 font-medium">{s.l}</div>
        </motion.div>
      ))}
    </motion.section>
  );
}

// ── Quote ─────────────────────────────────────────────────────────────────────

function BigQuote() {
  return (
    <section className="max-w-[840px] mx-auto px-6 lg:px-12 py-24">
      <motion.div className="text-center" initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}>
        <motion.div variants={fadeUp} className="text-[88px] font-black text-[#edf4ef] leading-[0.55] mb-6">
          &#8220;
        </motion.div>
        <motion.blockquote
          variants={fadeUp}
          className="not-italic font-semibold tracking-[-0.025em] leading-[1.4] text-[#1a1b17] m-0 mb-9"
          style={{ fontSize: "clamp(22px, 2.5vw, 30px)" }}
        >
          Shorty Harris tripled our qualified meetings without adding a single
          person to the team. The leads come pre-warmed. We just close them.
        </motion.blockquote>
        <motion.div variants={fadeUp} className="inline-flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-full bg-[#edf4ef] text-[#3c7a5b] grid place-items-center text-[16px] font-extrabold shrink-0">D</div>
          <div className="text-left">
            <div className="text-[14.5px] font-bold text-[#1a1b17]">Dana Whitfield</div>
            <div className="text-[12.5px] text-[#9b9e96] mt-0.5">Head of Growth, Northwind Logistics</div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ── Data use ──────────────────────────────────────────────────────────────────
// Explicit, plain-language disclosure of why Shorty Harris requests Gmail
// access — required to be visible on the public homepage (not just the
// privacy policy) for Google OAuth verification of the Gmail scope.

function DataUse() {
  return (
    <motion.section
      className="max-w-[720px] mx-auto px-6 lg:px-12 py-16 text-center"
      initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
    >
      <motion.span variants={fadeUp} className="inline-flex items-center px-3.5 py-[6px] rounded-full bg-[#edf4ef] text-[#3c7a5b] text-[11.5px] font-bold tracking-[0.07em] uppercase mb-4">
        Your data, protected
      </motion.span>
      <motion.h2
        variants={fadeUp}
        className="font-extrabold tracking-[-0.03em] text-[#1a1b17] m-0 mb-4"
        style={{ fontSize: "clamp(24px, 2.6vw, 34px)" }}
      >
        How we use your Gmail
      </motion.h2>
      <motion.p variants={fadeUp} className="text-[15px] leading-[1.7] text-[#54574e] max-w-[560px] mx-auto m-0 mb-3">
        Clients can optionally connect their own Gmail account so outreach emails go out from their real business address instead of a shared one. We use that access only to send those emails and detect replies to them — we never read unrelated mail, and we never sell or share this data with anyone.
      </motion.p>
      <motion.p variants={fadeUp} className="text-[15px] leading-[1.7] text-[#54574e] max-w-[560px] mx-auto m-0">
        Gmail access can be disconnected at any time from your dashboard's Settings page. Full details are in our{" "}
        <Link to="/privacy" className="text-[#3c7a5b] font-semibold underline underline-offset-2">Privacy Policy</Link>.
      </motion.p>
    </motion.section>
  );
}

// ── CTA band ──────────────────────────────────────────────────────────────────

function CtaBand() {
  return (
    <section className="max-w-[1200px] mx-auto w-full px-6 lg:px-12 pb-24">
      <motion.div
        className="relative overflow-hidden rounded-[28px] bg-white border border-[#cce6c6]"
        style={{ boxShadow: "0 6px 48px -12px rgba(60,122,91,0.14)" }}
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        {/* ── Left botanical ─────────────────────────────────────────── */}
        <div className="absolute inset-y-0 left-0 w-2/5 md:w-[38%] pointer-events-none select-none" aria-hidden>
          <svg viewBox="0 0 300 340" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMinYMax meet">
            {/* Deepest background — palest, widest sweep */}
            <path d="M-70 360 C-20 262 65 172 158 115 C172 146 154 234 94 302 C54 346 -4 372 -70 360Z" fill="#d8f0c4" opacity="0.42"/>
            {/* Background leaf 2 */}
            <path d="M-40 360 C-10 280 50 200 130 150 C145 185 130 260 75 320 C40 360 0 368 -40 360Z" fill="#c4e6b4" opacity="0.60"/>
            {/* Wide diagonal leaf going upper-left */}
            <path d="M62 360 C22 314 -4 264 -14 214 C-4 200 14 218 24 260 C32 296 46 334 62 360Z" fill="#7aaa68" opacity="0.68"/>
            {/* Mid-layer leaf */}
            <path d="M-20 360 C20 290 70 220 120 170 C140 195 130 260 90 310 C60 345 15 360 -20 360Z" fill="#88cc7a" opacity="0.78"/>
            {/* Rounded tropical leaf, lower-left */}
            <path d="M-52 338 C-30 310 16 294 60 290 C68 306 52 330 18 344 C-12 357 -48 351 -52 338Z" fill="#94cc7e" opacity="0.70"/>
            {/* Tall pointed foreground leaf */}
            <path d="M30 360 C35 308 52 248 72 196 C92 208 90 268 76 318 C62 350 44 366 30 360Z" fill="#66a85a" opacity="0.84"/>
            {/* Main branching stem */}
            <path d="M15 360 Q28 298 44 246" stroke="#489042" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M44 246 C30 234 16 228 12 220 C22 228 36 238 44 246Z" fill="#489042" opacity="0.88"/>
            <path d="M44 246 C58 234 70 228 76 220 C66 228 54 238 44 246Z" fill="#3a7835" opacity="0.88"/>
            {/* Second branching stem, taller */}
            <path d="M56 360 Q62 308 68 256 Q72 218 78 184" stroke="#3c8038" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
            <path d="M68 256 C54 244 40 238 36 230 C46 238 60 248 68 256Z" fill="#489042" opacity="0.84"/>
            <path d="M68 256 C82 244 94 238 98 230 C88 238 76 248 68 256Z" fill="#3a7835" opacity="0.84"/>
            <path d="M72 218 C60 208 50 202 48 194 C58 202 70 212 72 218Z" fill="#4a9044" opacity="0.82"/>
            <path d="M72 218 C84 208 92 202 96 194 C86 202 76 212 72 218Z" fill="#3c7a38" opacity="0.82"/>
            {/* Thin grass stems */}
            <path d="M-4 360 Q8 328 24 292" stroke="#6aaa5e" strokeWidth="1.9" strokeLinecap="round" fill="none"/>
            <path d="M40 360 Q52 336 68 308" stroke="#58984e" strokeWidth="1.7" strokeLinecap="round" fill="none"/>
            <path d="M62 360 Q70 342 80 320" stroke="#4a8846" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            <path d="M-16 360 Q-8 340 2 314" stroke="#72a865" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            {/* Small oval accent leaves */}
            <path d="M-6 298 C-15 285 -11 270 -3 264 C5 260 13 268 11 282 C9 294 1 308 -6 298Z" fill="#5e9858" opacity="0.76"/>
            <path d="M70 322 C64 312 67 300 74 296 C82 292 90 300 88 312 C86 322 76 330 70 322Z" fill="#6aaa60" opacity="0.78"/>
            <path d="M84 340 C78 330 82 318 90 314 C98 310 106 318 102 330 C100 340 90 348 84 340Z" fill="#7ab870" opacity="0.70"/>
            {/* Ground cover leaf */}
            <path d="M-30 360 C18 338 64 318 94 300 C102 312 96 334 72 350 C50 367 6 374 -30 360Z" fill="#a4d880" opacity="0.76"/>
            {/* Thin upright edge leaf */}
            <path d="M-12 360 C-7 330 4 304 14 284 C24 294 20 324 10 350 C4 364 -10 368 -12 360Z" fill="#5a9a56" opacity="0.72"/>
            {/* Extra small leaf near top of tall stem */}
            <path d="M78 184 C70 174 68 162 74 156 C80 152 88 160 88 172 C88 182 82 192 78 184Z" fill="#4a9040" opacity="0.78"/>
          </svg>
        </div>

        {/* ── Right botanical ─────────────────────────────────────────── */}
        <div className="absolute inset-y-0 right-0 w-2/5 md:w-[38%] pointer-events-none select-none" aria-hidden>
          <svg viewBox="0 0 300 340" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMaxYMax meet">
            {/* Deepest background */}
            <path d="M370 360 C320 262 235 172 142 115 C128 146 146 234 206 302 C246 346 304 372 370 360Z" fill="#d8f0c4" opacity="0.42"/>
            {/* Background leaf 2 */}
            <path d="M340 360 C310 280 250 200 170 150 C155 185 170 260 225 320 C260 360 300 368 340 360Z" fill="#c4e6b4" opacity="0.60"/>
            {/* Wide diagonal leaf going upper-right */}
            <path d="M238 360 C278 314 304 264 314 214 C304 200 286 218 276 260 C268 296 254 334 238 360Z" fill="#7aaa68" opacity="0.68"/>
            {/* Mid-layer leaf */}
            <path d="M320 360 C280 290 230 220 180 170 C160 195 170 260 210 310 C240 345 285 360 320 360Z" fill="#88cc7a" opacity="0.78"/>
            {/* Rounded tropical leaf, lower-right */}
            <path d="M352 338 C330 310 284 294 240 290 C232 306 248 330 282 344 C312 357 348 351 352 338Z" fill="#94cc7e" opacity="0.70"/>
            {/* Tall pointed foreground leaf */}
            <path d="M270 360 C265 308 248 248 228 196 C208 208 210 268 224 318 C238 350 256 366 270 360Z" fill="#66a85a" opacity="0.84"/>
            {/* Main branching stem */}
            <path d="M285 360 Q272 298 256 246" stroke="#489042" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M256 246 C270 234 284 228 288 220 C278 228 264 238 256 246Z" fill="#489042" opacity="0.88"/>
            <path d="M256 246 C242 234 230 228 224 220 C234 228 246 238 256 246Z" fill="#3a7835" opacity="0.88"/>
            {/* Second branching stem */}
            <path d="M244 360 Q238 308 232 256 Q228 218 222 184" stroke="#3c8038" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
            <path d="M232 256 C246 244 260 238 264 230 C254 238 240 248 232 256Z" fill="#489042" opacity="0.84"/>
            <path d="M232 256 C218 244 206 238 202 230 C212 238 224 248 232 256Z" fill="#3a7835" opacity="0.84"/>
            <path d="M228 218 C240 208 250 202 252 194 C242 202 230 212 228 218Z" fill="#4a9044" opacity="0.82"/>
            <path d="M228 218 C216 208 208 202 204 194 C214 202 224 212 228 218Z" fill="#3c7a38" opacity="0.82"/>
            {/* Thin grass stems */}
            <path d="M304 360 Q292 328 276 292" stroke="#6aaa5e" strokeWidth="1.9" strokeLinecap="round" fill="none"/>
            <path d="M260 360 Q248 336 232 308" stroke="#58984e" strokeWidth="1.7" strokeLinecap="round" fill="none"/>
            <path d="M238 360 Q230 342 220 320" stroke="#4a8846" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            <path d="M316 360 Q308 340 298 314" stroke="#72a865" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            {/* Small oval accent leaves */}
            <path d="M306 298 C315 285 311 270 303 264 C295 260 287 268 289 282 C291 294 299 308 306 298Z" fill="#5e9858" opacity="0.76"/>
            <path d="M230 322 C236 312 233 300 226 296 C218 292 210 300 212 312 C214 322 224 330 230 322Z" fill="#6aaa60" opacity="0.78"/>
            <path d="M216 340 C222 330 218 318 210 314 C202 310 194 318 198 330 C200 340 210 348 216 340Z" fill="#7ab870" opacity="0.70"/>
            {/* Ground cover leaf */}
            <path d="M330 360 C282 338 236 318 206 300 C198 312 204 334 228 350 C250 367 294 374 330 360Z" fill="#a4d880" opacity="0.76"/>
            {/* Thin upright edge leaf */}
            <path d="M312 360 C317 330 296 304 286 284 C276 294 280 324 290 350 C296 364 310 368 312 360Z" fill="#5a9a56" opacity="0.72"/>
            {/* Extra small leaf near top of tall stem */}
            <path d="M222 184 C230 174 232 162 226 156 C220 152 212 160 212 172 C212 182 218 192 222 184Z" fill="#4a9040" opacity="0.78"/>
          </svg>
        </div>

        {/* White center gradient so text stays readable */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to right, transparent 0%, white 26%, white 74%, transparent 100%)" }}
          aria-hidden
        />

        {/* ── Content ──────────────────────────────────────────────────── */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center py-[72px] px-8 md:py-[88px]">
          <motion.h2
            variants={fadeUp}
            className="font-extrabold tracking-[-0.03em] text-[#1a1b17] m-0 mb-3"
            style={{ fontSize: "clamp(26px, 3vw, 42px)" }}
          >
            Your next client is out there.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="text-[15.5px] text-[#54574e] max-w-[380px] leading-[1.6] m-0 mb-8"
          >
            Tell us about your business. We'll build your campaign and have warm leads in your inbox within 48 hours.
          </motion.p>
          <motion.div variants={fadeUp}>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 bg-[#1a3527] text-white px-8 py-[14px] rounded-full text-[15px] font-bold no-underline hover:bg-[#2d5e46] hover:-translate-y-0.5 transition-all"
              style={{ boxShadow: "0 4px 18px rgba(26,53,39,0.28)" }}
            >
              Start for Free →
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

