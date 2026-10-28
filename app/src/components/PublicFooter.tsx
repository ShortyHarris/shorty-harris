import { Link } from 'react-router-dom';
import { openConsentPreferences } from '../lib/consent';
import { BrandLockup } from './BrandLockup';

// Shared footer for every public-facing page (Home, Blog, BlogPost, legal,
// 404). Home-page sections are linked as "/#id" (not a bare "#id") so they
// resolve from any page - PublicNav scrolls to the section on arrival.

const CONTACT_EMAIL = 'hello@shortyharris.com';

const FOOT_LINKS: { title: string; links: { label: string; href: string; route?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '/#how' },
      { label: 'Pricing', href: '/pricing', route: true },
      { label: 'FAQ', href: '/#faq' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog', route: true },
      { label: 'Log in', href: '/login', route: true },
      { label: 'Contact', href: `mailto:${CONTACT_EMAIL}` },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy', route: true },
      { label: 'Terms', href: '/terms', route: true },
      { label: 'Cookies', href: '/cookies', route: true },
      { label: 'Gmail data use', href: '/gmail-data-use', route: true },
    ],
  },
];

const linkCls = 'text-[14px] text-[#605978] no-underline hover:text-[#0e0822] transition-colors';

export function PublicFooter() {
  return (
    <footer className="mt-auto bg-paper-deep">
      <div className="max-w-300 mx-auto w-full px-6 lg:px-12 pt-14 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_2fr] gap-10 lg:gap-16 pb-12">
          <div className="flex flex-col gap-4 max-w-full lg:max-w-[320px]">
            <Link to="/" aria-label="Shorty Harris home" className="no-underline self-start">
              <BrandLockup iconSize={22} noMargin className="public-nav-brand" />
            </Link>
            <p className="text-[14px] leading-[1.6] text-[#605978] m-0">
              AI-powered outbound that finds ideal customers and delivers warm, qualified leads straight to your inbox.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-brand text-white text-[14px] font-semibold no-underline hover:bg-brand-deep transition-colors"
              >
                Get started
              </Link>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[14px] font-semibold text-[#7412ef] no-underline hover:underline">
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            {FOOT_LINKS.map((col) => (
              <div key={col.title} className="flex flex-col gap-3">
                <div className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#0e0822] mb-1">{col.title}</div>
                {col.links.map((l) =>
                  l.route ? (
                    <Link key={l.label} to={l.href} className={linkCls}>{l.label}</Link>
                  ) : (
                    <a key={l.label} href={l.href} className={linkCls}>{l.label}</a>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-t border-[#e8e3f7] pt-6 text-[13px] text-[#7d7766]">
          <span>© {new Date().getFullYear()} Shorty Harris. All rights reserved.</span>
          <button
            type="button"
            onClick={openConsentPreferences}
            className="self-start sm:self-auto text-[13px] text-[#605978] font-semibold hover:text-[#0e0822] transition-colors bg-transparent border-0 p-0 cursor-pointer"
          >
            Cookie settings
          </button>
        </div>
      </div>
    </footer>
  );
}
