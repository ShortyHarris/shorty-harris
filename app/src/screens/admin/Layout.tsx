import { useState } from 'react';
import { NavLink, Routes, Route, Navigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { ApprovalQueue } from './ApprovalQueue';
import { Prospects } from './Prospects';
import { Campaigns, HotLeads } from './CampaignsAndLeads';
import { Analytics } from './Analytics';
import { Monitoring } from './Monitoring';
import '../../styles/theme-admin.css';
import './Layout.css';

const NAV = [
  { to: '/admin/approvals',  label: 'Approvals'  },
  { to: '/admin/prospects',  label: 'Prospects'  },
  { to: '/admin/campaigns',  label: 'Campaigns'  },
  { to: '/admin/hot-leads',  label: 'Hot Leads'  },
  { to: '/admin/analytics',  label: 'Analytics'  },
  { to: '/admin/monitoring', label: 'Monitoring' },
];

export function AdminLayout() {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initial = (profile?.full_name ?? 'A')[0].toUpperCase();
  const name    = profile?.full_name ?? 'Administrator';

  return (
    <div className="theme-admin">
      <div className="ashell">

        {/* ── DESKTOP SIDEBAR ───────────────────────────────────────── */}
        <aside className="aside">
          <SidebarInner
            initial={initial}
            name={name}
            signOut={signOut}
            onNav={() => {}}
          />
        </aside>

        {/* ── MAIN ─────────────────────────────────────────────────── */}
        <div className="amain">

          {/* Mobile top bar */}
          <div className="amobile-bar">
            <Link to="/" className="amobile-brand" style={{ textDecoration: 'none', color: 'inherit' }}>Shorty Harris</Link>
            <button className="ahamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <span /><span /><span />
            </button>
          </div>

          <main className="apage">
            <Routes>
              <Route path="approvals"  element={<ApprovalQueue />} />
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
            {/* Brand + close */}
            <div className="amobile-nav-top">
              <div>
                <Link to="/" className="amobile-nav-brand" style={{ textDecoration: 'none', color: 'inherit' }}>Shorty Harris</Link>
                <div className="amobile-nav-sub">Admin Dashboard</div>
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

            {/* Nav links — vertically centered */}
            <nav className="amobile-nav-body">
              {NAV.map((n, i) => (
                <motion.div
                  key={n.to}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 + i * 0.04 }}
                  className="w-full max-w-xs"
                >
                  <NavLink
                    to={n.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `amobile-nav-link${isActive ? ' is-active' : ''}`
                    }
                  >
                    {n.label}
                  </NavLink>
                </motion.div>
              ))}
            </nav>

            {/* User + sign out */}
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

/* ── Desktop sidebar content ─────────────────────────────────────── */
function SidebarInner({
  initial, name, signOut, onNav,
}: {
  initial: string;
  name: string;
  signOut: () => void;
  onNav: () => void;
}) {
  return (
    <>
      <div className="aside-brand">
        <Link to="/" className="aside-brand-name" style={{ textDecoration: 'none', color: 'inherit' }}>Shorty Harris</Link>
        <div className="aside-brand-sub">Admin Dashboard</div>
      </div>

      <p className="aside-section-label">Operations</p>
      <nav className="aside-nav">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            onClick={onNav}
            className={({ isActive }) => `aside-nav-item${isActive ? ' is-active' : ''}`}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      <div className="aside-bottom">
        <button className="aside-new" onClick={() => { onNav(); window.location.assign('/admin/campaigns'); }}>
          + New Campaign
        </button>
        <div className="aside-user">
          <div className="aside-user-avatar">{initial}</div>
          <div className="aside-user-info">
            <div className="aside-user-name">{name}</div>
            <div className="aside-user-role">Super Admin</div>
          </div>
          <button className="aside-signout" onClick={signOut} title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
