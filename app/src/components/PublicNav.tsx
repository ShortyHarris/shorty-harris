import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { useAuth } from '../auth/AuthProvider';

// Shared header for every public-facing page (Home, Blog, BlogPost, …).
// The "How it works" / "Results" links only make sense on the home page
// (they scroll to sections that only exist there) — everything else
// (logo, Blog, Log in, Get started) is identical everywhere.

const SCROLL_LINKS = [
  { label: 'How it works', id: 'how' },
  { label: 'Results', id: 'results' },
];

function smoothScrollTo(id: string, done?: () => void) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  done?.();
}

export function PublicNav() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  const { session, profile } = useAuth();
  const isAuthed = !!session && !!profile;
  const dashboardPath = profile?.role === 'admin' ? '/admin/approvals' : '/app';

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-200 ${
        scrolled || !isHome ? 'bg-white/95 backdrop-blur-xl border-b border-[#e8e3da] shadow-[0_1px_0_rgba(0,0,0,0.04)]' : 'bg-white'
      }`}
    >
      <div className="max-w-300 mx-auto w-full px-6 lg:px-12 py-4 flex items-center">
        <Link to="/" className="flex-1 text-[18px] tracking-tight leading-none no-underline select-none">
          <span className="font-medium text-[#54574e]">Shorty</span>
          <span className="font-extrabold text-[#1a1b17]"> Harris</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {isHome && SCROLL_LINKS.map((l) => (
            <button
              key={l.id}
              onClick={() => smoothScrollTo(l.id)}
              className="text-[14px] font-medium text-[#54574e] bg-transparent border-none p-0 cursor-pointer hover:text-[#1a1b17] transition-colors"
            >
              {l.label}
            </button>
          ))}
          <Link to="/blog" className="text-[14px] font-medium text-[#54574e] no-underline hover:text-[#1a1b17] transition-colors">
            Blog
          </Link>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-3">
          {isAuthed ? (
            <Link
              to={dashboardPath}
              className="hidden md:inline-flex items-center bg-[#1a1b17] text-white px-5 py-2.5 rounded-[10px] text-[14px] font-semibold no-underline hover:bg-[#3c7a5b] transition-colors whitespace-nowrap"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden md:block text-[14px] font-medium text-[#54574e] no-underline hover:text-[#1a1b17] transition-colors">
                Log in
              </Link>
              <Link
                to="/login"
                className="hidden md:inline-flex items-center bg-[#1a1b17] text-white px-5 py-2.5 rounded-[10px] text-[14px] font-semibold no-underline hover:bg-[#3c7a5b] transition-colors whitespace-nowrap"
              >
                Get started
              </Link>
            </>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            className="flex md:hidden h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#e8e3da] bg-transparent text-[#54574e] hover:bg-[#f5f2ec] transition-colors"
          >
            <MenuToggleIcon open={menuOpen} className="size-5" />
          </button>
        </div>
      </div>

      {menuOpen && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 top-14.25 z-40 flex flex-col bg-white/95 backdrop-blur-xl border-t border-[#e8e3da] md:hidden">
          <div className="flex flex-col gap-1 p-4">
            {isHome && SCROLL_LINKS.map((l) => (
              <button
                key={l.id}
                onClick={() => smoothScrollTo(l.id, () => setMenuOpen(false))}
                className="rounded-lg px-4 py-3 text-[15px] font-medium text-[#54574e] bg-transparent border-none cursor-pointer text-left hover:bg-[#f5f2ec] hover:text-[#1a1b17] transition-colors"
              >
                {l.label}
              </button>
            ))}
            <Link
              to="/blog"
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-4 py-3 text-[15px] font-medium text-[#54574e] no-underline hover:bg-[#f5f2ec] hover:text-[#1a1b17] transition-colors"
            >
              Blog
            </Link>
          </div>
          <div className="mt-auto flex flex-col gap-2 border-t border-[#e8e3da] p-4">
            {isAuthed ? (
              <Link
                to={dashboardPath}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center rounded-[10px] bg-[#1a1b17] px-4 py-3 text-[15px] font-semibold text-white no-underline hover:bg-[#3c7a5b] transition-colors"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center rounded-[10px] border border-[#e8e3da] bg-transparent px-4 py-3 text-[15px] font-semibold text-[#1a1b17] no-underline hover:bg-[#f5f2ec] transition-colors"
                >
                  Log in
                </Link>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center rounded-[10px] bg-[#1a1b17] px-4 py-3 text-[15px] font-semibold text-white no-underline hover:bg-[#3c7a5b] transition-colors"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </header>
  );
}
