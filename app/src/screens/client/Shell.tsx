import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
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
  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">{(businessName ?? 'S')[0]}</div>
            <div>
              <div className="brand-name">{businessName}</div>
              <div className="brand-sub">Shorty Harris</div>
            </div>
          </div>
          <nav className="top-nav">
            <NavLink to="/app" end className={({ isActive }) => isActive ? 'on' : ''}>Opportunities</NavLink>
            <NavLink to="/app/billing" className={({ isActive }) => isActive ? 'on' : ''}>Billing</NavLink>
          </nav>
          <div className="topbar-right">
            <div className="credits">
              <div className="credits-num">{credits}</div>
              <div className="credits-label">credits left</div>
            </div>
            <button className="signout-btn" onClick={onSignOut} title={displayName}>Sign out</button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
