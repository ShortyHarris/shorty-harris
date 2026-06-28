import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { RocketIcon, ArrowRightIcon, PhoneCallIcon } from "lucide-react";
import { LogoCloud } from "@/components/ui/logo-cloud-3";

export function HeroSection() {
  return (
    <section className="mx-auto w-full max-w-5xl">
      {/* Top radial gradient */}
      <div aria-hidden className="absolute inset-0 isolate hidden overflow-hidden contain-strict lg:block">
        <div className="absolute inset-0 -top-14 isolate -z-10 bg-[radial-gradient(35%_80%_at_49%_0%,rgba(60,122,91,0.1),transparent)] contain-strict" />
      </div>

      {/* Vertical border lines */}
      <div aria-hidden className="absolute inset-0 mx-auto hidden min-h-screen w-full max-w-5xl lg:block">
        <div className="mask-y-from-80% mask-y-to-100% absolute inset-y-0 left-0 z-10 h-full w-px bg-foreground/15" />
        <div className="mask-y-from-80% mask-y-to-100% absolute inset-y-0 right-0 z-10 h-full w-px bg-foreground/15" />
      </div>

      <div className="relative flex flex-col items-center justify-center gap-5 pt-32 pb-30">
        {/* Inner faded border lines */}
        <div aria-hidden className="absolute inset-0 -z-1 size-full overflow-hidden">
          <div className="absolute inset-y-0 left-4 w-px bg-linear-to-b from-transparent via-border to-border md:left-8" />
          <div className="absolute inset-y-0 right-4 w-px bg-linear-to-b from-transparent via-border to-border md:right-8" />
          <div className="absolute inset-y-0 left-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:left-12" />
          <div className="absolute inset-y-0 right-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:right-12" />
        </div>

        {/* Badge */}
        <a
          className={cn(
            "group mx-auto flex w-fit items-center gap-3 rounded-full border bg-card px-3 py-1 shadow",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out",
          )}
          href="#how"
        >
          <RocketIcon className="size-3 text-muted-foreground" />
          <span className="text-xs">AI-powered outreach — just launched</span>
          <span className="block h-5 border-l" />
          <ArrowRightIcon className="size-3 duration-150 ease-out group-hover:translate-x-1" />
        </a>

        {/* Headline */}
        <h1
          className={cn(
            "fade-in slide-in-from-bottom-10 animate-in text-balance fill-mode-backwards text-center text-4xl font-extrabold tracking-tight delay-100 duration-500 ease-out md:text-5xl lg:text-6xl",
          )}
        >
          We do the outreach. <br />
          <span className="text-[#3c7a5b] italic">You close the deals.</span>
        </h1>

        {/* Subtitle */}
        <p className="fade-in slide-in-from-bottom-10 mx-auto max-w-md animate-in fill-mode-backwards text-center text-base text-foreground/80 tracking-wide delay-200 duration-500 ease-out sm:text-lg">
          We find the right businesses, craft personalized messages, and send
          them across email and WhatsApp. You only hear from the ones who want to talk.
        </p>

        {/* CTAs */}
        <div className="fade-in slide-in-from-bottom-10 flex animate-in flex-row flex-wrap items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
          <Button className="rounded-full" size="lg" variant="secondary" asChild>
            <Link to="/login">
              <PhoneCallIcon className="size-4 mr-2" />
              Book a call
            </Link>
          </Button>
          <Button className="rounded-full" size="lg" asChild>
            <Link to="/login">
              Get started <ArrowRightIcon className="size-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function LogosSection() {
  return (
    <section className="relative space-y-4 border-t pt-6 pb-10">
      <h2 className="text-center font-medium text-lg text-muted-foreground tracking-tight md:text-xl">
        Built on tools you <span className="text-foreground">already trust</span>
      </h2>
      <div className="relative z-10 mx-auto max-w-4xl">
        <LogoCloud logos={TECH_LOGOS} />
      </div>
    </section>
  );
}

const TECH_LOGOS = [
  { src: "https://storage.efferd.com/logo/supabase-wordmark.svg",  alt: "Supabase" },
  { src: "https://storage.efferd.com/logo/openai-wordmark.svg",    alt: "OpenAI" },
  { src: "https://storage.efferd.com/logo/vercel-wordmark.svg",    alt: "Vercel" },
  { src: "https://storage.efferd.com/logo/github-wordmark.svg",    alt: "GitHub" },
  { src: "https://storage.efferd.com/logo/claude-wordmark.svg",    alt: "Claude AI" },
  { src: "https://storage.efferd.com/logo/turso-wordmark.svg",     alt: "Turso" },
];
