import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import "./Home.css";

const FONT: React.CSSProperties = {
  fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
};

// ── Shared animation variants ─────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11 } },
};
const VIEW = { once: true, margin: "-60px" } as const;

// ── Root ──────────────────────────────────────────────────────────────────────

export function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f7f4ee] text-[#1a1b17] antialiased" style={FONT}>
      <Nav />
      <Hero />
      <Logos />
      <Process />
      <StatsBar />
      <BigQuote />
      <CtaBand />
      <Foot />
    </div>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 flex items-center justify-between gap-6 px-6 md:px-12 py-[18px] transition-all duration-200 ${
        scrolled ? "bg-[#f7f4ee]/90 backdrop-blur-xl border-b border-[#e5ddd3]" : ""
      }`}
    >
      <Link to="/" className="text-[18px] tracking-[-0.025em] leading-none no-underline select-none">
        <span className="font-medium text-[#54574e]">Shorty</span>
        <span className="font-extrabold text-[#1a1b17]"> Harris</span>
      </Link>
      <nav className="hidden md:flex gap-8">
        <a href="#how" className="text-[14px] font-medium text-[#54574e] no-underline hover:text-[#1a1b17] transition-colors">
          How it works
        </a>
        <a href="#results" className="text-[14px] font-medium text-[#54574e] no-underline hover:text-[#1a1b17] transition-colors">
          Results
        </a>
      </nav>
      <div className="flex items-center gap-4">
        <Link to="/login" className="hidden sm:block text-[14px] font-medium text-[#54574e] no-underline hover:text-[#1a1b17] transition-colors">
          Sign in
        </Link>
        <Link
          to="/login"
          className="inline-flex items-center bg-[#1a1b17] text-white px-5 py-2.5 rounded-[10px] text-[14px] font-semibold no-underline hover:bg-[#3c7a5b] transition-colors whitespace-nowrap"
        >
          Get started <img src="https://cdn-icons-png.flaticon.com/128/14736/14736845.png" alt="arrow" className="w-4 h-4" />	
        </Link>
      </div>
    </header>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

const INDUSTRIES = ["Cleaning", "Gyms", "Hotels", "Clinics", "Retail", "Logistics"];

function Hero() {
  return (
    <section className="relative grid lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-[1200px] mx-auto w-full px-6 lg:px-12 py-16 lg:py-24 overflow-hidden">
      {/* Botanical background decoration */}
      <HeroDecor />

      {/* Copy — animates in on load */}
      <motion.div
        className="flex flex-col items-center lg:items-start text-center lg:text-left relative z-10"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: "easeOut" }}
      >
        <span className="inline-flex items-center px-3.5 py-[6px] rounded-full bg-[#edf4ef] text-[#3c7a5b] text-[11.5px] font-bold tracking-[0.07em] uppercase mb-5">
          AI-powered outbound
        </span>
        <h1
          className="font-extrabold tracking-[-0.04em] leading-[1.06] text-[#1a1b17] m-0 mb-5"
          style={{ fontSize: "clamp(40px, 4.2vw, 60px)" }}
        >
          More clients,<br />
          <em className="italic text-[#3c7a5b] font-bold">less cold calling.</em>
        </h1>
        <p className="text-[17px] leading-[1.6] text-[#54574e] max-w-[440px] mx-auto lg:mx-0 m-0 mb-8">
          We find ideal businesses near you, write personalized messages, and send
          them across email and WhatsApp - routing only the warm, interested ones
          straight to your inbox.
        </p>
        <div className="flex items-center gap-4 flex-wrap justify-center lg:justify-start mb-6">
          <Link
            to="/login"
            className="inline-flex items-center bg-[#3c7a5b] text-white px-6 py-[13px] rounded-[12px] text-[15px] font-bold no-underline hover:bg-[#2a5840] hover:-translate-y-px transition-all whitespace-nowrap"
          >
            Get started free 
          </Link>
          <a href="#how" className="text-[14px] font-semibold text-[#54574e] no-underline hover:text-[#1a1b17] transition-colors">
            How it works
          </a>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-[#9b9e96] font-medium mb-6 justify-center lg:justify-start">
          <span className="text-[#3c7a5b] tracking-[2px] text-[12px]">★★★★★</span>
          <span>Trusted by 200+ local businesses</span>
        </div>
        <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
          {INDUSTRIES.map((t) => (
            <span key={t} className="inline-flex px-3 py-[5px] rounded-full border border-[#e5ddd3] bg-white text-[12.5px] font-medium text-[#54574e]">
              {t}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Visual — slightly delayed entry */}
      <motion.div
        className="flex justify-center lg:justify-end relative z-10"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.18, ease: "easeOut" }}
      >
        <LeadsMock />
      </motion.div>
    </section>
  );
}

// ── Botanical hero decoration ─────────────────────────────────────────────────

function HeroDecor() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <svg
        className="absolute top-0 right-0 h-full"
        style={{ width: "55%", maxWidth: 560 }}
        viewBox="0 0 560 520"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Large leaf — top-right */}
        <ellipse cx="480" cy="72" rx="68" ry="26" fill="#3c7a5b" opacity="0.055" transform="rotate(-28 480 72)" />
        <line x1="480" y1="46" x2="480" y2="98" stroke="#3c7a5b" opacity="0.04" strokeWidth="1.5" />

        {/* Medium leaf — mid-right */}
        <ellipse cx="530" cy="210" rx="52" ry="20" fill="#3c7a5b" opacity="0.05" transform="rotate(18 530 210)" />

        {/* Small amber leaf — lower-right */}
        <ellipse cx="460" cy="370" rx="40" ry="15" fill="#b9831f" opacity="0.06" transform="rotate(-42 460 370)" />

        {/* Tiny leaf — far upper-right */}
        <ellipse cx="545" cy="135" rx="28" ry="11" fill="#3c7a5b" opacity="0.04" transform="rotate(55 545 135)" />

        {/* Scattered organic dots */}
        <circle cx="400" cy="130" r="5" fill="#3c7a5b" opacity="0.07" />
        <circle cx="518" cy="295" r="4" fill="#b9831f" opacity="0.06" />
        <circle cx="375" cy="300" r="3" fill="#3c7a5b" opacity="0.05" />
        <circle cx="500" cy="430" r="6" fill="#3c7a5b" opacity="0.04" />
        <circle cx="350" cy="200" r="2.5" fill="#b9831f" opacity="0.06" />

        {/* Stem curve */}
        <path d="M470 40 C480 110 500 180 520 240" stroke="#3c7a5b" opacity="0.035" strokeWidth="1.5" fill="none" strokeDasharray="4 6" />
      </svg>
    </div>
  );
}

// ── Leads mock ────────────────────────────────────────────────────────────────

const MOCK_LEADS = [
  { name: "Kabwata Laundry Co.", meta: "Laundry · Lusaka", excerpt: '"Sounds great, when can we call?"', status: "new" as const },
  { name: "GreenClean Services", meta: "Cleaning · Lusaka", excerpt: '"Please send over your pricing."', status: "new" as const },
  { name: "Apex Fitness Hub",    meta: "Fitness · Cairo Rd", excerpt: '"We spoke last week - following up."', status: "seen" as const },
];

function LeadsMock() {
  return (
    <div className="relative w-full max-w-[400px]">
      {/* Notification toast */}
      <div className="lm-ping-in flex items-center gap-2.5 bg-white border border-[#e5ddd3] rounded-[14px] px-4 py-3 shadow-[0_8px_24px_-8px_rgba(20,22,18,0.12)] mb-3.5">
        <div className="lm-pulse-dot w-2 h-2 rounded-full bg-[#3c7a5b] shrink-0" />
        <div>
          <div className="text-[13px] font-bold text-[#1a1b17]">New lead arrived 🔥</div>
          <div className="text-[11.5px] text-[#9b9e96] mt-0.5">GreenClean Services replied</div>
        </div>
        <span className="ml-auto text-[11px] text-[#9b9e96] whitespace-nowrap">just now</span>
      </div>

      {/* Card */}
      <div className="lm-float bg-white border border-[#e5ddd3] rounded-[16px] overflow-hidden shadow-[0_4px_8px_-2px_rgba(20,22,18,0.06),0_24px_48px_-12px_rgba(20,22,18,0.16)]">
        <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-[#e5ddd3] bg-[#faf8f5]">
          <span className="text-[14px] font-bold text-[#1a1b17]">Hot Leads</span>
          <span className="text-[11px] font-bold bg-[#3c7a5b] text-white rounded-full px-2.5 py-[3px]">3 new</span>
        </div>
        {MOCK_LEADS.map((l) => (
          <div key={l.name} className="flex items-start gap-3 px-[18px] py-[14px] border-b border-[#e5ddd3] last:border-b-0 hover:bg-[#faf8f5] transition-colors cursor-pointer">
            <div className={`w-2 h-2 rounded-full shrink-0 mt-[5px] ${l.status === "new" ? "bg-[#3c7a5b] lm-pulse-dot" : "bg-[#d0ccc5]"}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-[#1a1b17] truncate">{l.name}</div>
              <div className="text-[11.5px] text-[#9b9e96] mt-0.5">{l.meta}</div>
              <div className="text-[12px] text-[#54574e] italic mt-1 truncate">{l.excerpt}</div>
            </div>
            <span className={`text-[10.5px] font-bold rounded-full px-2 py-[3px] whitespace-nowrap shrink-0 mt-0.5 ${l.status === "new" ? "bg-[#edf4ef] text-[#3c7a5b]" : "bg-[#f0ece6] text-[#9b9e96]"}`}>
              {l.status === "new" ? "New" : "Seen"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Logos strip ───────────────────────────────────────────────────────────────

const LOGOS = ["Northwind Logistics", "Bluepeak Clinics", "Anchor Hospitality", "Fernbridge Retail", "Solace Fitness"];

function Logos() {
  return (
    <div className="border-t border-[#e5ddd3] max-w-[1200px] mx-auto w-full px-6 lg:px-12 py-10 lg:pb-20 text-center">
      <motion.div initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}>
        <motion.span variants={fadeUp} className="block text-[11px] font-bold tracking-[0.1em] uppercase text-[#9b9e96] mb-5">
          Businesses growing with Shorty Harris
        </motion.span>
        <div className="flex flex-wrap justify-center gap-y-2.5 gap-x-10">
          {LOGOS.map((n) => (
            <motion.span key={n} variants={fadeUp} className="text-[14.5px] font-bold text-[#ccc8c0] tracking-[-0.01em] hover:text-[#3c7a5b] transition-colors cursor-default">
              {n}
            </motion.span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ── Process ───────────────────────────────────────────────────────────────────

const STEPS = [
  {
    n: "01",
    title: "We find your prospects",
    body: "We scan local business directories to find companies that match your ideal customer profile - in your city, in your niche, at scale.",
  },
  {
    n: "02",
    title: "AI crafts & sends messages",
    body: "Personalized outreach across email, SMS, and WhatsApp - written by AI, reviewed in an approval queue. Nothing sends without a sign-off.",
  },
  {
    n: "03",
    title: "Hot leads land in your inbox",
    body: "When a business replies with genuine interest, it appears in your dashboard instantly - with their contact details ready for you to close.",
  },
];

function Process() {
  return (
    <section className="max-w-[1200px] mx-auto w-full px-6 lg:px-12 pb-24" id="how">
      <motion.div
        className="text-center flex flex-col items-center mb-14"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.span variants={fadeUp} className="inline-flex items-center px-3.5 py-[6px] rounded-full bg-[#edf4ef] text-[#3c7a5b] text-[11.5px] font-bold tracking-[0.07em] uppercase mb-4">
          How it works
        </motion.span>
        <motion.h2 variants={fadeUp} className="font-extrabold tracking-[-0.03em] text-[#1a1b17] m-0 mb-3" style={{ fontSize: "clamp(28px, 3vw, 40px)" }}>
          From zero to fully booked.
        </motion.h2>
        <motion.p variants={fadeUp} className="text-[16px] text-[#54574e] max-w-[480px] leading-[1.55] m-0">
          No sales rep needed. No cold calling. Just an inbox full of businesses that want to talk.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-5"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        {STEPS.map((s) => (
          <motion.div
            key={s.n}
            variants={fadeUp}
            className="relative bg-white border border-[#e5ddd3] rounded-[18px] p-8 overflow-hidden transition-all hover:border-[#b4d5c0] hover:shadow-[0_12px_32px_-12px_rgba(60,122,91,0.18)]"
          >
            {/* Ghost step number */}
            <div className="absolute top-[-6px] right-3.5 text-[76px] font-black text-[#3c7a5b] opacity-[0.065] leading-none tracking-[-0.06em] pointer-events-none select-none">
              {s.n}
            </div>
            {/* Step illustration */}
            <div className="mb-5">
              <StepIllustration n={s.n} />
            </div>
            <h3 className="text-[18px] font-bold tracking-[-0.02em] m-0 mb-2.5 text-[#1a1b17]">{s.title}</h3>
            <p className="text-[14.5px] leading-[1.6] text-[#54574e] m-0">{s.body}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

// ── Step illustrations ────────────────────────────────────────────────────────

function StepIllustration({ n }: { n: string }) {
  if (n === "01") return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="26" fill="#edf4ef" />
      {/* Magnifying glass */}
      <circle cx="22" cy="22" r="9.5" stroke="#3c7a5b" strokeWidth="2.2" fill="white" />
      <line x1="29" y1="29" x2="38" y2="38" stroke="#3c7a5b" strokeWidth="2.5" strokeLinecap="round" />
      {/* Location pin inside glass */}
      <circle cx="22" cy="20" r="3" fill="#3c7a5b" />
      <path d="M22 23L22 26.5" stroke="#3c7a5b" strokeWidth="2" strokeLinecap="round" />
      {/* Scattered prospect dots */}
      <circle cx="9"  cy="13" r="2.5" fill="#b9831f" opacity="0.55" />
      <circle cx="41" cy="10" r="2"   fill="#3c7a5b" opacity="0.4"  />
      <circle cx="43" cy="37" r="2.5" fill="#b9831f" opacity="0.45" />
    </svg>
  );

  if (n === "02") return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="26" fill="#edf4ef" />
      {/* Envelope */}
      <rect x="9" y="16" width="30" height="22" rx="3" fill="white" stroke="#3c7a5b" strokeWidth="2" />
      <polyline points="9,16 24,27 39,16" stroke="#3c7a5b" strokeWidth="2" strokeLinejoin="round" fill="none" />
      {/* Sparkle star */}
      <path d="M39 9L40.4 13.2L44.5 14.5L40.4 15.8L39 20L37.6 15.8L33.5 14.5L37.6 13.2Z" fill="#b9831f" />
      {/* Small dot accent */}
      <circle cx="44" cy="30" r="2" fill="#3c7a5b" opacity="0.38" />
    </svg>
  );

  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="26" fill="#edf4ef" />
      {/* Bell body */}
      <path d="M26 10C19.4 10 14 16 14 23V32H38V23C38 16 32.6 10 26 10Z" fill="white" stroke="#3c7a5b" strokeWidth="2" />
      {/* Bell base bar */}
      <path d="M14 32H38" stroke="#3c7a5b" strokeWidth="2" strokeLinecap="round" />
      {/* Clapper */}
      <circle cx="26" cy="36" r="3" stroke="#3c7a5b" strokeWidth="2" fill="white" />
      {/* Notification badge with check */}
      <circle cx="35" cy="13" r="6" fill="#3c7a5b" />
      <path d="M32.5 13L34.5 15L37.5 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
      <motion.div
        className="text-center"
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.div variants={fadeUp} className="text-[88px] font-black text-[#edf4ef] leading-[0.55] mb-6">
          &#8220;
        </motion.div>
        <motion.blockquote
          variants={fadeUp}
          className="not-italic font-semibold tracking-[-0.025em] leading-[1.4] text-[#1a1b17] m-0 mb-9"
          style={{ fontSize: "clamp(22px, 2.5vw, 30px)" }}
        >
          Shorty Harris tripled our qualified meetings per week - without adding a single
          person to the team. The leads we get are already warm. We just close them.
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

// ── CTA band ──────────────────────────────────────────────────────────────────

function CtaBand() {
  return (
    <section className="max-w-[1200px] mx-auto w-full px-6 lg:px-12 pb-24">
      <motion.div
        className="rounded-[24px] py-[72px] px-6 md:px-12 text-center text-white flex flex-col items-center"
        style={{ background: "linear-gradient(135deg, #0f1e14 0%, #1a3527 100%)" }}
        initial="hidden" whileInView="show" viewport={VIEW} variants={stagger}
      >
        <motion.span variants={fadeUp} className="inline-flex items-center px-3.5 py-[6px] rounded-full bg-white/10 text-white/80 text-[11.5px] font-bold tracking-[0.07em] uppercase mb-5">
          Start today
        </motion.span>
        <motion.h2 variants={fadeUp} className="font-extrabold tracking-[-0.03em] text-white m-0 mb-4" style={{ fontSize: "clamp(28px, 3vw, 42px)" }}>
          Ready to fill your pipeline?
        </motion.h2>
        <motion.p variants={fadeUp} className="text-[16px] text-white/60 max-w-[460px] leading-[1.55] m-0 mb-8">
          Tell us about your business. We'll build a campaign and have leads in your inbox within 48 hours.
        </motion.p>
        <motion.div variants={fadeUp}>
          <Link
            to="/login"
            className="inline-flex items-center bg-white text-[#121510] px-8 py-[14px] rounded-[12px] text-[15px] font-bold no-underline hover:bg-[#edf4ef] hover:-translate-y-px transition-all"
          >
            Get started free 
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

const FOOT_LINKS = [
  { title: "Product", links: [["How it works", "#how"], ["Results", "#results"], ["Pricing", "#"]] as const },
  { title: "Company", links: [["About", "#"],    ["Contact", "#"],    ["Privacy", "#"]]  as const },
  { title: "Connect", links: [["Instagram", "#"], ["X / Twitter", "#"], ["WhatsApp", "#"]] as const },
];

function Foot() {
  const [done, setDone] = useState(false);

  return (
    <footer className="border-t border-[#e5ddd3] max-w-[1200px] mx-auto w-full px-6 lg:px-12 pt-14 pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_2fr] gap-10 lg:gap-16 pb-12">
        {/* Brand */}
        <div className="flex flex-col gap-3.5 max-w-full lg:max-w-[300px]">
          <div className="text-[17px] tracking-[-0.025em] leading-none">
            <span className="font-medium text-[#54574e]">Shorty</span>
            <span className="font-extrabold text-[#1a1b17]"> Harris</span>
          </div>
          <p className="text-[13.5px] leading-[1.55] text-[#54574e] m-0">
            AI-powered outbound that finds your ideal customers and delivers qualified leads straight to your inbox.
          </p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
            <input
              type="email"
              placeholder="Your email"
              required
              disabled={done}
              className="flex-1 min-w-0 px-3.5 py-2.5 border border-[#e5ddd3] rounded-[10px] text-[13px] bg-white text-[#1a1b17] outline-none focus:border-[#3c7a5b] placeholder:text-[#9b9e96] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={done}
              className="px-4 py-2.5 bg-[#1a1b17] text-white text-[13px] font-semibold rounded-[10px] hover:bg-[#3c7a5b] disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer border-0"
            >
              {done ? "✓ Done" : "Subscribe"}
            </button>
          </form>
        </div>
        {/* Links */}
        <div className="grid grid-cols-3 gap-6">
          {FOOT_LINKS.map((col) => (
            <div key={col.title} className="flex flex-col gap-2.5">
              <div className="text-[12px] font-bold tracking-[0.05em] uppercase text-[#1a1b17] mb-1">{col.title}</div>
              {col.links.map(([label, href]) => (
                <a key={label} href={href} className="text-[14px] text-[#54574e] no-underline hover:text-[#3c7a5b] transition-colors">{label}</a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-t border-[#e5ddd3] pt-6 text-[13px] text-[#9b9e96]">
        <span>© {new Date().getFullYear()} Shorty Harris. All rights reserved.</span>
        <Link to="/login" className="text-[13px] text-[#54574e] no-underline font-semibold hover:text-[#3c7a5b] transition-colors">
          Sign in 
        </Link>
      </div>
    </footer>
  );
}
