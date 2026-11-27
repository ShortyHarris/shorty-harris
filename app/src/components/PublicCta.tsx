import { Link } from "react-router-dom";
import { CTA_LABEL } from "@/lib/marketing";
import "./PublicCta.css";

// ── Closing call to action ───────────────────────────────────────────────────

export function CtaPhoto({ title }: { title?: React.ReactNode }) {
  return (
    <section className="relative flex min-h-[620px] items-center justify-center overflow-hidden bg-night text-center text-white lg:min-h-[760px]">
      <img
        src={"/images/landing/cta.webp"}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "50% 40%" }}
      />
      <div className="cta-shade absolute inset-0" aria-hidden />
      <div className="relative px-6">
        <h2 className="m-0 mx-auto max-w-[900px] font-serif font-normal leading-none tracking-[-0.03em]" style={{ fontSize: "clamp(50px, 6.6vw, 96px)" }}>
          {title ?? <>Your next client is already <i>out there.</i></>}
        </h2>
        <Link to="/signup" className={`inline-flex items-center justify-center rounded-full bg-brand text-white font-semibold no-underline hover:bg-brand-deep transition-colors whitespace-nowrap mt-8 h-14 px-8 text-[17px] lg:mt-11 lg:h-[62px] lg:px-10 lg:text-[18px]`}>
          {CTA_LABEL}
        </Link>
      </div>
    </section>
  );
}
