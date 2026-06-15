import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import './Login.css';

type Mode = 'signin' | 'signup';

export function Login({ notice }: { notice?: string | null } = {}) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setErr(null);
    setInfo(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email.trim(), password);
        if (error) setErr(error);
      } else {
        const { error, needsConfirm } = await signUp(email.trim(), password, fullName.trim());
        if (error) setErr(error);
        else if (needsConfirm) setInfo('Check your inbox to confirm your email, then sign in.');
      }
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === 'signup';

  return (
    <div className="theme-client auth-shell">
      {/* LEFT — form */}
      <section className="auth-left">
        <div className="auth-brand">
          <div className="brand-mark">SH</div>
          <div className="brand-name">Shorty Harris</div>
        </div>

        <div className="auth-form-wrap">
          <h1 className="auth-title">{isSignup ? 'Create your account' : 'Sign in'}</h1>
          <p className="auth-sub">
            {isSignup ? (
              <>Already have an account?{' '}
                <button type="button" className="auth-link-btn" onClick={() => switchMode('signin')}>Sign in</button>
              </>
            ) : (
              <>New to Shorty Harris?{' '}
                <button type="button" className="auth-link-btn" onClick={() => switchMode('signup')}>Sign up</button>
              </>
            )}
          </p>

          {notice && <div className="auth-notice">{notice}</div>}

          <form onSubmit={submit} className="auth-form" noValidate>
            {isSignup && (
              <label className="auth-field">
                <span>Full name</span>
                <input
                  type="text"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
            )}

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
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  minLength={6}
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

            {!isSignup && (
              <div className="auth-row">
                <label className="auth-remember">
                  <input type="checkbox" /> Remember me
                </label>
                <a className="auth-forgot" href="#">Forgot password?</a>
              </div>
            )}

            {err && <div className="auth-err">{err}</div>}
            {info && <div className="auth-info">{info}</div>}

            <button className="auth-btn" disabled={busy}>
              {busy ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create account' : 'Sign in')}
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
