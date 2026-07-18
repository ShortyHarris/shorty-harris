import { useState } from 'react';
import { NavLink, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, LogOut, Bell,
  ClipboardCheck, Flame, Newspaper,
  Building2, Users, Megaphone, BarChart2, Activity,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { useApprovalQueue } from '../../hooks/useApprovalQueue';
import { useBlogQueue } from '../../hooks/useBlogPosts';
import { useAdminHotLeads, useErrorLogs, useCampaigns } from '../../hooks/useAdminData';
import { ApprovalQueue } from './ApprovalQueue';
import { Blog } from './Blog';
import { Clients } from './Clients';
import { Prospects } from './Prospects';
import { Campaigns, HotLeads } from './CampaignsAndLeads';
import { Analytics } from './Analytics';
import { Monitoring } from './Monitoring';
import '../../styles/theme-admin.css';
import '../../styles/admin-tables.css';
import './Layout.css';

type NavItem = { to: string; label: string; icon: React.ElementType; badge?: number; badgeColor?: string };
type NotifItem = { to: string; label: string; icon: React.ElementType; count: number; color: string };

/* ── Root layout ─────────────────────────────────────────────────── */
export function AdminLayout() {
  useRealtimeSync();
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initial = (profile?.full_name ?? 'A')[0].toUpperCase();
  const name    = profile?.full_name ?? 'Administrator';

  // Badge counts — each reuses the exact same hook/query the destination page
  // itself uses, so the sidebar number can never drift from what the page shows.
  const { stats: approvalStats } = useApprovalQueue();
  const { pending: pendingPosts } = useBlogQueue();
  const { rows: hotLeads } = useAdminHotLeads();
  const { rows: unresolvedErrors } = useErrorLogs();
  const { rows: campaigns } = useCampaigns();

  const newHotLeadCount = hotLeads.filter((l) => l.status === 'new').length;
  const campaignsToReview = campaigns.filter((c) => c.needsReview).length;

  const NAV_DAILY: NavItem[] = [
    { to: '/admin/approvals', label: 'Approvals', icon: ClipboardCheck, badge: approvalStats.pending, badgeColor: '#d4870f' },
    { to: '/admin/hot-leads', label: 'Hot Leads', icon: Flame,          badge: newHotLeadCount,        badgeColor: '#d4870f' },
    { to: '/admin/blog',      label: 'Blog',      icon: Newspaper,      badge: pendingPosts.length,    badgeColor: '#d4870f' },
  ];
  const NAV_OPS: NavItem[] = [
    { to: '/admin/clients',    label: 'Clients',    icon: Building2  },
    { to: '/admin/prospects',  label: 'Prospects',  icon: Users      },
    { to: '/admin/campaigns',  label: 'Campaigns',  icon: Megaphone, badge: campaignsToReview, badgeColor: '#6b4fa0' },
    { to: '/admin/analytics',  label: 'Analytics',  icon: BarChart2  },
    { to: '/admin/monitoring', label: 'Monitoring', icon: Activity, badge: unresolvedErrors.length, badgeColor: '#a8533a' },
  ];

  // Notification bell aggregates the same live counts already shown as
  // sidebar badges above — there's no separate admin notification log in the
  // schema (the `notifications` table is client-facing hot-lead alerts, not
  // an admin feed), so this is a live "what needs attention" view rather
  // than a history of past events. No mark-as-read: counts regenerate from
  // the underlying data, they aren't a dismissible log.
  const NOTIF_ITEMS: NotifItem[] = [
    { to: '/admin/approvals',  label: 'Pending approvals',      icon: ClipboardCheck, count: approvalStats.pending,   color: '#d4870f' },
    { to: '/admin/hot-leads',  label: 'New hot leads',          icon: Flame,          count: newHotLeadCount,         color: '#d4870f' },
    { to: '/admin/blog',       label: 'Blog posts to review',   icon: Newspaper,      count: pendingPosts.length,     color: '#d4870f' },
    { to: '/admin/campaigns',  label: 'Campaigns awaiting approval', icon: Megaphone, count: campaignsToReview,       color: '#6b4fa0' },
    { to: '/admin/monitoring', label: 'Unresolved errors',      icon: Activity,       count: unresolvedErrors.length, color: '#a8533a' },
  ];

  return (
    <div className="theme-admin">
      <div className="ashell">

        {/* ── DESKTOP SIDEBAR ───────────────────────────────────────── */}
        <aside className="aside">
          <SidebarInner initial={initial} name={name} signOut={signOut} onNav={() => {}} navDaily={NAV_DAILY} navOps={NAV_OPS} notifItems={NOTIF_ITEMS} />
        </aside>

        {/* ── MAIN ─────────────────────────────────────────────────── */}
        <div className="amain">
          <div className="amobile-bar">
            <Link to="/" className="amobile-brand" style={{ textDecoration: 'none', color: 'inherit' }}>

              Shorty Harris
            </Link>
            <div className="flex items-center gap-1">
              <AdminNotificationBell items={NOTIF_ITEMS} />
              <button className="ahamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                <span /><span /><span />
              </button>
            </div>
          </div>

          <main className="apage">
            <Routes>
              <Route path="approvals"  element={<ApprovalQueue />} />
              <Route path="blog"       element={<Blog />} />
              <Route path="clients"    element={<Clients />} />
              <Route path="prospects"  element={<Prospects />} />
              <Route path="campaigns"  element={<Campaigns />} />
              <Route path="hot-leads"  element={<HotLeads />} />
              <Route path="analytics"  element={<Analytics />} />
              <Route path="monitoring" element={<Monitoring />} />
              <Route path="*" element={<Navigate to="/admin/approvals" replace />} />
            </Routes>
          </main>
        </div>
      </div>

      {/* ── MOBILE FULLSCREEN NAV ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="amobile-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="amobile-nav-top">
              <Link to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
                <div>
                  <div className="amobile-nav-brand">Shorty Harris</div>
                  <div className="amobile-nav-sub">Admin Dashboard</div>
                </div>
              </Link>
              <motion.button
                className="amobile-nav-close"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                whileTap={{ scale: 0.88 }}
              >
                <X size={18} />
              </motion.button>
            </div>

            <nav className="amobile-nav-body">
              <p className="amobile-section-label">Daily</p>
              {NAV_DAILY.map((n, i) => {
                const Icon = n.icon;
                return (
                  <motion.div key={n.to} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.03 }}>
                    <NavLink to={n.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `amobile-nav-link${isActive ? ' is-active' : ''}`}>
                      <Icon size={16} strokeWidth={1.9} className="amobile-nav-icon" />
                      {n.label}
                      <NavBadge count={n.badge} color={n.badgeColor} />
                    </NavLink>
                  </motion.div>
                );
              })}
              <p className="amobile-section-label">Operations</p>
              {NAV_OPS.map((n, i) => {
                const Icon = n.icon;
                return (
                  <motion.div key={n.to} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 + i * 0.03 }}>
                    <NavLink to={n.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `amobile-nav-link${isActive ? ' is-active' : ''}`}>
                      <Icon size={16} strokeWidth={1.9} className="amobile-nav-icon" />
                      {n.label}
                      <NavBadge count={n.badge} color={n.badgeColor} />
                    </NavLink>
                  </motion.div>
                );
              })}
            </nav>

            <div className="amobile-nav-bottom">
              <div className="aside-user-avatar">{initial}</div>
              <div className="aside-user-info">
                <div className="aside-user-name">{name}</div>
                <div className="aside-user-role">Super Admin</div>
              </div>
              <button className="amobile-signout" onClick={signOut}>
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Desktop sidebar ─────────────────────────────────────────────── */
function SidebarInner({
  initial, name, signOut, onNav, navDaily, navOps, notifItems,
}: {
  initial: string; name: string;
  signOut: () => void; onNav: () => void;
  navDaily: NavItem[]; navOps: NavItem[];
  notifItems: NotifItem[];
}) {
  const navigate = useNavigate();
  return (
    <>
      {/* Brand */}
      <div className="aside-brand">
        <Link to="/" className="flex-1 min-w-0" style={{ textDecoration: 'none' }}>
          <div className="aside-brand-name">Shorty Harris</div>
          <div className="aside-brand-sub">Admin Dashboard</div>
        </Link>
        <AdminNotificationBell items={notifItems} />
      </div>

      {/* Daily nav */}
      <p className="aside-section-label">Daily</p>
      <nav className="aside-nav">
        {navDaily.map((n) => <NavItem key={n.to} item={n} onNav={onNav} />)}
      </nav>

      {/* Operations nav */}
      <p className="aside-section-label" style={{ marginTop: 18 }}>Operations</p>
      <nav className="aside-nav">
        {navOps.map((n) => <NavItem key={n.to} item={n} onNav={onNav} />)}
      </nav>

      {/* Bottom */}
      <div className="aside-bottom">
        <button
          className="aside-new"
          onClick={() => { onNav(); navigate('/admin/campaigns'); }}
        >
          <Megaphone size={14} strokeWidth={2} />
          New Campaign
        </button>
        <div className="aside-user">
          <div className="aside-user-avatar">{initial}</div>
          <div className="aside-user-info">
            <div className="aside-user-name">{name}</div>
            <div className="aside-user-role">Super Admin</div>
          </div>
          <button className="aside-signout" onClick={signOut} title="Sign out">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Single nav item ─────────────────────────────────────────────── */
function NavItem({ item, onNav }: { item: NavItem; onNav: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNav}
      className={({ isActive }) => `aside-nav-item${isActive ? ' is-active' : ''}`}
    >
      <Icon size={16} strokeWidth={1.9} className="aside-nav-icon" />
      {item.label}
      <NavBadge count={item.badge} color={item.badgeColor} />
    </NavLink>
  );
}

/* ── Small count bubble — shown next to a nav label when count > 0 ── */
function NavBadge({ count, color = '#d4870f' }: { count?: number; color?: string }) {
  if (!count) return null;
  return (
    <span
      style={{ background: color }}
      className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-bold leading-none text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/* ── Notification bell — aggregates the same live counts already shown as
   sidebar badges into one dropdown. No mark-as-read: these are live counts,
   not a log, so there's nothing to persist as "read". ── */
function AdminNotificationBell({ items }: { items: NotifItem[] }) {
  const [open, setOpen] = useState(false);
  const total = items.reduce((sum, i) => sum + i.count, 0);
  const active = items.filter((i) => i.count > 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#62655c] transition-colors hover:bg-[#f5f2ec]"
      >
        <Bell size={17} strokeWidth={1.8} />
        {total > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#d4870f] px-1 text-[9.5px] font-bold leading-none text-white">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            // z-[100] rather than the usual z-50: on the Analytics page, recharts
            // portals each chart's tooltip into its own chart container (not into
            // <body>), so it isn't a sibling this overlay can out-rank just by
            // being later in the DOM — bumping z-index is the reliable fix.
            className="fixed inset-0 z-100 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
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
                <span className="text-[15px] font-bold text-[#20211c]">Needs your attention</span>
                <button onClick={() => setOpen(false)} className="cursor-pointer border-0 bg-transparent text-[22px] leading-none text-[#9a9d92] transition-colors hover:text-[#20211c]">×</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {active.length === 0 ? (
                  <div className="px-5 py-14 text-center text-[13px] text-[#9a9d92]">You're all caught up.</div>
                ) : (
                  active.map((i) => {
                    const Icon = i.icon;
                    return (
                      <Link
                        key={i.to}
                        to={i.to}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 border-b border-[#f5f2ec] px-5 py-3.5 no-underline transition-colors last:border-0 hover:bg-[#fbf9f5]"
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                          style={{ background: `${i.color}1a`, color: i.color }}
                        >
                          <Icon size={15} strokeWidth={2} />
                        </span>
                        <span className="flex-1 text-[13px] font-semibold text-[#20211c]">{i.label}</span>
                        <span className="text-[12.5px] font-bold" style={{ color: i.color }}>{i.count}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
