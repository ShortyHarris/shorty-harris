import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PublicNav } from '../components/PublicNav';
import { PublicFooter } from '../components/PublicFooter';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" };

// Catch-all for any URL that doesn't match a real route - renders
// synchronously (no data fetching) so crawlers get real "not found" content
// immediately, and marks itself noindex so it never competes with real pages
// in search results. Deliberately does NOT redirect anywhere: routing an
// unknown URL to another page (e.g. /login) turns a 404 into a misleading
// "page with redirect" that also happens to be blocked by robots.txt.
export function NotFound() {
  useEffect(() => {
    document.title = 'Page not found - Shorty Harris';

    let el = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    const previous = el.getAttribute('content');
    el.setAttribute('content', 'noindex, nofollow');

    return () => {
      if (previous) el?.setAttribute('content', previous);
      else el?.removeAttribute('content');
    };
  }, []);

  return (
    <div style={FONT} className="min-h-screen flex flex-col bg-white text-[#0a0a0a]">
      <PublicNav />
      <main className="max-w-[680px] mx-auto px-6 py-24 text-center">
        <span className="text-[12.5px] font-bold uppercase tracking-[.1em] text-[#3c7a5b]">404</span>
        <h1 className="mt-4 mb-0 text-[30px] sm:text-[38px] font-extrabold leading-[1.15] tracking-tight">
          Page not found
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-[#525252]">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-[#0a0a0a] text-white text-[14.5px] font-semibold no-underline hover:bg-[#3c7a5b] transition-colors"
          >
            Back to home
          </Link>
          <Link
            to="/blog"
            className="inline-flex items-center justify-center h-11 px-6 rounded-full border border-[#d4d4d4] bg-white text-[#0a0a0a] text-[14.5px] font-semibold no-underline hover:bg-[#f5f5f5] transition-colors"
          >
            Read the blog
          </Link>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          {[
            { to: '/#how', title: 'How it works', body: 'From prospecting to hot lead, step by step.' },
            { to: '/#pricing', title: 'Pricing', body: 'Pay only when a hot lead comes in.' },
            { to: '/#faq', title: 'FAQ', body: 'Gmail, approvals, credits and more.' },
          ].map((c) => (
            <a
              key={c.title}
              href={c.to}
              className="group rounded-2xl border border-[#e5e5e5] bg-white p-5 no-underline transition-colors hover:border-[#b4d5c0]"
            >
              <div className="flex items-center gap-1.5 text-[15px] font-bold text-[#0a0a0a]">
                {c.title}
                <ArrowRight size={16} strokeWidth={2.4} className="text-[#3c7a5b] transition-transform duration-200 group-hover:translate-x-0.5" />
              </div>
              <div className="mt-1 text-[13.5px] leading-[1.5] text-[#737373]">{c.body}</div>
            </a>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
