import { useEffect } from 'react';
import { Link } from 'react-router-dom';
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
    <div style={FONT} className="min-h-screen bg-white text-[#1a1b17]">
      <PublicNav />
      <main className="max-w-[680px] mx-auto px-6 py-24 text-center">
        <span className="text-[12.5px] font-bold uppercase tracking-[.1em] text-[#3c7a5b]">404</span>
        <h1 className="mt-4 mb-0 text-[30px] sm:text-[38px] font-extrabold leading-[1.15] tracking-tight">
          Page not found
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-[#54574e]">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block text-[13px] font-semibold text-[#3c7a5b] no-underline hover:underline"
        >
          ← Back to home
        </Link>
      </main>
      <PublicFooter />
    </div>
  );
}
