import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import './Login.css';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    if (error) setErr(error);
    setBusy(false);
  }

  return (
    <div className="login-shell">

      {/* ── Left: form ─────────────────────────────────────── */}
      <div className="login-left">
        <div className="login-form-wrap">

          <Link to="/" className="login-wordmark" style={{ textDecoration: 'none', color: 'inherit' }}>Shorty Harris</Link>

          <h1 className="login-title">Welcome back</h1>
          <p className="login-sub">Sign in to your account to continue</p>

          <form onSubmit={submit}>
            <label className="login-field">
              <span>Email address</span>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {err && <div className="login-err">{err}</div>}

            <button className="login-btn" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="login-copy">© {new Date().getFullYear()} Shorty Harris</p>
        </div>
      </div>

      {/* ── Right: illustration ─────────────────────────────── */}
      <div className="login-right">
        <div className="login-right-inner">
          <img
            src="https://illustrations.popsy.co/amber/paper-plane.svg"
            alt="Outbound illustration"
            className="login-illustration"
          />
          <p className="login-tagline">
            Every day you don't send,<br />a competitor does.
          </p>
          <p className="login-tagline-sub">
            Shorty Harris prospects, writes, and follows up — on autopilot.
          </p>
        </div>
      </div>

    </div>
  );
}
