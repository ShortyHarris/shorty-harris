import { useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, CreditCard, LogOut, ClipboardCheck, Settings, Mail, ChevronRight, Bell } from 'lucide-react';
import type { ClientNotification } from '../../hooks/useClientNotifications';
import '../../styles/admin-tables.css';
import './Shell.css';

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
  children: ReactNode;
}) {
  const nameInitial = (displayName  || 'U')[0].toUpperCase();
  const location = useLocation();
  const showGmailBanner = !gmailConnected && location.pathname !== '/app/settings';

  return (
    <div className="cpage">

      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <aside className="cside">
        <div className="cside-brand">
          <div className="flex-1 min-w-0">
            <div className="cside-biz-name">{businessName}</div>
            <div className="cside-biz-sub">Dashboard</div>
          </div>
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
          />
        </div>

        <p className="cside-section-label">Menu</p>
        <nav className="cside-nav">
          <NavLink to="/app" end className={({ isActive }) => `cside-link${isActive ? ' is-active' : ''}`}>
            <Inbox size={16} strokeWidth={1.9} className="cside-link-icon" />
            Hot Leads
            {newHotLeads > 0 && <span className="cside-nav-badge">{newHotLeads > 99 ? '99+' : newHotLeads}</span>}
          </NavLink>
          <NavLink to="/app/approvals" className={({ isActive }) => `cside-link${isActive ? ' is-active' : ''}`}>
            <ClipboardCheck size={16} strokeWidth={1.9} className="cside-link-icon" />
            Approvals
            {pendingApprovals > 0 && <span className="cside-nav-badge">{pendingApprovals > 99 ? '99+' : pendingApprovals}</span>}
          </NavLink>
          <NavLink to="/app/billing" className={({ isActive }) => `cside-link${isActive ? ' is-active' : ''}`}>
            <CreditCard size={16} strokeWidth={1.9} className="cside-link-icon" />
            Billing
          </NavLink>
          <NavLink to="/app/settings" className={({ isActive }) => `cside-link${isActive ? ' is-active' : ''}`}>
            <Settings size={16} strokeWidth={1.9} className="cside-link-icon" />
            Settings
          </NavLink>
        </nav>

        <div className="cside-bottom">
          <Link to="/app/billing" className="cside-credits">
            <span className="cside-credits-num">{credits}</span>
            <span className="cside-credits-label">credits remaining</span>
            <span className="cside-credits-cta">Add credits </span>
          </Link>
          <div className="cside-user">
            <div className="cside-user-avatar">{nameInitial}</div>
            <div className="cside-user-info">
              <div className="cside-user-name">{displayName}</div>
              <div className="cside-user-role">Account</div>
            </div>
            <button className="cside-signout" onClick={onSignOut} title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ═══ MOBILE TOPBAR ═══ */}
      <header className="ctopbar">
        <span className="ctopbar-biz">{businessName}</span>
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
        />
        <Link to="/app/billing" className="ctopbar-credits">
          <span className="ctopbar-credits-num">{credits}</span>
          <span className="ctopbar-credits-label"> cr</span>
        </Link>
      </header>

      {/* ═══ CONTENT ═══ */}
      <div className="cpage-body">
        {showGmailBanner && (
          <Link
            to="/app/settings"
            className="flex items-center bg-yellow-400 border border-gray-200 shadow-sm gap-2.5 no-underline px-4 py-3 md:mx-7 md:mt-6 md:rounded-md"
           
          >
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Gmail_icon_%282020%29.svg/1280px-Gmail_icon_%282020%29.svg.png" alt="Gmail" className="w-5 h-4" /> 
            <span className="flex-1 text-[13px] leading-snug">
              <strong className="font-bold">Connect your Gmail</strong> to start sending outreach - approvals are disabled until it's set up.
            </span>
            <ChevronRight size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          </Link>
        )}
        {children}
      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="cbnav">
        <NavLink to="/app" end className={({ isActive }) => `cbnav-item${isActive ? ' is-active' : ''}`}>
          <span className="cbnav-icon cbnav-icon-badge">
            <Inbox size={20} strokeWidth={1.8} />
            {newHotLeads > 0 && <span className="cbnav-badge-dot">{newHotLeads > 99 ? '99+' : newHotLeads}</span>}
          </span>
          <span>Leads</span>
        </NavLink>
        <NavLink to="/app/approvals" className={({ isActive }) => `cbnav-item${isActive ? ' is-active' : ''}`}>
          <span className="cbnav-icon cbnav-icon-badge">
            <ClipboardCheck size={20} strokeWidth={1.8} />
            {pendingApprovals > 0 && <span className="cbnav-badge-dot">{pendingApprovals > 99 ? '99+' : pendingApprovals}</span>}
          </span>
          <span>Approvals</span>
        </NavLink>
        <NavLink to="/app/billing" className={({ isActive }) => `cbnav-item${isActive ? ' is-active' : ''}`}>
          <span className="cbnav-icon"><CreditCard size={20} strokeWidth={1.8} /></span>
          <span>Billing</span>
        </NavLink>
        <NavLink to="/app/settings" className={({ isActive }) => `cbnav-item${isActive ? ' is-active' : ''}`}>
          <span className="cbnav-icon"><Settings size={20} strokeWidth={1.8} /></span>
          <span>Settings</span>
        </NavLink>
        <button className="cbnav-item" onClick={onSignOut}>
          <span className="cbnav-icon"><LogOut size={20} strokeWidth={1.8} /></span>
          <span>Sign out</span>
        </button>
      </nav>
    </div>
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
}: {
  notifications: ClientNotification[];
  unreadCount: number;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
}) {
  const [open, setOpen] = useState(false);

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
          <motion.div
            className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[80vh] md:max-w-[420px] md:rounded-2xl md:shadow-2xl"
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
                  <button onClick={() => setOpen(false)} className="cursor-pointer border-0 bg-transparent text-[22px] leading-none text-[#9a9d92] transition-colors hover:text-[#20211c]">×</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-5 py-14 text-center text-[13px] text-[#9a9d92]">Nothing yet.</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => !n.read_at && onMarkAsRead?.(n.id)}
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
        )}
      </AnimatePresence>
    </>
  );
}
