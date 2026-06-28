import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
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

  // Redirect to login if the invite link is expired or already used
  useEffect(() => {
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

  // Show nothing while auth is resolving or while redirecting
  if (loading || !session) return null;

  const email = session.user.email ?? '';

  return (
    <div className="login-shell">

      {/* ── Left: form ─────────────────────────────────────── */}
      <div className="login-left">
        <div className="login-form-wrap">

          <div className="login-wordmark">Shorty Harris</div>

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
            src="https://illustrations.popsy.co/amber/paper-plane.svg"
            alt="Welcome to Shorty Harris"
            className="login-illustration"
          />
          <p className="login-tagline">
            Welcome to Shorty Harris
          </p>
          <p className="login-tagline-sub">
            Your leads, messages, and results —<br />all in one place.
          </p>
        </div>
      </div>

    </div>
  );
}
