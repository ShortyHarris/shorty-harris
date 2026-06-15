import { useState } from 'react';
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
    <div className="theme-client auth-shell">
      {/* LEFT — form */}
      <section className="auth-left">
        <div className="auth-brand">
          <div className="brand-mark">SH</div>
          <div className="brand-name">Shorty Harris</div>
        </div>

        <div className="auth-form-wrap">
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-sub">
            New to Shorty Harris? <a href="mailto:hello@shortyharris.com">Request access</a>
          </p>

          <form onSubmit={submit} className="auth-form" noValidate>
            <label className="auth-field">
              <span>E-mail</span>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-pw">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </label>

            <div className="auth-row">
              <label className="auth-remember">
                <input type="checkbox" /> Remember me
              </label>
              <a className="auth-forgot" href="#">Forgot password?</a>
            </div>

            {err && <div className="auth-err">{err}</div>}

            <button className="auth-btn" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <div className="auth-foot">© {new Date().getFullYear()} Shorty Harris</div>
      </section>

      {/* RIGHT — marketing panel */}
      <aside className="auth-right">
        <div className="auth-right-inner">
          <div className="auth-card">
            <div className="auth-card-body">
              <h3>Every day you don't send,<br/>a competitor does.</h3>
              <p>Shorty Harris finds your ideal customers, starts the conversation, follows up, and hands you qualified leads.</p>
              <span className="auth-card-cta">Learn more →</span>
            </div>
            <div className="auth-card-stats">
              <div className="auth-stat">
                <span className="auth-stat-label">Replies this week</span>
                <span className="auth-stat-num">128</span>
              </div>
            </div>
          </div>

          <div className="auth-right-copy">
            <h2>Outbound on autopilot.</h2>
            <p>
              An AI agent that prospects, writes, sends and follows up — so your
              pipeline keeps moving while you focus on closing.
            </p>
          </div>

          <div className="auth-dots">
            <span className="dot on" /><span className="dot" /><span className="dot" />
          </div>
        </div>
      </aside>
    </div>
  );
}
