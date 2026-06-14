import { useState } from 'react';
import { ApprovalQueue } from './screens/ApprovalQueue';
import { Prospects } from './screens/Prospects';
import { Campaigns, HotLeads } from './screens/CampaignsAndLeads';
import { Monitoring } from './screens/Monitoring';
import { Analytics } from './screens/Analytics';
import { Login } from './screens/Login';
import { useAuth } from './auth/AuthProvider';
import './App.css';

type NavKey = 'approvals' | 'prospects' | 'campaigns' | 'hotleads' | 'analytics' | 'errors';

const NAV: { key: NavKey; label: string; hint: string }[] = [
  { key: 'approvals', label: 'Approvals', hint: 'Review AI drafts before they send' },
  { key: 'prospects', label: 'Prospects', hint: 'Everyone in the pipeline' },
  { key: 'campaigns', label: 'Campaigns', hint: 'Outreach by client' },
  { key: 'hotleads', label: 'Hot leads', hint: 'Qualified opportunities' },
  { key: 'analytics', label: 'Analytics', hint: 'Performance and A/B tests' },
  { key: 'errors', label: 'Monitoring', hint: 'Errors and system health' },
];

export default function App() {
  const { session, profile, loading, signOut } = useAuth();
  const [active, setActive] = useState<NavKey>('approvals');

  if (loading) return <div className="full-center">Loading…</div>;
  if (!session) return <Login />;

  // Signed in but not an admin — block access.
  if (profile && profile.role !== 'admin') {
    return (
      <div className="full-center col">
        <h2>This console is for administrators.</h2>
        <p>Your account isn’t an admin. If you’re a client, use the client dashboard.</p>
        <button className="ghost-btn" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
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
            <button key={n.key} className={`nav-item ${active === n.key ? 'is-active' : ''}`} onClick={() => setActive(n.key)}>
              <span className="nav-label">{n.label}</span>
              <span className="nav-hint">{n.hint}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot-group">
          <div className="who">{profile?.full_name ?? 'Admin'}</div>
          <button className="signout" onClick={signOut}>Sign out</button>
          <div className="sidebar-foot"><span className="env-dot" /> Sandbox environment</div>
        </div>
      </aside>

      <main className="main">
        {active === 'approvals' && <ApprovalQueue />}
        {active === 'prospects' && <Prospects />}
        {active === 'campaigns' && <Campaigns />}
        {active === 'hotleads' && <HotLeads />}
        {active === 'analytics' && <Analytics />}
        {active === 'errors' && <Monitoring />}
      </main>
    </div>
  );
}
