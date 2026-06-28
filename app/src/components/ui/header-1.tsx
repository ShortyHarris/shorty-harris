import React from 'react';
import { Link } from 'react-router-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { useScroll } from '@/components/ui/use-scroll';
import { createPortal } from 'react-dom';

const NAV_LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'Results',      href: '#results' },
];

export function Header() {
  const [open, setOpen] = React.useState(false);
  const scrolled = useScroll(10);

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <header
      className={cn('sticky top-0 z-50 w-full border-b border-transparent', {
        'bg-white/95 supports-[backdrop-filter]:bg-white/80 border-[#e8e3da] backdrop-blur-lg': scrolled,
      })}
    >
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link to="/" className="hover:bg-[#f5f2ec] rounded-md p-2 no-underline text-[17px] tracking-[-0.025em]">
          <span className="font-medium text-[#54574e]">Shorty</span>
          <span className="font-extrabold text-[#1a1b17]"> Harris</span>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.label} className={buttonVariants({ variant: 'ghost' })} href={link.href}>
              {link.label}
            </a>
          ))}
          <Button variant="outline" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/login">Get started</Link>
          </Button>
        </div>

        <Button
          size="icon"
          variant="outline"
          onClick={() => setOpen(!open)}
          className="md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="Toggle menu"
        >
          <MenuToggleIcon open={open} className="size-5" />
        </Button>
      </nav>

      <MobileMenu open={open}>
        <div className="grid gap-y-2">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              className={buttonVariants({ variant: 'ghost', className: 'justify-start' })}
              href={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="w-full bg-transparent" asChild>
            <Link to="/login" onClick={() => setOpen(false)}>Sign in</Link>
          </Button>
          <Button className="w-full" asChild>
            <Link to="/login" onClick={() => setOpen(false)}>Get started</Link>
          </Button>
        </div>
      </MobileMenu>
    </header>
  );
}

type MobileMenuProps = { open: boolean; children: React.ReactNode };

function MobileMenu({ open, children }: MobileMenuProps) {
  if (!open || typeof window === 'undefined') return null;

  return createPortal(
    <div
      id="mobile-menu"
      className="bg-white/95 supports-[backdrop-filter]:bg-white/80 backdrop-blur-lg fixed top-14 right-0 bottom-0 left-0 z-40 flex flex-col overflow-hidden border-y border-[#e8e3da] md:hidden"
    >
      <div
        data-slot={open ? 'open' : 'closed'}
        className="data-[slot=open]:animate-in data-[slot=open]:zoom-in-97 ease-out size-full p-4 flex flex-col justify-between gap-2"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
