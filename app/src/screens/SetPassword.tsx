import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { BrandLockup } from '../components/BrandLockup';
import { authRedirectError } from '../lib/authRedirectError';
import './Login.css';

const MIN_PW = 8;

export function SetPassword() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [busy, setBusy]           = useState(false);
  const [done, setDone]           = useState(false);

  // Only fall back to a silent redirect when there's genuinely no session
  // and no explanation for it (e.g. someone just typed this URL directly).
  // An expired/used invite or reset link carries its own error in the URL
  // (captured by authRedirectError before Supabase strips it): that case
  // shows a real message below instead of bouncing to /login unexplained.
  useEffect(() => {
    if (authRedirectError) return;
    if (!loading && !session) navigate('/login', { replace: true });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < MIN_PW) {
      setErr(`Password must be at least ${MIN_PW} characters.`);
      return;
    }
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
    setTimeout(() => navigate('/app', { replace: true }), 1400);
  }

  if (authRedirectError) {
    return (
      <div className="login-shell">
        <div className="login-left">
          <div className="login-form-wrap">
            <BrandLockup />
            <h1 className="login-title">This link has expired</h1>
            <p className="login-sub">
              {authRedirectError.code === 'otp_expired'
                ? "This invite or password reset link is no longer valid, links like this expire after a while or after they've already been used once."
                : (authRedirectError.description ?? 'This link is no longer valid.')}
            </p>
            <div style={{
              background: '#edf4ef',
              borderRadius: 10,
              padding: '14px 16px',
              color: '#2d5e46',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.5,
            }}>
              If this was an invite, ask your admin to resend it. If you were resetting your password, request a new link below.
            </div>
            <p className="login-switch" style={{ marginTop: 20 }}>
              <Link to="/forgot-password">Request a new reset link</Link>
            </p>
            <p className="login-copy">
              <Link to="/login" className="login-forgot-link">Back to sign in</Link>
            </p>
          </div>
        </div>
        <div className="login-right">
          <div className="login-right-inner">
            <img
              src="/outbound-illustration.png"
              alt="Welcome to Shorty Harris"
              className="login-illustration"
            />
            <p className="login-tagline">Welcome to Shorty Harris</p>
            <p className="login-tagline-sub">
              Your leads, messages, and results,<br />all in one place.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show nothing while auth is resolving or while redirecting
  if (loading || !session) return null;

  const email = session.user.email ?? '';

  return (
    <div className="login-shell">

      {/* ── Left: form ─────────────────────────────────────── */}
      <div className="login-left">
        <div className="login-form-wrap">

          <BrandLockup />

          <h1 className="login-title">Set your password</h1>
          <p className="login-sub">
            Choose a password for{' '}
            <strong style={{ color: '#1a1c17', fontWeight: 600 }}>{email}</strong>.
            You'll use it every time you sign in.
          </p>

          {done ? (
            <div style={{
              background: '#edf4ef',
              borderRadius: 10,
              padding: '14px 16px',
              color: '#2d5e46',
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.4,
            }}>
              Password saved! Taking you to your dashboard…
            </div>
          ) : (
            <form onSubmit={submit}>

              <label className="login-field">
                <span>Password</span>
                <div className="login-pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder={`At least ${MIN_PW} characters`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="login-pw-toggle"
                    onClick={() => setShowPw((v) => !v)}
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

              <label className="login-field">
                <span>Confirm password</span>
                <div className="login-pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="Same password again"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </label>

              {err && <div className="login-err">{err}</div>}

              <button className="login-btn" disabled={busy}>
                {busy ? 'Saving…' : 'Set password & continue'}
              </button>

            </form>
          )}

          <p className="login-copy">© {new Date().getFullYear()} Shorty Harris</p>
        </div>
      </div>

      {/* ── Right: illustration ─────────────────────────────── */}
      <div className="login-right">
        <div className="login-right-inner">
          <img
            src="/outbound-illustration.png"
            alt="Welcome to Shorty Harris"
            className="login-illustration"
          />
          <p className="login-tagline">
            Welcome to Shorty Harris
          </p>
          <p className="login-tagline-sub">
            Your leads, messages, and results,<br />all in one place.
          </p>
        </div>
      </div>

    </div>
  );
}
