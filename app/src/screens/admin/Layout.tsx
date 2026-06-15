import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { ApprovalQueue } from './ApprovalQueue';
import { Prospects } from './Prospects';
import { Campaigns, HotLeads } from './CampaignsAndLeads';
import { Analytics } from './Analytics';
import { Monitoring } from './Monitoring';
import '../../styles/theme-admin.css';
import './Layout.css';

interface NavItem { to: string; label: string; icon: React.ReactNode; }
const NAV: NavItem[] = [
  { to: '/admin/approvals',  label: 'Approvals',  icon: <IconCheck /> },
  { to: '/admin/prospects',  label: 'Prospects',  icon: <IconPeople /> },
  { to: '/admin/campaigns',  label: 'Campaigns',  icon: <IconMega /> },
  { to: '/admin/hot-leads',  label: 'Hot Leads',  icon: <IconFlame /> },
  { to: '/admin/analytics',  label: 'Analytics',  icon: <IconChart /> },
  { to: '/admin/monitoring', label: 'Monitoring', icon: <IconPulse /> },
];

const PAGE_TITLES: Record<string, string> = {
  approvals: 'Engine Room',
  prospects: 'Prospects',
  campaigns: 'Campaign Control Center',
  'hot-leads': 'Hot Leads',
  analytics: 'Analytics',
  monitoring: 'Monitoring Console',
};

export function AdminLayout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const route = location.pathname.split('/')[2] ?? 'approvals';
  const title = PAGE_TITLES[route] ?? 'Engine Room';

  const initial = (profile?.full_name ?? 'A')[0].toUpperCase();

  return (
    <div className="theme-admin">
      <div className="ashell">
        {/* ── SIDEBAR ───────────────────────────────────────────────── */}
        <aside className="aside">
          <div className="aside-brand">
            <div className="aside-brand-name">Shorty Harris</div>
            <div className="aside-brand-sub">Engine Room</div>
          </div>

          <nav className="aside-nav">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => `aside-nav-item${isActive ? ' is-active' : ''}`}
              >
                <span className="aside-nav-icon">{n.icon}</span>
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="aside-bottom">
            <button className="aside-new" onClick={() => window.location.assign('/admin/campaigns')}>
              + New Campaign
            </button>
            <div className="aside-user">
              <div className="aside-user-avatar">{initial}</div>
              <div className="aside-user-info">
                <div className="aside-user-name">{profile?.full_name ?? 'Administrator'}</div>
                <div className="aside-user-role">SUPER ADMIN</div>
              </div>
              <button className="aside-signout" onClick={signOut} title="Sign out">↗</button>
            </div>
          </div>
        </aside>

        {/* ── MAIN ─────────────────────────────────────────────────── */}
        <div className="amain">
          <header className="atop">
            <div className="atop-title">{title}</div>
            <div className="atop-tabs">
              <NavLink to="/admin/approvals" className={({ isActive }) => isActive ? 'on' : ''}>Approvals</NavLink>
              <NavLink to="/admin/analytics" className={({ isActive }) => isActive ? 'on' : ''}>Analytics</NavLink>
              <NavLink to="/admin/monitoring" className={({ isActive }) => isActive ? 'on' : ''}>Monitoring</NavLink>
            </div>
            <div className="atop-right">
              <button className="atop-bell" aria-label="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>
                <span className="atop-bell-dot" />
              </button>
              <div className="atop-profile">
                <div className="atop-avatar">{initial}</div>
                <span>Profile</span>
              </div>
            </div>
          </header>

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

          <footer className="afoot">
            <span>SYS_LOAD: 0.12</span>
            <span>· REPLICA_SYNC: OK</span>
            <span>· API_V3: STABLE</span>
            <span>· LAST_DEPLOY: 2H AGO</span>
            <span>· NODE_COUNT: 48</span>
            <span className="afoot-ver">SHORTY HARRIS ENGINE ROOM · v4.2.0-stable</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function IconCheck() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="8 12 11 15 16 9"/></svg>; }
function IconPeople() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 19c0-2.2 2-3.8 4-3.8s4 1.6 4 3.8"/></svg>; }
function IconMega() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2l13 6V5L3 11z"/><path d="M19 8a4 4 0 0 1 0 8"/></svg>; }
function IconFlame() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s4 5 4 9a4 4 0 1 1-8 0c0-1.5.6-3 1.2-4 .4.8 1 1.5 1.8 2 0-2 .5-5 1-7Z"/></svg>; }
function IconChart() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="13" width="3" height="6"/><rect x="11" y="9" width="3" height="10"/><rect x="17" y="5" width="3" height="14"/></svg>; }
function IconPulse() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 12 8 12 11 4 14 20 17 12 21 12"/></svg>; }
