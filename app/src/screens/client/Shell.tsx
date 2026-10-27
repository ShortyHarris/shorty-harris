import { useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, CreditCard, LogOut, ClipboardCheck, Settings, ChevronRight, Bell, Megaphone, BookOpen, BarChart3, Target, Filter, Users, Mail } from 'lucide-react';
import type { ClientNotification } from '../../hooks/useClientNotifications';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import '../../styles/admin-tables.css';
import './Shell.css';

type SideNavItem = { to: string; label: string; icon: React.ElementType; end?: boolean; badge?: number };

export function Shell({
  businessName,
  credits,
  displayName,
  pendingApprovals = 0,
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

  return (
    <div className="cpage">

      {/* ═══ DESKTOP TOP BAR - spans the full width above the sidebar and
           content, business name left, notifications + signed-in user
           right. Mirrors the admin top bar. Hidden on mobile in favor of
           .ctopbar below. ═══ */}
      <header className="ctopbar-desktop">
        <span className="ctopbar-desktop-biz">{businessName}</span>
        <div className="ctopbar-desktop-right">
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
            basePath={basePath}
          />
          <div className="ctopbar-desktop-user">
            <div className="cside-user-avatar">{nameInitial}</div>
            <div className="cside-user-info">
              <div className="cside-user-name">{displayName}</div>
              <div className="cside-user-role">Account</div>
            </div>
            <button className="cside-signout" onClick={onSignOut} title={signOutLabel}>
              <LogOut size={14} />
            </button>
          </div>
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
        <span className="ctopbar-biz">{businessName}</span>
        <Link
          to={`${basePath}/analytics`}
          aria-label="Analytics"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#62655c] transition-colors hover:bg-[#f5f2ec]"
        >
          <BarChart3 size={17} strokeWidth={1.8} />
        </Link>
        <Link
          to="/docs"
          aria-label="Help & Docs"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#62655c] transition-colors hover:bg-[#f5f2ec]"
        >
          <BookOpen size={17} strokeWidth={1.8} />
        </Link>
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
            className="flex items-center bg-yellow-400 border border-gray-200 shadow-sm gap-2.5 no-underline px-4 py-3 md:mx-7 md:mt-6 md:rounded-md"
           
          >
            <Mail size={17} strokeWidth={2} className="shrink-0" aria-hidden />
            <span className="flex-1 text-[13px] leading-snug">
              <strong className="font-bold">Connect your Gmail</strong> to start sending outreach - approvals are disabled until it's set up.
            </span>
            <ChevronRight size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          </Link>
        )}
        {children}
      </div>

      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══
           Six tabs is the most that fit at phone width. Billing lives on the
           top bar's credits chip and Targeting is a row in Settings, so those
           two give their slots to Prospects and Results. */}
      <nav className="cbnav">
        <MobileNavItem to={basePath} end icon={Inbox} label="Leads" badge={newHotLeads} />
        <MobileNavItem to={`${basePath}/campaigns`} icon={Megaphone} label="Campaigns" />
        <MobileNavItem to={`${basePath}/prospects`} icon={Users} label="Prospects" />
        <MobileNavItem to={`${basePath}/approvals`} icon={ClipboardCheck} label="Approvals" badge={pendingApprovals} />
        <MobileNavItem to={`${basePath}/results`} icon={Filter} label="Results" />
        {hideSettings
          ? <MobileNavItem to={`${basePath}/targeting`} icon={Target} label="Targeting" />
          : <MobileNavItem to={`${basePath}/settings`} icon={Settings} label="Settings" />}
      </nav>
    </div>
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
        className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#62655c] transition-colors hover:bg-[#f5f2ec]"
      >
        <Bell size={17} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span
            className="absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9.5px] font-bold leading-none text-white"
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
      className="fixed inset-0 z-100 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
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
        className="modal-card flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[420px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <span className="text-[15px] font-bold text-[#20211c]">Notifications</span>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={() => onMarkAllAsRead?.()}
                className="cursor-pointer border-0 bg-transparent text-[12px] font-semibold text-[#3c7a5b] hover:underline"
              >
                Mark all as read
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="cursor-pointer border-0 bg-transparent text-[22px] leading-none text-[#9a9d92] transition-colors hover:text-[#20211c]">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-5 py-14 text-center text-[13px] text-[#9a9d92]">Nothing yet.</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => onSelect(n)}
                className="flex w-full cursor-pointer items-start gap-2.5 border-b border-[#f5f2ec] px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-[#fbf9f5]"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: n.read_at ? 'transparent' : 'var(--leaf)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] leading-snug ${n.read_at ? 'text-[#62655c]' : 'font-semibold text-[#20211c]'}`}>
                    {n.body}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-[#9a9d92]">{formatNotifTime(n.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
