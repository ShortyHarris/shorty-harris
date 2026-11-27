import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { useSeo } from "@/hooks/useSeo";
import { LAUNCHES, PACKS, PRICING_MODEL, fmtUsd } from "@/lib/pricing";
import { PackCards, StarterOffer, WhatYouPayFor } from "@/components/PricingBlocks";
import { PRICING_FAQ, pricingSubhead } from "@/lib/pricingCopy";
import { CTA_LABEL } from "@/lib/marketing";
import { Faq, type FaqItem } from "@/components/PublicFaq";
import { CtaPhoto } from "@/components/PublicCta";
import "./Home.css";

// The editorial landing page: full-bleed photography, a serif display face over
// Inter, and one purple for the call to action. Designed in the "Shorty Harris
// landing page redesign" canvas (desktop 1440 and mobile 390 artboards).

const IMG = "/images/landing";

/* Hero slides: the kinds of local businesses the outreach reaches. */
const SLIDES = [
  { src: `${IMG}/hero-shops.webp`, pos: "70% 30%" },
  { src: `${IMG}/hero-laundromat.webp`, pos: "60% 35%" },
  { src: `${IMG}/hero-snow-clearing.webp`, pos: "50% 55%" },
  { src: `${IMG}/hero-bike-shop.webp`, pos: "50% 40%" },
];
const SLIDE_MS = 4500;

const CTA_BTN =
  "inline-flex items-center justify-center rounded-full bg-brand text-white font-semibold no-underline hover:bg-brand-deep transition-colors whitespace-nowrap";

export function Home() {
  useSeo({
    title: "Shorty Harris - Skip outreach. Talk to hot leads.",
    description: "We find local businesses, write to them and follow up. You talk to the ones who reply interested. You approve every email.",
    path: "/",
  });
  const [video, setVideo] = useState(false);

  return (
    <div className="home-editorial min-h-screen flex flex-col bg-white text-ink-strong font-inter antialiased">
      <PublicNav overlay />
      <main>
        <Hero onWatch={() => setVideo(true)} />
        <HowItWorks />
        <HotLeadExample />
        {PRICING_MODEL === "packs" ? <PricingBand /> : <PricingFallback />}
        <HomeFaq />
        <CtaPhoto />
      </main>
      <PublicFooter />
      {video && <VideoDialog onClose={() => setVideo(false)} />}
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const fn = () => setReduce(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduce;
}

function Hero({ onWatch }: { onWatch: () => void }) {
  const reduce = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  // Only the first photo loads with the page; the others join once it is up.
  const [loadRest, setLoadRest] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setLoadRest(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (reduce || !loadRest) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearInterval(t);
  }, [reduce, loadRest]);

  return (
    <section className="relative flex min-h-[760px] flex-col bg-night lg:min-h-[940px]">
      {SLIDES.map((s, k) =>
        k === 0 || loadRest ? (
          <img
            key={s.src}
            src={s.src}
            alt=""
            aria-hidden
            fetchPriority={k === 0 ? "high" : undefined}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ease-in-out"
            style={{ objectPosition: s.pos, opacity: k === i ? 1 : 0 }}
          />
        ) : null,
      )}
      {/* Darker on the left (desktop) and at the bottom, so white text always reads. */}
      <div className="hero-shade absolute inset-0" aria-hidden />

      <div className="relative flex flex-1 flex-wrap items-end justify-between gap-10 px-5 pb-7 pt-[96px] text-white lg:px-12 lg:pb-[72px]">
        <div className="min-w-0 flex-[1_1_620px]">
          <h1
            className="m-0 font-serif font-normal leading-[0.98] tracking-[-0.03em]"
            style={{ fontSize: "clamp(52px, 7.8vw, 112px)" }}
          >
            Skip outreach.
            <br />
            <i>Talk to hot leads.</i>
          </h1>
          <p className="m-0 mt-5 max-w-[520px] text-[17px] leading-[1.5] text-white/90 lg:mt-7 lg:text-[21px]">
            We find, email and follow up with local businesses. You only talk to the ones who replied.
          </p>
          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6 lg:mt-9">
            <Link to="/signup" className={`${CTA_BTN} h-14 px-8 text-[17px] lg:h-[60px] lg:px-[34px]`}>
              {CTA_LABEL}
            </Link>
            <button
              type="button"
              onClick={onWatch}
              className="self-center cursor-pointer border-0 border-b border-solid border-white/60 bg-transparent p-0 pb-[3px] text-[17px] font-medium text-white hover:border-white sm:self-auto"
            >
              Watch how it works · 1:15
            </button>
          </div>
        </div>

        <figure className="m-0 hidden flex-[0_1_340px] rounded-[20px] border border-solid border-white/30 bg-white/15 px-6 py-[22px] backdrop-blur-[18px] lg:block">
          <div className="text-[12px] font-semibold tracking-[0.12em] text-[#9bf0bf]">
            <span aria-hidden>● </span>NEW HOT LEAD · EXAMPLE
          </div>
          <div className="mt-2.5 font-serif text-[24px]">Brightside Dental Studio</div>
          <blockquote className="m-0 mt-2.5 text-[15px] leading-[1.5] text-white/90">
            “Could you send prices for our two locations? Thursday afternoon works for a quick call.”
          </blockquote>
        </figure>
      </div>
    </section>
  );
}

/* Product video, public/videos/product.mp4 (1920x1080, 1:15). */
function VideoDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How Shorty Harris works"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 lg:p-12"
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close video"
        className="absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 text-white hover:bg-white/20"
      >
        <X size={22} aria-hidden />
      </button>
      <video
        src="/videos/product.mp4"
        poster="/images/video-poster.webp"
        className="aspect-video w-full max-w-[1200px] rounded-2xl bg-black"
        controls
        autoPlay
        playsInline
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    n: "01",
    numColor: "#f4c9a4",
    title: "Tell us who you want to win",
    body: "The kind of businesses, the area you cover and what you offer. A couple of minutes, no call to book.",
    img: `${IMG}/step-1.webp`,
    pos: "50% 0",
    bg: "#ffffff",
    shade: "linear-gradient(180deg,rgba(0,0,0,0) 38%,rgba(0,0,0,.72) 60%,rgba(0,0,0,.94) 100%)",
    bordered: true,
  },
  {
    n: "02",
    numColor: "#cdbfff",
    title: "We do the outreach",
    body: "We write to each business personally and follow up. Nothing is sent until you have read it and said yes.",
    img: `${IMG}/step-2.webp`,
    pos: "50% 50%",
    bg: "#e8575a",
    shade: "linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.55) 62%,rgba(0,0,0,.92) 100%)",
  },
  {
    n: "03",
    numColor: "#a9ebcb",
    title: "You get hot leads",
    body: "When a business replies wanting to talk, you get their message, who they are and what to do next.",
    img: `${IMG}/step-3.webp`,
    pos: "50% 0",
    bg: "#14210f",
    shade: "linear-gradient(180deg,rgba(0,0,0,0) 22%,rgba(0,0,0,.72) 52%,rgba(0,0,0,.95) 100%)",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 px-5 pb-8 pt-[72px] lg:px-12 lg:pb-10 lg:pt-28">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:mb-12">
        <h2 className="m-0 font-serif font-normal leading-none tracking-[-0.03em]" style={{ fontSize: "clamp(46px, 5vw, 72px)" }}>
          How it works
        </h2>
        <p className="m-0 max-w-[340px] text-[17px] leading-[1.5] text-ink-muted lg:text-[19px]">
          You set it up and approve. We do the rest.
        </p>
      </div>
      <ol className="m-0 grid list-none grid-cols-1 gap-3.5 p-0 md:grid-cols-3 lg:gap-5">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className={`relative h-[540px] overflow-hidden rounded-3xl lg:h-[620px] lg:rounded-[28px] ${s.bordered ? "border border-solid border-hairline" : ""}`}
            style={{ background: s.bg }}
          >
            <img src={s.img} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: s.pos }} />
            <div className="absolute inset-0" style={{ background: s.shade }} aria-hidden />
            <div className="absolute inset-x-[22px] bottom-[22px] text-white lg:inset-x-7 lg:bottom-7">
              <div className="text-[13px] font-semibold tracking-[0.12em] lg:text-[14px]" style={{ color: s.numColor }}>{s.n}</div>
              <h3 className="m-0 mt-1.5 font-serif text-[30px] font-normal leading-[1.1] lg:mt-2 lg:text-[34px]">{s.title}</h3>
              <p className="m-0 mt-2.5 text-[15px] leading-[1.5] text-white/85 lg:mt-3 lg:text-[16px]">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── What a hot lead looks like ───────────────────────────────────────────────
// Clearly marked as an example: this is not a customer quote.

function HotLeadExample() {
  return (
    <section className="flex flex-wrap items-stretch gap-8 px-5 pb-[72px] pt-14 lg:gap-14 lg:px-12 lg:py-28">
      <div className="relative min-h-[420px] flex-[1_1_460px] overflow-hidden rounded-3xl bg-[#e4e6e3] lg:min-h-[640px] lg:rounded-[28px]">
        <img
          src={`${IMG}/hot-lead.webp`}
          alt="A business owner reading a message on their phone"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "50% 55%" }}
        />
      </div>
      <div className="flex flex-[1_1_460px] flex-col justify-center">
        <div className="text-[13px] font-semibold tracking-[0.14em] text-brand lg:text-[14px]">WHAT A HOT LEAD LOOKS LIKE</div>
        <h2 className="m-0 mt-3.5 font-serif font-normal leading-[1.08] tracking-[-0.02em] lg:mt-5" style={{ fontSize: "clamp(42px, 4vw, 58px)" }}>
          A business that replied wanting to talk.
        </h2>
        <p className="m-0 mt-[18px] max-w-[520px] text-[17px] leading-[1.55] text-ink-muted lg:mt-6 lg:text-[20px]">
          Asking about price, availability or a meeting. You get their reply, a short summary and a suggested
          next step. Out-of-office replies, “no thanks” and bounces are filtered out. You never pay for them.
        </p>
        <figure className="m-0 mt-7 max-w-[540px] border-0 border-t border-solid border-hairline pt-[22px] lg:mt-9 lg:pt-7">
          <blockquote className="m-0 font-serif text-[22px] italic leading-[1.4] lg:text-[26px]">
            “Could you send prices for our two locations? Thursday afternoon works for a quick call.”
          </blockquote>
          <figcaption className="mt-3 text-[13px] text-ink-muted lg:mt-3.5 lg:text-[14px]">
            Practice manager, Brightside Dental Studio · example
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────────
// Numbers come from lib/pricing.ts, the same list the Billing page sells.

function PricingBand() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-ink-strong px-5 py-[72px] text-white lg:px-12 lg:py-28">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="m-0 font-serif font-normal leading-none tracking-[-0.03em]" style={{ fontSize: "clamp(50px, 5.8vw, 84px)" }}>
          Pay as you go.
          <br />
          <i>No subscription.</i>
        </h2>
        <p className="m-0 mt-4 max-w-[480px] text-[17px] leading-[1.5] text-hairline lg:mt-6 lg:text-[20px]">{pricingSubhead()}</p>

        <ul className="m-0 mt-8 grid list-none grid-cols-1 border-0 border-t border-solid border-ink-muted p-0 md:grid-cols-3 lg:mt-16">
          {PACKS.map((p, k) => {
            const best = p.tag === "Best value";
            return (
              <li
                key={p.credits}
                className={`flex items-center justify-between gap-4 border-0 border-b border-solid border-ink-muted py-[22px] md:block md:border-b-0 md:py-10 ${
                  k < PACKS.length - 1 ? "md:border-r md:pr-8" : ""
                } ${k > 0 ? "md:pl-8" : ""}`}
              >
                <div>
                  <div className={`text-[17px] ${best ? "text-[#f4c9a4]" : "md:text-hairline"}`}>
                    {p.credits} hot leads{best ? " · best value" : ""}
                  </div>
                  <div className="mt-1 text-[14px] text-hairline md:hidden">about {fmtUsd(Math.round(p.priceUsd / p.credits))} each</div>
                </div>
                <div className="font-serif text-[56px] leading-none md:mt-3 md:text-[clamp(64px,6.6vw,96px)]">{fmtUsd(p.priceUsd)}</div>
                <div className="mt-2 hidden text-hairline md:block">about {fmtUsd(Math.round(p.priceUsd / p.credits))} each</div>
              </li>
            );
          })}
        </ul>
        <p className="m-0 mt-5 max-w-[600px] text-[15px] leading-[1.6] text-hairline md:mt-2 lg:text-[16px]">
          Your first {LAUNCHES.freePerMonth} campaign launches each month are free, then each one uses{" "}
          {LAUNCHES.creditsAfterFree} lead from your pack.
        </p>
        <div className="mt-9 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <Link to="/signup" className={`${CTA_BTN} h-14 px-8 text-[17px]`}>{CTA_LABEL}</Link>
          <Link to="/pricing" className="self-center border-0 border-b border-solid border-white/60 pb-[3px] text-[16px] font-medium text-white no-underline hover:border-white sm:self-auto">
            Full pricing details
          </Link>
        </div>
      </div>
    </section>
  );
}

/* The credits model (PRICING_MODEL = 'credits') keeps the shared pricing blocks until it gets its own design. */
function PricingFallback() {
  return (
    <section id="pricing" className="scroll-mt-20 mx-auto w-full max-w-[1000px] px-5 py-[72px] lg:px-12 lg:py-28">
      <h2 className="m-0 mb-4 font-serif font-normal leading-none tracking-[-0.03em]" style={{ fontSize: "clamp(46px, 5vw, 72px)" }}>
        Pay as you go. <i>No subscription.</i>
      </h2>
      <p className="m-0 mb-10 text-[18px] text-ink-muted">{pricingSubhead()}</p>
      <div className="flex flex-col gap-4">
        <StarterOffer />
        <PackCards />
        <WhatYouPayFor />
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
// Answers the worries people have before they buy.

const GMAIL_ANSWER = (
  <>
    No, it's optional. Connecting Gmail means outreach goes out from your real business address,
    which usually gets better replies. We use it only to send your approved emails and spot replies
    to them. We never read unrelated mail or share your data, and you can disconnect it any time
    from Settings.{" "}
    <Link to="/gmail-data-use" className="font-semibold text-brand no-underline hover:underline">How we use Gmail</Link>
  </>
);

const FAQS: FaqItem[] = [
  { q: "What if I don't get any hot leads?", a: PRICING_FAQ.noLeads },
  { q: "What if a “hot lead” isn't really interested?", a: PRICING_FAQ.notInterested },
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

function HomeFaq() {
  return (
    <section id="faq" className="scroll-mt-24 mx-auto w-full max-w-[900px] px-5 pb-16 pt-[72px] lg:px-12 lg:pb-24 lg:pt-28">
      <h2 className="m-0 mb-7 font-serif font-normal leading-none tracking-[-0.03em] lg:mb-10" style={{ fontSize: "clamp(42px, 4.5vw, 64px)" }}>
        Questions, answered
      </h2>
      <Faq items={FAQS} />
      <p className="m-0 mt-8 text-[15px] text-ink-muted">
        Still have a question?{" "}
        <a href="mailto:hello@shortyharris.com" className="font-semibold text-brand no-underline hover:underline">
          hello@shortyharris.com
        </a>
      </p>
      {/* Stays on the home page: Google's OAuth verification of the Gmail scope
          expects the homepage to say how Gmail data is used and link to the details. */}
      <p className="m-0 mt-3 text-[14px] leading-[1.7] text-ink-muted">
        Connecting Gmail is optional, and we only use it to send your approved emails and spot replies.{" "}
        <Link to="/gmail-data-use" className="font-semibold text-brand no-underline hover:underline">
          How we use Gmail
        </Link>
      </p>
    </section>
  );
}
