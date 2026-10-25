import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { useAuth } from '../auth/AuthProvider';
import { BrandLockup } from './BrandLockup';

// The one header for every public page (Home, Blog, BlogPost, legal pages,
// 404). Same logo, same links, same buttons everywhere - only the active
// state changes. "How it works" / "FAQ" are home-page sections:
// clicked from home they smooth-scroll, clicked from anywhere else they go
// to /#id and scroll once the home page has rendered.

type NavItem =
  | { label: string; kind: 'section'; id: string }
  | { label: string; kind: 'route'; to: string };

const NAV_ITEMS: NavItem[] = [
  { label: 'How it works', kind: 'section', id: 'how' },
  { label: 'Pricing', kind: 'route', to: '/pricing' },
  { label: 'FAQ', kind: 'section', id: 'faq' },
  { label: 'Blog', kind: 'route', to: '/blog' },
];

const HEADER_OFFSET = 72; // sticky header height + a little breathing room

function scrollToSection(id: string, behavior: ScrollBehavior = 'smooth') {
  const el = document.getElementById(id);
  if (!el) return false;
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
  window.scrollTo({ top, behavior });
  return true;
}

/* Which home-page section is currently in view - drives the active pill
   while scrolling the landing page. */
function useActiveSection(enabled: boolean, ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const onScroll = () => {
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - HEADER_OFFSET - 40 <= 0) current = id;
      }
      setActive(current);
    };
    const frame = window.requestAnimationFrame(onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return enabled ? active : null;
}

const linkBase =
  'relative inline-flex items-center h-9 px-3.5 rounded-full text-[14px] no-underline whitespace-nowrap transition-colors cursor-pointer border-0 bg-transparent';
const linkIdle = 'font-medium text-[#5b5648] hover:text-[#1a1c17] hover:bg-[#efe6d3]';
const linkActive = 'font-semibold text-[#1a1c17] bg-[#e9dfca]';

export function PublicNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  const { session, profile } = useAuth();
  const isAuthed = !!session && !!profile;
  const dashboardPath = profile?.role === 'admin' ? '/admin/approvals' : '/app';

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeSection = useActiveSection(isHome, NAV_ITEMS.flatMap((i) => (i.kind === 'section' ? [i.id] : [])));

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Arriving at /#how from another page: scroll once the section exists.
  useEffect(() => {
    if (!isHome || !location.hash) return;
    const id = location.hash.slice(1);
    let tries = 0;
    const t = window.setInterval(() => {
      if (scrollToSection(id) || ++tries > 20) window.clearInterval(t);
    }, 50);
    return () => window.clearInterval(t);
  }, [isHome, location.hash]);

  function isActive(item: NavItem) {
    if (item.kind === 'route') return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    return isHome && activeSection === item.id;
  }

  function go(item: NavItem) {
    setMenuOpen(false);
    if (item.kind === 'route') { navigate(item.to); return; }
    if (isHome) {
      scrollToSection(item.id);
      window.history.replaceState(null, '', `/#${item.id}`);
    } else {
      navigate(`/#${item.id}`);
    }
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-[background-color] duration-200 ${
        scrolled ? 'bg-cream/85 backdrop-blur-xl' : 'bg-cream'
      }`}
    >
      <div className="max-w-300 mx-auto w-full h-16 px-5 lg:px-12 flex items-center">
        {/* Logo - same lockup as the login/signup screens */}
        <div className="flex-1 flex items-center">
          <Link
            to="/"
            aria-label="Shorty Harris home"
            onClick={(e) => {
              if (isHome) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); window.history.replaceState(null, '', '/'); }
              setMenuOpen(false);
            }}
            className="no-underline select-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3c7a5b]"
          >
            <BrandLockup iconSize={22} noMargin className="public-nav-brand" />
          </Link>
        </div>

        {/* Links */}
        <nav aria-label="Main" className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            const cls = `${linkBase} ${active ? linkActive : linkIdle}`;
            return item.kind === 'route' ? (
              <Link key={item.label} to={item.to} className={cls} aria-current={active ? 'page' : undefined}>
                {item.label}
              </Link>
            ) : (
              <a
                key={item.label}
                href={`/#${item.id}`}
                onClick={(e) => { e.preventDefault(); go(item); }}
                className={cls}
                aria-current={active ? 'location' : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex flex-1 items-center justify-end gap-2">
          {isAuthed ? (
            <Link
              to={dashboardPath}
              className="hidden md:inline-flex items-center h-10 px-5 rounded-full bg-forest text-white text-[14px] font-semibold no-underline hover:bg-forest-deep transition-colors whitespace-nowrap"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className={`hidden md:inline-flex ${linkBase} ${location.pathname === '/login' ? linkActive : linkIdle}`}
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="hidden md:inline-flex items-center h-10 px-5 rounded-full bg-forest text-white text-[14px] font-semibold no-underline hover:bg-forest-deep transition-colors whitespace-nowrap"
              >
                Get started
              </Link>
            </>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="flex md:hidden h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[#e4dbc8] bg-white text-[#1a1c17] hover:bg-[#efe6d3] transition-colors"
          >
            <MenuToggleIcon open={menuOpen} className="size-5" />
          </button>
        </div>
      </div>

      {menuOpen && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 top-16 z-40 flex flex-col bg-cream md:hidden">
          <nav aria-label="Main" className="flex flex-col gap-1 p-4">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <button
                  key={item.label}
                  onClick={() => go(item)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between rounded-xl px-4 h-13 text-[16px] text-left border-0 cursor-pointer transition-colors ${
                    active ? 'bg-[#e9dfca] text-[#1a1c17] font-semibold' : 'bg-transparent text-[#46423a] font-medium hover:bg-[#efe6d3]'
                  }`}
                >
                  {item.label}
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-[#3c7a5b]" aria-hidden />}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-2 border-t border-[#e4dbc8] p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            {isAuthed ? (
              <Link
                to={dashboardPath}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center h-12 rounded-full bg-forest text-[15px] font-semibold text-white no-underline hover:bg-forest-deep transition-colors"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center h-12 rounded-full bg-forest text-[15px] font-semibold text-white no-underline hover:bg-forest-deep transition-colors"
                >
                  Get started
                </Link>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center h-12 rounded-full border border-[#e4dbc8] bg-white text-[15px] font-semibold text-[#1a1c17] no-underline hover:bg-[#efe6d3] transition-colors"
                >
                  Log in
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
