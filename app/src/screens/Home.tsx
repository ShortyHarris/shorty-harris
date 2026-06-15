import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import './Home.css';

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
);

const PinIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
);
const GaugeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 8 12 12 14 14"/></svg>
);
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
);

export function Home() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/login');
  };

  return (
    <div className="home">
      <header className="home-nav">
        <Link to="/" className="home-brand">
          <span className="home-brand-mark">SH</span>
          <span>Shorty Harris</span>
        </Link>
        <nav className="home-nav-links">
          <a href="#product">Product <ChevronDown /></a>
          <a href="#solutions">Solutions <ChevronDown /></a>
          <a href="#pricing">Pricing <ChevronDown /></a>
          <a href="#contact">Contact Sales <ChevronDown /></a>
        </nav>
        <Link to="/login" className="home-cta">Sign in</Link>
      </header>

      <section className="home-hero">
        <h1>Turn Local Data Into Paying Customers</h1>
        <p>
          Find and score qualified leads across Zambia. Get instant access to
          business contact data, reach prospects faster, and close more deals.
        </p>
        <form className="home-search" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="Extract restaurant data in Lusaka…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="home-cta">Try it now</button>
        </form>
      </section>

      <section className="home-features" id="product">
        <article className="home-feature">
          <div className="home-feature-head">
            <span className="home-feature-icon"><PinIcon /></span>
            Location Intelligence
          </div>
          <div className="home-feature-by">by Shorty Harris</div>
          <p>Extract business data from maps including contact info, ratings, hours, and location details. Powered by advanced web scraping.</p>
          <div className="home-feature-foot">
            <span className="by"><span className="dot">S</span> Shorty Harris</span>
            <span>★ 4.9</span>
          </div>
        </article>

        <article className="home-feature">
          <div className="home-feature-head">
            <span className="home-feature-icon"><GaugeIcon /></span>
            Lead Scorer AI
          </div>
          <div className="home-feature-by">by Shorty Harris</div>
          <p>Automatically score leads 0–100 based on buying signals and engagement. Identify your hottest prospects in seconds.</p>
          <div className="home-feature-foot">
            <span className="by"><span className="dot">S</span> Shorty Harris</span>
            <span>★ 5.0</span>
          </div>
        </article>

        <article className="home-feature">
          <div className="home-feature-head">
            <span className="home-feature-icon"><SendIcon /></span>
            Smart Outreach
          </div>
          <div className="home-feature-by">by Shorty Harris</div>
          <p>AI-powered multi-channel messaging tailored to each prospect. Email, SMS, and WhatsApp automation in one platform.</p>
          <div className="home-feature-foot">
            <span className="by"><span className="dot">S</span> Shorty Harris</span>
            <span>★ 4.8</span>
          </div>
        </article>
      </section>
    </div>
  );
}
