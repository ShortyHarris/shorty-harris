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
        <div className="sidebar-brand">
          
          <span className="sidebar-biz-name">{businessName}</span>
        </div>

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
          <div className="brand">
            
            <span className="brand-name">{businessName}</span>
          </div>
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
          <Inbox size={23} strokeWidth={1.6} />
          <span>Hot Leads</span>
        </NavLink>
        <NavLink
          to="/app/billing"
          className={({ isActive }) => `bnav-item${isActive ? ' active' : ''}`}
        >
          <CreditCard size={23} strokeWidth={1.6} />
          <span>Billing</span>
        </NavLink>
      </nav>
    </div>
  );
}
