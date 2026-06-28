import { useState } from 'react';
import { NavLink, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, LogOut,
  ClipboardCheck, Flame,
  Building2, Users, Megaphone, BarChart2, Activity,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { ApprovalQueue } from './ApprovalQueue';
import { Clients } from './Clients';
import { Prospects } from './Prospects';
import { Campaigns, HotLeads } from './CampaignsAndLeads';
import { Analytics } from './Analytics';
import { Monitoring } from './Monitoring';
import '../../styles/theme-admin.css';
import '../../styles/admin-tables.css';
import './Layout.css';

type NavItem = { to: string; label: string; icon: React.ElementType };

/* ── Navigation groups ───────────────────────────────────────────── */
const NAV_DAILY: NavItem[] = [
  { to: '/admin/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: '/admin/hot-leads', label: 'Hot Leads', icon: Flame          },
];
const NAV_OPS: NavItem[] = [
  { to: '/admin/clients',    label: 'Clients',    icon: Building2  },
  { to: '/admin/prospects',  label: 'Prospects',  icon: Users      },
  { to: '/admin/campaigns',  label: 'Campaigns',  icon: Megaphone  },
  { to: '/admin/analytics',  label: 'Analytics',  icon: BarChart2  },
  { to: '/admin/monitoring', label: 'Monitoring', icon: Activity   },
];

/* ── Root layout ─────────────────────────────────────────────────── */
export function AdminLayout() {
  useRealtimeSync();
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initial = (profile?.full_name ?? 'A')[0].toUpperCase();
  const name    = profile?.full_name ?? 'Administrator';

  return (
    <div className="theme-admin">
      <div className="ashell">

        {/* ── DESKTOP SIDEBAR ───────────────────────────────────────── */}
        <aside className="aside">
          <SidebarInner initial={initial} name={name} signOut={signOut} onNav={() => {}} />
        </aside>

        {/* ── MAIN ─────────────────────────────────────────────────── */}
        <div className="amain">
          <div className="amobile-bar">
            <Link to="/" className="amobile-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
              
              Shorty Harris
            </Link>
            <button className="ahamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <span /><span /><span />
            </button>
          </div>

          <main className="apage">
            <Routes>
              <Route path="approvals"  element={<ApprovalQueue />} />
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
              <div className="flex items-center gap-2.5">
               
                <div>
                  <div className="amobile-nav-brand">Shorty Harris</div>
                  <div className="amobile-nav-sub">Admin Dashboard</div>
                </div>
              </div>
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
  initial, name, signOut, onNav,
}: {
  initial: string; name: string;
  signOut: () => void; onNav: () => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      {/* Brand */}
      <div className="aside-brand">
        <div>
          <div className="aside-brand-name">Shorty Harris</div>
          <div className="aside-brand-sub">Admin Dashboard</div>
        </div>
      </div>

      {/* Daily nav */}
      <p className="aside-section-label">Daily</p>
      <nav className="aside-nav">
        {NAV_DAILY.map((n) => <NavItem key={n.to} item={n} onNav={onNav} />)}
      </nav>

      {/* Operations nav */}
      <p className="aside-section-label" style={{ marginTop: 18 }}>Operations</p>
      <nav className="aside-nav">
        {NAV_OPS.map((n) => <NavItem key={n.to} item={n} onNav={onNav} />)}
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
    </NavLink>
  );
}
