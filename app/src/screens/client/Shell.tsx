import { type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Inbox, CreditCard, LogOut } from 'lucide-react';
import '../../styles/admin-tables.css';
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
  const bizInitial  = (businessName || 'B')[0].toUpperCase();
  const nameInitial = (displayName  || 'U')[0].toUpperCase();

  return (
    <div className="cpage">

      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <aside className="cside">
        <div className="cside-brand">
        
          <div>
            <div className="cside-biz-name">{businessName}</div>
            <div className="cside-biz-sub">Dashboard</div>
          </div>
        </div>

        <p className="cside-section-label">Menu</p>
        <nav className="cside-nav">
          <NavLink to="/app" end className={({ isActive }) => `cside-link${isActive ? ' is-active' : ''}`}>
            <Inbox size={16} strokeWidth={1.9} className="cside-link-icon" />
            Hot Leads
          </NavLink>
          <NavLink to="/app/billing" className={({ isActive }) => `cside-link${isActive ? ' is-active' : ''}`}>
            <CreditCard size={16} strokeWidth={1.9} className="cside-link-icon" />
            Billing
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
        <Link to="/app/billing" className="ctopbar-credits">
          <span className="ctopbar-credits-num">{credits}</span>
          <span className="ctopbar-credits-label"> cr</span>
        </Link>
      </header>

      {/* ═══ CONTENT ═══ */}
      <div className="cpage-body">
        {children}
      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="cbnav">
        <NavLink to="/app" end className={({ isActive }) => `cbnav-item${isActive ? ' is-active' : ''}`}>
          <span className="cbnav-icon"><Inbox size={20} strokeWidth={1.8} /></span>
          <span>Leads</span>
        </NavLink>
        <NavLink to="/app/billing" className={({ isActive }) => `cbnav-item${isActive ? ' is-active' : ''}`}>
          <span className="cbnav-icon"><CreditCard size={20} strokeWidth={1.8} /></span>
          <span>Billing</span>
        </NavLink>
        <button className="cbnav-item" onClick={onSignOut}>
          <span className="cbnav-icon"><LogOut size={20} strokeWidth={1.8} /></span>
          <span>Sign out</span>
        </button>
      </nav>
    </div>
  );
}
