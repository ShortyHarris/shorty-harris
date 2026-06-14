import { type ReactNode } from 'react';
import './Shell.css';

export type ClientView = 'dashboard' | 'billing';

export function Shell({
  businessName,
  credits,
  displayName,
  onSignOut,
  view,
  onViewChange,
  children,
}: {
  businessName: string;
  credits: number | string;
  displayName: string;
  onSignOut: () => void;
  view: ClientView;
  onViewChange: (v: ClientView) => void;
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
            <button className={view === 'dashboard' ? 'on' : ''} onClick={() => onViewChange('dashboard')}>Opportunities</button>
            <button className={view === 'billing' ? 'on' : ''} onClick={() => onViewChange('billing')}>Billing</button>
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
