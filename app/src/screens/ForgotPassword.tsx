import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import './Login.css';

export function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [err, setErr]     = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);
  const [sent, setSent]   = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await resetPassword(email.trim());
    setBusy(false);
    // Show the same confirmation whether or not the email exists — don't
    // leak account existence through the response.
    if (error) setErr(error);
    else setSent(true);
  }

  return (
    <div className="login-shell">

      {/* ── Left: form ─────────────────────────────────────── */}
      <div className="login-left">
        <div className="login-form-wrap">

          <Link to="/" className="login-wordmark" style={{ textDecoration: 'none', color: 'inherit' }}>Shorty Harris</Link>

          <h1 className="login-title">Reset your password</h1>
          <p className="login-sub">
            {sent
              ? "Check your inbox for a link to set a new password."
              : "Enter the email on your account and we'll send you a reset link."}
          </p>

          {sent ? (
            <div style={{
              background: '#edf4ef',
              borderRadius: 10,
              padding: '14px 16px',
              color: '#2d5e46',
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.4,
            }}>
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
            </div>
          ) : (
            <form onSubmit={submit}>
              <label className="login-field">
                <span>Email address</span>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              {err && <div className="login-err">{err}</div>}

              <button className="login-btn" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          <p className="login-copy">
            <Link to="/login" className="login-forgot-link">Back to sign in</Link>
          </p>
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
