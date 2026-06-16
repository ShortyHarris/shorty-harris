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
        <div className="trust-row">
          <span className="avatar-stack">
            <span style={{ background: '#3c7a5b' }}>J</span>
            <span style={{ background: '#5e5e5e' }}>M</span>
            <span style={{ background: '#0a0a0a' }}>R</span>
          </span>
          <span className="eyebrow">Trusted by 500+ high-growth teams</span>
        </div>
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

      {/* TRUST STRIP */}
      <section className="trust-strip">
        <span className="trust-strip-label">Trusted by teams at</span>
        <div className="trust-logos">
          <span>Northwind Logistics</span>
          <span>Bluepeak Clinics</span>
          <span>Anchor Hospitality</span>
          <span>Fernbridge Retail</span>
          <span>Solace Fitness</span>
        </div>
      </section>

      {/* PROOF — bento grid of social proof */}
      <section className="proof" id="solutions">
        <h2>Trusted by fast-growing teams</h2>
        <p className="proof-sub">
          Real results from revenue teams using Shorty Harris to fill their pipeline.
        </p>

        <div className="proof-grid">
          <div className="proof-tile proof-quote">
            <p>
              "Shorty Harris helped us triple the qualified meetings booked
              per week — without adding a single rep to the team."
            </p>
            <div className="proof-quote-meta">
              <span className="proof-quote-name">Dana Whitfield</span>
              <span className="proof-quote-role">Head of Growth, Northwind Logistics</span>
            </div>
          </div>

          <div className="proof-tile proof-rating">
            <div className="proof-stars">★★★★★</div>
            <div className="proof-num">4.9</div>
            <div className="proof-label">Average customer satisfaction</div>
          </div>

          <div className="proof-tile proof-dark">
            <div className="proof-icon"><PeopleIcon /></div>
            <div className="proof-num white">1.2M+</div>
            <div className="proof-label white">Business contacts verified</div>
          </div>

          <div className="proof-tile proof-stat">
            <div className="proof-num">92%</div>
            <div className="proof-label">Data accuracy</div>
          </div>

          <div className="proof-tile proof-soft">
            <div className="proof-icon"><LineUpIcon /></div>
            <div className="proof-num">4.5x</div>
            <div className="proof-label">Avg. ROI per campaign</div>
          </div>
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

      <Footer />
    </div>
  );
}

/* ───── footer ───── */
function Footer() {
  const [subscribed, setSubscribed] = useState(false);

  const onSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribed(true);
  };

  return (
    <footer className="hfoot">
      <div className="hfoot-top">
        <div className="hfoot-brand">
          <span className="hnav-brand">
            <span className="hnav-mark">S.H.</span>
            <span className="hnav-mark-suffix">AI</span>
          </span>
          <p>
            AI-powered outbound that finds your ideal customers, starts
            conversations, and delivers qualified leads straight to your pipeline.
          </p>
          <form className="hfoot-newsletter" onSubmit={onSubscribe}>
            <input type="email" placeholder="Enter your email" required disabled={subscribed} />
            <button className="btn-primary" type="submit" disabled={subscribed}>
              {subscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          </form>
        </div>

        <div className="hfoot-cols">
          <div className="hfoot-col">
            <div className="hfoot-col-title">Product</div>
            <a href="#product">Features</a>
            <a href="#product">Lead Scoring</a>
            <a href="#product">Integrations</a>
            <a href="#product">Analytics</a>
          </div>
          <div className="hfoot-col">
            <div className="hfoot-col-title">Resources</div>
            <a href="#">Blog</a>
            <a href="#">Documentation</a>
            <a href="#">Help Center</a>
            <a href="#">API</a>
          </div>
          <div className="hfoot-col">
            <div className="hfoot-col-title">Company</div>
            <a href="#">About</a>
            <a href="#">Careers</a>
            <a href="#contact">Contact</a>
            <a href="#privacy">Privacy</a>
          </div>
          <div className="hfoot-col">
            <div className="hfoot-col-title">Solutions</div>
            <a href="#">Agencies</a>
            <a href="#">Consultants</a>
            <a href="#">Freelancers</a>
            <a href="#">Service Teams</a>
          </div>
        </div>
      </div>

      <div className="hfoot-bottom">
        <span>© {new Date().getFullYear()} Shorty Harris AI. All rights reserved.</span>
        <span className="hfoot-socials">
          <a href="#" aria-label="Facebook"><FacebookIcon /></a>
          <a href="#" aria-label="Instagram"><InstagramIcon /></a>
          <a href="#" aria-label="X"><XIcon /></a>
        </span>
      </div>
    </footer>
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
function FacebookIcon() { return (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.41c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" /></svg>
); }
function InstagramIcon() { return (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>
); }
function XIcon() { return (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.4 8.46L23 22h-6.8l-5.3-6.9L5 22H2l8-9.1L1.4 2h6.9l4.8 6.3L18.9 2Z" /></svg>
); }
