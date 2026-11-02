import { useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, CreditCard, LogOut, ClipboardCheck, Settings, ChevronRight, Bell, Megaphone, BookOpen, BarChart3, Target, Filter, Users, Mail, Menu, ChevronDown } from 'lucide-react';
import type { ClientNotification } from '../../hooks/useClientNotifications';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { ModalClose } from '../../components/ModalClose';
import { BrandLockup } from '../../components/BrandLockup';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useAppTheme } from '../../hooks/useAdminTheme';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import '../../styles/admin-tables.css';
import './Shell.css';

type SideNavItem = { to: string; label: string; icon: React.ElementType; end?: boolean; badge?: number };

export function Shell({
  businessName,
  credits,
  displayName,
  pendingApprovals = 0,
  awaitingProspects = 0,
  newHotLeads = 0,
  gmailConnected = true,
  notifications = [],
  unreadCount = 0,
  onMarkAsRead,
  onMarkAllAsRead,
  onSignOut,
  hideSettings = false,
  signOutLabel = 'Sign out',
  basePath = '/app',
  children,
}: {
  businessName: string;
  credits: number | string;
  displayName: string;
  pendingApprovals?: number;
  awaitingProspects?: number;
  newHotLeads?: number;
  gmailConnected?: boolean;
  notifications?: ClientNotification[];
  unreadCount?: number;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onSignOut: () => void;
  hideSettings?: boolean;
  signOutLabel?: string;
  basePath?: string;
  children: ReactNode;
}) {
  const nameInitial = (displayName  || 'U')[0].toUpperCase();
  const location = useLocation();
  const showGmailBanner = !gmailConnected && location.pathname !== `${basePath}/settings`;
  // Shown on every page except Approvals itself, where it would just repeat what's already there.
  const showApprovalsBanner = awaitingProspects > 0 && location.pathname !== `${basePath}/approvals`;

  const [moreOpen, setMoreOpen] = useState(false);
  const moreItems: SideNavItem[] = [
    { to: `${basePath}/campaigns`, label: 'Campaigns', icon: Megaphone },
    { to: `${basePath}/targeting`, label: 'Targeting', icon: Target },
    { to: `${basePath}/analytics`, label: 'Analytics', icon: BarChart3 },
    { to: `${basePath}/billing`, label: 'Billing', icon: CreditCard },
    ...(hideSettings ? [] : [{ to: `${basePath}/settings`, label: 'Settings', icon: Settings }]),
    { to: '/docs', label: 'Help & Docs', icon: BookOpen },
  ];
  const moreActive = moreItems.some((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`));

  // View-as-client passes "-" (no balance to show); a dash chip with an "Add credits" link is noise.
  const hasCredits = /^\d/.test(String(credits));

  // Grouped like the admin sidebar: what needs attention, the outreach itself, then account.
  const navGroups: { label: string; items: SideNavItem[] }[] = [
    {
      label: 'Daily',
      items: [
        { to: basePath, end: true, label: 'Hot Leads', icon: Inbox, badge: newHotLeads },
        { to: `${basePath}/approvals`, label: 'Approvals', icon: ClipboardCheck, badge: pendingApprovals },
      ],
    },
    {
      label: 'Outreach',
      items: [
        { to: `${basePath}/campaigns`, label: 'Campaigns', icon: Megaphone },
        { to: `${basePath}/targeting`, label: 'Targeting', icon: Target },
        { to: `${basePath}/prospects`, label: 'Prospects', icon: Users },
        { to: `${basePath}/results`, label: 'Results', icon: Filter },
        { to: `${basePath}/analytics`, label: 'Analytics', icon: BarChart3 },
      ],
    },
    {
      label: 'Account',
      items: [
        { to: `${basePath}/billing`, label: 'Billing', icon: CreditCard },
        ...(hideSettings ? [] : [{ to: `${basePath}/settings`, label: 'Settings', icon: Settings }]),
        { to: '/docs', label: 'Help & Docs', icon: BookOpen },
      ],
    },
  ];

  const { theme, toggle: toggleTheme } = useAppTheme('client');

  return (
    <div className="cpage">

      {/* ═══ APPROVALS BANNER - full-bleed, above the topbar and sidebar
           both, same slot the impersonation "Viewing as…" bar uses. Shown
           on every page except Approvals itself. ═══ */}
      {showApprovalsBanner && (
        <Link to={`${basePath}/approvals`} className="capproval-banner">
          <ClipboardCheck size={16} strokeWidth={2} className="shrink-0" aria-hidden />
          <span className="capproval-banner-text">
            <strong className="font-bold">{awaitingProspects} prospect{awaitingProspects === 1 ? '' : 's'}</strong> waiting for your approval.
            <span className="capproval-banner-note"> Nothing sends until you approve.</span>
          </span>
          <span className="capproval-banner-cta">
            Review now
            <ChevronRight size={14} strokeWidth={2.5} aria-hidden />
          </span>
        </Link>
      )}

      {/* ═══ DESKTOP TOP BAR - spans the full width above the sidebar and
           content, business name left, notifications + signed-in user
           right. Mirrors the admin top bar. Hidden on mobile in favor of
           .ctopbar below. ═══ */}
      <header className="ctopbar-desktop">
        <Link to={basePath} aria-label="Shorty Harris, go to Hot Leads" className="cbrand-link">
          <BrandLockup iconSize={20} noMargin />
        </Link>
        <div className="ctopbar-desktop-right">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
            basePath={basePath}
          />
          <AccountMenu
            initial={nameInitial}
            displayName={displayName}
            businessName={businessName}
            basePath={basePath}
            hideSettings={hideSettings}
            signOutLabel={signOutLabel}
            onSignOut={onSignOut}
          />
        </div>
      </header>

      <div className="cshell-row">

      {/* ═══ DESKTOP SIDEBAR - navigation only; branding and account info
           live in the top bar above ═══ */}
      <aside className="cside">
        <div className="cside-scroll">
        {navGroups.map((group, gi) => (
          <div key={group.label}>
            <p className="cside-section-label" style={{ marginTop: gi === 0 ? 4 : 18 }}>{group.label}</p>
            <nav className="cside-nav">
              {group.items.map((n) => {
                const Icon = n.icon;
                return (
                  <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `cside-link${isActive ? ' is-active' : ''}`}>
                    <Icon size={16} strokeWidth={1.9} className="cside-link-icon" />
                    {n.label}
                    {!!n.badge && n.badge > 0 && <span className="cside-nav-badge">{n.badge > 99 ? '99+' : n.badge}</span>}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        ))}
        </div>

        {hasCredits && (
          <div className="cside-bottom">
            <Link to={`${basePath}/billing`} className="cside-credits">
              <span className="cside-credits-num">{credits}</span>
              <span className="cside-credits-label">credits remaining</span>
              <span className="cside-credits-cta">Add credits</span>
            </Link>
          </div>
        )}
      </aside>

      {/* ═══ MOBILE TOPBAR ═══ */}
      <header className="ctopbar">
        <Link to={basePath} aria-label="Shorty Harris, go to Hot Leads" className="cbrand-link ctopbar-brand">
          <BrandLockup iconSize={18} noMargin />
        </Link>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
          basePath={basePath}
        />
        {hasCredits && (
          <Link to={`${basePath}/billing`} className="ctopbar-credits">
            <span className="ctopbar-credits-num">{credits}</span>
            <span className="ctopbar-credits-label"> cr</span>
          </Link>
        )}
      </header>

      {/* ═══ CONTENT ═══ */}
      <div className="cpage-body">
        {showGmailBanner && (
          <Link
            to={`${basePath}/settings`}
            className="flex items-center bg-(--ad-green-tint) text-(--ad-ink) border border-(--ad-green-line) gap-2.5 no-underline px-4 py-3 md:mx-7 md:mt-6 md:rounded-md"

          >
            <Mail size={17} strokeWidth={2} className="shrink-0" aria-hidden />
            <span className="flex-1 text-[13px] leading-snug">
              <strong className="font-semibold">Connect your Gmail</strong> to start sending outreach - approvals are disabled until it's set up.
            </span>
            <ChevronRight size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          </Link>
        )}
        {children}
      </div>

      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══
           The daily jobs and what clients check most get a tab; everything
           else sits in a labelled "More" list instead of unlabelled header icons. */}
      <nav className="cbnav">
        <MobileNavItem to={basePath} end icon={Inbox} label="Leads" badge={newHotLeads} />
        <MobileNavItem to={`${basePath}/approvals`} icon={ClipboardCheck} label="Approvals" badge={pendingApprovals} />
        <MobileNavItem to={`${basePath}/prospects`} icon={Users} label="Prospects" />
        <MobileNavItem to={`${basePath}/results`} icon={Filter} label="Results" />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`cbnav-item cursor-pointer border-0 bg-transparent font-[inherit]${moreActive ? ' is-active' : ''}`}
        >
          <span className="cbnav-icon-wrap">
            {moreActive && (
              <motion.span layoutId="cbnav-pill" className="cbnav-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />
            )}
            <span className="cbnav-icon"><Menu size={20} strokeWidth={moreActive ? 2.3 : 1.7} /></span>
          </span>
          <span className="cbnav-label">More</span>
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <MoreSheet
            key="more"
            items={moreItems}
            onClose={() => setMoreOpen(false)}
            onSignOut={() => { setMoreOpen(false); onSignOut(); }}
            signOutLabel={signOutLabel}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MoreSheet({
  items, onClose, onSignOut, signOutLabel,
}: {
  items: SideNavItem[]; onClose: () => void; onSignOut: () => void; signOutLabel: string;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-100 flex flex-col justify-end bg-[rgba(14,8,34,0.45)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose, { escape: true })}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="modal-card rounded-t-2xl bg-(--ad-surface) pb-[env(safe-area-inset-bottom,0px)]"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-(--ad-line) px-5 py-3.5">
          <span className="text-[15px] font-semibold text-(--ad-ink)">More</span>
          <ModalClose onClick={onClose} />
        </div>
        <nav className="flex flex-col py-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) => `flex items-center gap-3.5 px-5 py-3.5 text-[15px] font-medium no-underline ${isActive ? 'bg-(--ad-green-tint) text-(--ad-green)' : 'text-(--ad-ink) hover:bg-(--ad-surface-2)'}`}
              >
                <Icon size={19} strokeWidth={1.9} aria-hidden />
                <span className="flex-1">{item.label}</span>
                <ChevronRight size={16} className="text-(--ad-ink-ghost)" aria-hidden />
              </NavLink>
            );
          })}
          <button
            onClick={onSignOut}
            className="mt-1.5 flex cursor-pointer items-center gap-3.5 border-0 border-t border-solid border-(--ad-line) bg-transparent px-5 py-3.5 text-left text-[15px] font-medium text-(--ad-ink-soft) hover:bg-(--ad-surface-2)"
          >
            <LogOut size={19} strokeWidth={1.9} aria-hidden />
            {signOutLabel}
          </button>
        </nav>
      </motion.div>
    </motion.div>
  );
}

/* Bottom-nav tab - the active pill is a shared framer-motion layoutId, so it
   physically slides from one tab to the next instead of instantly swapping,
   and the icon goes from thin outline to bold duotone when active. */
function MobileNavItem({
  to, end, icon: Icon, label, badge,
}: {
  to: string; end?: boolean; icon: React.ElementType; label: string; badge?: number;
}) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `cbnav-item${isActive ? ' is-active' : ''}`}>
      {({ isActive }) => (
        <>
          <span className="cbnav-icon-wrap">
            {isActive && (
              <motion.span
                layoutId="cbnav-pill"
                className="cbnav-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
            <span className="cbnav-icon">
              <Icon size={20} strokeWidth={isActive ? 2.3 : 1.7} />
              {!!badge && badge > 0 && (
                <span className="cbnav-badge-dot">{badge > 99 ? '99+' : badge}</span>
              )}
            </span>
          </span>
          <span className="cbnav-label">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function formatNotifTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function NotificationBell({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  basePath,
}: {
  notifications: ClientNotification[];
  unreadCount: number;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  basePath: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Hot-lead alerts deep-link to the lead itself (Dashboard reads ?lead=).
  function handleClick(n: ClientNotification) {
    if (!n.read_at) onMarkAsRead?.(n.id);
    if (n.hot_lead_id) {
      setOpen(false);
      navigate(`${basePath}?lead=${encodeURIComponent(n.hot_lead_id)}`);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--ad-ink-soft) transition-colors hover:bg-(--ad-surface-2)"
      >
        <Bell size={17} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span
            className="absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9.5px] font-semibold leading-none text-(--ad-on-accent)"
            style={{ background: 'var(--amber)' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <NotificationPanel
            key="notifications"
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAllAsRead={onMarkAllAsRead}
            onSelect={handleClick}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* Split out from NotificationBell so useOverlayClose (and its Escape
   handling) is only live while the panel is actually open. */
function NotificationPanel({
  notifications, unreadCount, onMarkAllAsRead, onSelect, onClose,
}: {
  notifications: ClientNotification[];
  unreadCount: number;
  onMarkAllAsRead?: () => void;
  onSelect: (n: ClientNotification) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      // z-100 rather than the usual z-50: on the Analytics page, recharts
      // portals each chart's tooltip into its own chart container (not into
      // <body>), so it isn't a sibling this overlay can out-rank just by
      // being later in the DOM - bumping z-index is the reliable fix.
      className="fixed inset-0 z-100 flex flex-col md:items-center md:justify-center md:bg-[rgba(14,8,34,0.45)] md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose, { escape: true })}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[420px] md:rounded-md md:border md:border-(--ad-line)"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <span className="text-[15px] font-semibold text-(--ad-ink)">Notifications</span>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={() => onMarkAllAsRead?.()}
                className="cursor-pointer border-0 bg-transparent text-[12px] font-semibold text-(--ad-green) hover:underline"
              >
                Mark all as read
              </button>
            )}
            <ModalClose onClick={onClose} />
          </div>
        </div>
        <div className="modal-scroll flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-5 py-14 text-center text-[13px] text-(--ad-ink-soft)">Nothing yet.</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => onSelect(n)}
                className="flex w-full cursor-pointer items-start gap-2.5 border-b border-(--ad-surface-2) px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-(--ad-surface-2)"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: n.read_at ? 'transparent' : 'var(--leaf)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] leading-snug ${n.read_at ? 'text-(--ad-ink-soft)' : 'font-semibold text-(--ad-ink)'}`}>
                    {n.body}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-(--ad-ink-soft)">{formatNotifTime(n.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Top-bar account button: who's signed in, plus the account pages and a labelled Sign out,
   instead of a bare icon that was easy to misread or hit by accident. */
function AccountMenu({
  initial, displayName, businessName, basePath, hideSettings, signOutLabel, onSignOut,
}: {
  initial: string; displayName: string; businessName: string; basePath: string;
  hideSettings: boolean; signOutLabel: string; onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    ...(hideSettings ? [] : [{ to: `${basePath}/settings`, label: 'Settings', icon: Settings }]),
    { to: `${basePath}/billing`, label: 'Billing', icon: CreditCard },
    { to: '/docs', label: 'Help & Docs', icon: BookOpen },
  ];
  const itemCls = 'flex w-full cursor-pointer items-center gap-3 rounded-md border-0 bg-transparent px-3 py-2.5 text-left text-[13.5px] font-medium no-underline transition-colors hover:bg-(--ad-surface-2)';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="caccount-trigger" aria-label={`Account menu for ${displayName}`}>
          <span className="cside-user-avatar" aria-hidden>{initial}</span>
          <span className="caccount-name">{displayName}</span>
          <ChevronDown size={15} className="shrink-0 text-(--ad-ink-soft)" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-1.5">
        <div className="flex items-center gap-3 border-b border-(--ad-line) px-3 pb-3 pt-2">
          {/* Fixed colours: the menu is portaled outside .theme-client, so its colour variables don't apply here. */}
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-(--ad-green-tint) text-[12px] font-extrabold text-(--ad-green)" aria-hidden>{initial}</span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-(--ad-ink)">{displayName}</span>
            {businessName !== displayName && <span className="block truncate text-[12.5px] text-(--ad-ink-soft)">{businessName}</span>}
          </span>
        </div>
        <nav className="flex flex-col py-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className={`${itemCls} text-(--ad-ink)`}>
                <Icon size={16} strokeWidth={1.9} className="text-(--ad-ink-soft)" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-(--ad-line) pt-1.5">
          <button type="button" onClick={() => { setOpen(false); onSignOut(); }} className={`${itemCls} text-(--ad-ink)`}>
            <LogOut size={16} strokeWidth={1.9} className="text-(--ad-ink-soft)" aria-hidden />
            {signOutLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
