import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { ApprovalQueue } from './ApprovalQueue';
import { Prospects } from './Prospects';
import { Campaigns, HotLeads } from './CampaignsAndLeads';
import { Analytics } from './Analytics';
import { Monitoring } from './Monitoring';
import '../../styles/theme-admin.css';
import './Layout.css';

const NAV = [
  { to: '/admin/approvals',  label: 'Approvals',  hint: 'Review AI drafts before they send' },
  { to: '/admin/prospects',  label: 'Prospects',  hint: 'Everyone in the pipeline' },
  { to: '/admin/campaigns',  label: 'Campaigns',  hint: 'Outreach by client' },
  { to: '/admin/hot-leads',  label: 'Hot leads',  hint: 'Qualified opportunities' },
  { to: '/admin/analytics',  label: 'Analytics',  hint: 'Performance and A/B tests' },
  { to: '/admin/monitoring', label: 'Monitoring', hint: 'Errors and system health' },
];

export function AdminLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="theme-admin">
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">SH</div>
            <div>
              <div className="brand-name">Shorty Harris</div>
              <div className="brand-sub">Admin console</div>
            </div>
          </div>

          <nav className="nav">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
              >
                <span className="nav-label">{n.label}</span>
                <span className="nav-hint">{n.hint}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-foot-group">
            <div className="who">{profile?.full_name ?? 'Admin'}</div>
            <button className="signout" onClick={signOut}>Sign out</button>
            <div className="sidebar-foot">
              <span className="env-dot" /> Sandbox environment
            </div>
          </div>
        </aside>

        <main className="main">
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
  );
}
