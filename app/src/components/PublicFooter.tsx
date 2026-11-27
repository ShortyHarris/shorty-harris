import { Link } from 'react-router-dom';
import { openConsentPreferences } from '../lib/consent';
import { PublicBrand } from './PublicNav';
import { CTA_LABEL } from "@/lib/marketing";

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

const linkCls = 'text-[15px] text-ink-muted no-underline hover:text-ink-strong transition-colors';

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-solid border-[#e6e6e6] bg-white font-inter">
      <div className="mx-auto w-full px-5 lg:px-12 pt-14 pb-8">
        <div className="flex flex-wrap justify-between gap-12 pb-10">
          <div className="flex-[1_1_320px] max-w-[380px]">
            <Link to="/" aria-label="Shorty Harris home" className="no-underline inline-block">
              <PublicBrand />
            </Link>
            <p className="m-0 mt-4 text-[15px] leading-[1.6] text-ink-muted">
              AI-powered outbound that finds ideal customers and delivers warm, qualified leads straight to your inbox.
            </p>
            <Link
              to="/signup"
              className="mt-5 inline-flex items-center justify-center h-12 px-6 rounded-full bg-brand text-white text-[15px] font-semibold no-underline hover:bg-brand-deep transition-colors"
            >
              {CTA_LABEL}
            </Link>
            <div className="mt-4">
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[15px] text-ink-strong no-underline hover:text-brand">
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-[72px] gap-y-10">
            {FOOT_LINKS.map((col) => (
              <div key={col.title} className="flex flex-col gap-3">
                <div className="text-[12px] font-semibold tracking-[0.12em] uppercase text-ink-strong">{col.title}</div>
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

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-[14px] text-ink-muted">
          <span>© {new Date().getFullYear()} Shorty Harris. All rights reserved.</span>
          <button
            type="button"
            onClick={openConsentPreferences}
            className="self-start sm:self-auto text-[14px] text-ink-muted hover:text-ink-strong transition-colors bg-transparent border-0 p-0 cursor-pointer"
          >
            Cookie settings
          </button>
        </div>
      </div>
    </footer>
  );
}
