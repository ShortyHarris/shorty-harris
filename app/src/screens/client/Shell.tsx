import { type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Inbox, CreditCard, LogOut } from 'lucide-react';
import './Shell.css';

export function Shell({
  businessName,
  credits,
  displayName,
  onSignOut,
  children,
}: {
  businessName: string;
  credits: number | string;
  displayName: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const initial = (businessName ?? 'S')[0];

  return (
    <div className="page">

      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <aside className="sidebar">
        <Link to="/" className="sidebar-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="sidebar-biz-name">{businessName}</span>
        </Link>

        <div className="sidebar-section-label">Main</div>
        <nav className="sidebar-nav">
          <NavLink
            to="/app"
            end
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <Inbox size={17} strokeWidth={1.7} />
            Hot Leads
          </NavLink>
          <NavLink
            to="/app/billing"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <CreditCard size={17} strokeWidth={1.7} />
            Billing
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <Link to="/app/billing" className="sidebar-credits-card">
            <span className="sidebar-credits-num">{credits}</span>
            <span className="sidebar-credits-label">credits remaining</span>
            <span className="sidebar-credits-link">Add credits →</span>
          </Link>

          <button className="sidebar-profile" onClick={onSignOut}>
           
            <span className="sidebar-profile-info">
              <span className="sidebar-profile-name">{displayName}</span>
              <span className="sidebar-profile-role">Sign out</span>
            </span>
            <LogOut size={15} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      {/* ═══ MOBILE TOPBAR ═══ */}
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="brand-name">{businessName}</span>
          </Link>
          <div className="topbar-right">
            <Link to="/app/billing" className="credits-chip">
              <span className="credits-num">{credits}</span>
              <span className="credits-label"> credits</span>
            </Link>
            <button className="signout-btn" onClick={onSignOut} title={displayName}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ═══ CONTENT ═══ */}
      <div className="page-body">
        {children}
      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="bottom-nav">
        <NavLink
          to="/app"
          end
          className={({ isActive }) => `bnav-item${isActive ? ' active' : ''}`}
        >
          <span className="bnav-icon"><Inbox size={21} strokeWidth={1.8} /></span>
          <span>Hot Leads</span>
        </NavLink>
        <NavLink
          to="/app/billing"
          className={({ isActive }) => `bnav-item${isActive ? ' active' : ''}`}
        >
          <span className="bnav-icon"><CreditCard size={21} strokeWidth={1.8} /></span>
          <span>Billing</span>
        </NavLink>
      </nav>
    </div>
  );
}
