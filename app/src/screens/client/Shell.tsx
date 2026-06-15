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
  const initial = (displayName ?? businessName ?? 'S')[0]?.toUpperCase() ?? 'S';

  return (
    <div className="cpage">
      <header className="ctop">
        <div className="ctop-inner">
          <div className="ctop-brand">
            <span className="ctop-brand-name">Shorty Harris</span>
            <span className="ctop-brand-suffix">AI</span>
          </div>

          <nav className="ctop-nav">
            <NavLink to="/app" end className={({ isActive }) => isActive ? 'on' : ''}>Dashboard</NavLink>
            <NavLink to="/app/billing" className={({ isActive }) => isActive ? 'on' : ''}>Billing</NavLink>
          </nav>

          <div className="ctop-right">
            <div className="ctop-credits" title="Lead credits remaining">
              <span className="ctop-credits-num">{credits}</span>
              <span className="ctop-credits-label">credits</span>
            </div>
            <button className="ctop-bell" aria-label="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>
            </button>
            <button className="ctop-avatar" onClick={onSignOut} title={`${displayName} — click to sign out`}>
              <span>{initial}</span>
            </button>
          </div>
        </div>
        <div className="ctop-context">
          <span className="ctop-context-name">{businessName}</span>
          <span className="ctop-context-sep">·</span>
          <span className="ctop-context-mode">Cockpit Mode</span>
        </div>
      </header>

      {children}

      <footer className="cfoot">
        <span>Shorty Harris AI</span>
        <div className="cfoot-links">
          <a href="#support">Support</a>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
        </div>
        <span className="cfoot-right">© {new Date().getFullYear()} Shorty Harris AI</span>
      </footer>
    </div>
  );
}
