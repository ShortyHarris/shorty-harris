import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { useAuth } from '../auth/AuthProvider';
import { BrandMark } from './BrandLockup';
import { CTA_LABEL } from "@/lib/marketing";

// The one header for every public page (Home, Pricing, Blog, BlogPost, legal
// pages, 404). Same logo, same links everywhere - only the active state changes.
// On the home page it sits over the hero photo (`overlay`): see-through with
// white text until the page scrolls, then solid white like everywhere else. "How it works" / "FAQ" are home-page sections:
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

/** Bolt + serif wordmark, as in the editorial redesign. */
export function PublicBrand({ light = false }: { light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-serif text-[22px] lg:text-[26px] font-semibold leading-none tracking-[-0.01em] ${light ? 'text-white' : 'text-ink-strong'}`}>
      <BrandMark size={28} className="h-[25px] w-auto lg:h-[30px]" />
      Shorty Harris
    </span>
  );
}

export function PublicNav({ overlay = false }: { overlay?: boolean }) {
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
    const fn = () => setScrolled(window.scrollY > 24);
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

  // See-through over the hero photo only while nothing is scrolled or open.
  const clear = overlay && !scrolled && !menuOpen;
  const link = (active: boolean) =>
    `relative inline-flex items-center h-11 text-[15px] font-medium no-underline whitespace-nowrap transition-colors cursor-pointer border-0 bg-transparent p-0 ${
      clear
        ? `text-white ${active ? '' : 'hover:text-white/75'}`
        : `${active ? 'text-ink-strong' : 'text-[#4a4a4a] hover:text-ink-strong'}`
    } ${active ? `after:absolute after:inset-x-0 after:bottom-2 after:h-[1.5px] ${clear ? 'after:bg-white' : 'after:bg-brand'}` : ''}`;

  return (
    <header
      className={`${overlay ? 'fixed inset-x-0' : 'sticky'} top-0 z-50 font-inter transition-[background-color,box-shadow] duration-300 ${
        clear ? 'bg-transparent' : `bg-white/95 backdrop-blur-xl ${scrolled ? 'shadow-[0_1px_0_#ebebeb]' : ''}`
      }`}
    >
      <div className="mx-auto w-full h-[68px] lg:h-[88px] px-5 lg:px-12 flex items-center gap-6">
        <div className="flex-1 flex items-center">
          <Link
            to="/"
            aria-label="Shorty Harris home"
            onClick={(e) => {
              if (isHome) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); window.history.replaceState(null, '', '/'); }
              setMenuOpen(false);
            }}
            className="no-underline select-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            <PublicBrand light={clear} />
          </Link>
        </div>

        <nav aria-label="Main" className="hidden md:flex items-center gap-8">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return item.kind === 'route' ? (
              <Link key={item.label} to={item.to} className={link(active)} aria-current={active ? 'page' : undefined}>
                {item.label}
              </Link>
            ) : (
              <a
                key={item.label}
                href={`/#${item.id}`}
                onClick={(e) => { e.preventDefault(); go(item); }}
                className={link(active)}
                aria-current={active ? 'location' : undefined}
              >
                {item.label}
              </a>
            );
          })}
          {isAuthed ? (
            <Link
              to={dashboardPath}
              className={`inline-flex items-center h-11 px-5 rounded-full text-[15px] font-semibold no-underline whitespace-nowrap transition-colors ${
                clear ? 'bg-white text-ink-strong hover:bg-white/85' : 'bg-brand text-white hover:bg-brand-deep'
              }`}
            >
              Go to dashboard
            </Link>
          ) : (
            <Link to="/login" className={link(location.pathname === '/login')}>Log in</Link>
          )}
        </nav>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className={`flex md:hidden h-11 w-11 -mr-2 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-colors ${
            clear ? 'text-white hover:bg-white/10' : 'text-ink-strong hover:bg-[#f5f5f5]'
          }`}
        >
          <MenuToggleIcon open={menuOpen} className="size-6" />
        </button>
      </div>

      {menuOpen && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 top-[68px] z-40 flex flex-col bg-white font-inter md:hidden">
          <nav aria-label="Main" className="flex flex-col px-5 pt-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <button
                  key={item.label}
                  onClick={() => go(item)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between h-16 border-0 border-b border-solid border-[#ebebeb] bg-transparent px-0 text-left font-serif text-[26px] cursor-pointer ${
                    active ? 'text-brand' : 'text-ink-strong'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-3 p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            {isAuthed ? (
              <Link
                to={dashboardPath}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center h-14 rounded-full bg-brand text-[16px] font-semibold text-white no-underline hover:bg-brand-deep transition-colors"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center h-14 rounded-full bg-brand text-[16px] font-semibold text-white no-underline hover:bg-brand-deep transition-colors"
                >
                  {CTA_LABEL}
                </Link>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center h-14 rounded-full border border-solid border-ink-strong bg-white text-[16px] font-semibold text-ink-strong no-underline hover:bg-[#f5f5f5] transition-colors"
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
