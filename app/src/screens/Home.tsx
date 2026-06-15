import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "./Home.css";

const PHRASES = [
  "Start a campaign for hotels in your city…",
  "Find logistics companies near you…",
  "Reach clinics and healthcare providers…",
  "Outreach to gyms and fitness studios…",
  "Target restaurants and hospitality businesses…",
  "Connect with retail stores in your area…",
  "Find cleaning companies ready to scale…",
];

function useTypingPlaceholder() {
  const [text, setText] = useState("");
  const idx = useRef(0);
  const pos = useRef(0);
  const deleting = useRef(false);
  const tid = useRef<number | undefined>(undefined);

  useEffect(() => {
    function step() {
      const phrase = PHRASES[idx.current];
      if (!deleting.current) {
        pos.current += 1;
        setText(phrase.slice(0, pos.current));
        if (pos.current >= phrase.length) {
          deleting.current = true;
          tid.current = window.setTimeout(step, 1500);
          return;
        }
        tid.current = window.setTimeout(step, 55);
      } else {
        pos.current -= 1;
        setText(phrase.slice(0, Math.max(pos.current, 0)));
        if (pos.current <= 0) {
          deleting.current = false;
          idx.current = (idx.current + 1) % PHRASES.length;
          tid.current = window.setTimeout(step, 300);
          return;
        }
        tid.current = window.setTimeout(step, 25);
      }
    }
    tid.current = window.setTimeout(step, 500);
    return () => { if (tid.current) clearTimeout(tid.current); };
  }, []);

  return text;
}

export function Home() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const placeholder = useTypingPlaceholder();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/login");
  };

  return (
    <div className="home theme-client">
      {/* NAV */}
      <header className="hnav">
        <Link to="/" className="hnav-brand">
          <span className="hnav-mark">S.H.</span>
          <span className="hnav-mark-suffix">AI</span>
        </Link>
        <nav className="hnav-links">
          <a href="#product">Product</a>
          <a href="#solutions">Solutions</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact Sales</a>
        </nav>
        <div className="hnav-cta">
          <Link to="/login" className="hnav-signin">Sign In</Link>
          <Link to="/login" className="btn-primary">Get Started</Link>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <span className="eyebrow">Trusted by 500+ high-growth teams</span>
        <h1>
          Every day you don't send,<br />
          <em>a competitor does.</em>
        </h1>
        <p className="hero-sub">
          Shorty Harris is an AI-powered outbound agent that finds your ideal customers,
          starts conversations, follows up automatically, and delivers qualified leads
          straight to your pipeline.
        </p>

        <form className="hero-search" onSubmit={onSubmit}>
          <span className="hero-search-icon" aria-hidden>
            <SearchIcon />
          </span>
          <input
            type="text"
            value={query}
            placeholder={placeholder || "Start…"}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn-primary">Search</button>
        </form>

        <div className="hero-frame">
          <div className="hero-frame-inner">
            <DashboardMock />
          </div>
          <div className="hero-frame-badge">
            <div className="hfb-icon"><TrendUpIcon /></div>
            <div>
              <div className="hfb-label">CONVERSION RATE</div>
              <div className="hfb-value">+34.8% <span>Growth</span></div>
              <div className="hfb-bar"><div /></div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="product">
        <h2>Intelligent Solutions for Growth</h2>
        <p className="features-sub">
          Leveraging intelligence to drive results for business leaders everywhere.
        </p>

        <div className="features-grid">
          <FeatureCard
            icon={<NetworkIcon />}
            rating="4.9"
            title="AI Sales Outreach"
            sub="by Shorty Harris"
            body="Turn cold prospects into qualified opportunities with AI-powered prospecting, personalized outreach, automated follow-ups, and intelligent lead qualification."
          />
          <FeatureCard
            icon={<BoltIcon />}
            rating="5.0"
            title="Lead Scorer AI"
            sub="by Shorty Harris"
            body="Automatically score leads 0–100 based on buying signals and engagement. Identify your hottest prospects in seconds and prioritize your day."
          />
          <FeatureCard
            icon={<ChatIcon />}
            rating="4.8"
            title="Smart Outreach"
            sub="by Shorty Harris"
            body="AI-powered multi-channel messaging tailored to each prospect. Email, SMS, and WhatsApp automation in one unified platform."
          />
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="stats-strip">
        <div className="stat-tile">
          <div className="stat-num">92%</div>
          <div className="stat-title">Data Accuracy</div>
          <div className="stat-body">
            Our AI models verify business contacts across every territory daily,
            ensuring your outreach never bounces.
          </div>
        </div>
        <div className="stat-tile is-dark">
          <div className="stat-icon"><PeopleIcon /></div>
          <div className="stat-num white">1.2M+</div>
          <div className="stat-title white">Business Contacts</div>
        </div>
        <div className="stat-tile is-soft">
          <div className="stat-icon"><LineUpIcon /></div>
          <div className="stat-num">4.5x</div>
          <div className="stat-title">Avg. ROI per Campaign</div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-band">
        <h2>Ready to scale your outreach?</h2>
        <p>Join thousands of sales professionals who use Shorty Harris to close deals with precision.</p>
        <div className="cta-band-actions">
          <Link to="/login" className="btn-on-dark">Start Your Free Trial</Link>
          <a href="#demo" className="btn-on-dark-ghost">Watch Product Demo</a>
        </div>
      </section>

      <footer className="hfoot">
        <span>© {new Date().getFullYear()} Shorty Harris AI</span>
        <span className="hfoot-links">
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#contact">Contact</a>
        </span>
      </footer>
    </div>
  );
}

/* ───── mock dashboard graphic inside hero frame ───── */
function DashboardMock() {
  return (
    <div className="dmock">
      <div className="dmock-side">
        <div className="dmock-brand" />
        <div className="dmock-nav">
          <span className="on" /><span /><span /><span /><span />
        </div>
      </div>
      <div className="dmock-main">
        <div className="dmock-row">
          <div className="dmock-card" /><div className="dmock-card dark" /><div className="dmock-card" />
        </div>
        <div className="dmock-table">
          <div /><div /><div /><div /><div /><div />
        </div>
      </div>
    </div>
  );
}

/* ───── feature card ───── */
function FeatureCard({
  icon, rating, title, sub, body,
}: { icon: React.ReactNode; rating: string; title: string; sub: string; body: string }) {
  return (
    <article className="fcard">
      <div className="fcard-icon">{icon}</div>
      <div className="fcard-rating">★ {rating}</div>
      <h3 className="fcard-title">{title}</h3>
      <div className="fcard-sub">{sub}</div>
      <p className="fcard-body">{body}</p>
      <a className="fcard-link" href="#product">Explore product →</a>
    </article>
  );
}

/* ───── icons ───── */
function SearchIcon() { return (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
); }
function TrendUpIcon() { return (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>
); }
function NetworkIcon() { return (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v4M12 11 5.8 17.2M12 11l6.2 6.2" /></svg>
); }
function BoltIcon() { return (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
); }
function ChatIcon() { return (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.2L3 21l1.8-5.4A8 8 0 1 1 21 12Z" /></svg>
); }
function PeopleIcon() { return (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 19c0-2.2 2-3.8 4-3.8s4 1.6 4 3.8" /></svg>
); }
function LineUpIcon() { return (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7" /></svg>
); }
