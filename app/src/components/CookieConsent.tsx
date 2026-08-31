import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  acceptAllConsent,
  getConsent,
  hasRespondedToConsent,
  onOpenConsentPreferences,
  rejectNonEssentialConsent,
  setConsent,
  type ConsentState,
} from '../lib/consent';
import { loadGoogleAnalytics } from '../lib/googleAnalytics';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" };

export function CookieConsent() {
  const [visible, setVisible] = useState(() => !hasRespondedToConsent());
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState<ConsentState>(getConsent());

  useEffect(() => {
    return onOpenConsentPreferences(() => {
      setDraft(getConsent());
      setManaging(true);
      setVisible(true);
    });
  }, []);

  if (!visible) return null;

  function acceptAll() {
    acceptAllConsent();
    loadGoogleAnalytics();
    setVisible(false);
    setManaging(false);
  }

  function rejectAll() {
    rejectNonEssentialConsent();
    setVisible(false);
    setManaging(false);
  }

  function savePreferences() {
    setConsent(draft);
    if (draft.analytics) loadGoogleAnalytics();
    setVisible(false);
    setManaging(false);
  }

  return (
    <div
      style={{ ...FONT, position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, pointerEvents: 'none' }}
    >
      {managing && (
        <div
          onClick={() => setManaging(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1, background: 'rgba(20,21,17,0.4)', pointerEvents: 'auto' }}
        />
      )}

      {!managing ? (
        <div
          role="dialog"
          aria-label="Cookie consent"
          style={{
            position: 'relative',
            zIndex: 2,
            pointerEvents: 'auto',
            width: '100%',
            maxWidth: 720,
            background: '#fff',
            border: '1px solid #e5ddd3',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(20,21,17,0.18)',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1a1b17' }}>We use cookies</div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: '#54574e' }}>
              We use essential cookies to run this site, and, only with your permission, analytics
              cookies to understand how it's used. You can change your choice anytime from{' '}
              <button
                type="button"
                onClick={() => setManaging(true)}
                style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: '#3c7a5b', textDecoration: 'underline', cursor: 'pointer' }}
              >
                cookie settings
              </button>{' '}
              in the footer. See our{' '}
              <Link to="/cookies" style={{ color: '#3c7a5b', textDecoration: 'underline' }}>Cookie Policy</Link>.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setManaging(true)}
              style={{ background: 'none', border: '1px solid #ddd8cb', color: '#3f4038', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
            >
              Manage preferences
            </button>
            <button
              type="button"
              onClick={rejectAll}
              style={{ background: 'none', border: '1px solid #ddd8cb', color: '#3f4038', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
            >
              Reject non-essential
            </button>
            <button
              type="button"
              onClick={acceptAll}
              style={{ background: '#3c7a5b', border: '1px solid #3c7a5b', color: '#fff', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Accept all
            </button>
          </div>
        </div>
      ) : (
        <div
          role="dialog"
          aria-label="Cookie preferences"
          style={{
            position: 'relative',
            zIndex: 2,
            pointerEvents: 'auto',
            width: '100%',
            maxWidth: 480,
            margin: 'auto',
            background: '#fff',
            border: '1px solid #e5ddd3',
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(20,21,17,0.25)',
            padding: '24px 24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1b17' }}>Cookie preferences</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 14, borderBottom: '1px solid #efe9de' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1b17' }}>Necessary</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#9a9d92', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Always on</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#6b6e65' }}>
              Required for login, security, and core site functionality. These can't be switched off.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1b17' }}>Analytics</span>
              <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={draft.analytics}
                  onChange={(e) => setDraft({ analytics: e.target.checked })}
                  style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', margin: 0, cursor: 'pointer' }}
                />
                <span
                  style={{
                    position: 'absolute', inset: 0, borderRadius: 999,
                    background: draft.analytics ? '#3c7a5b' : '#ddd8cb',
                    transition: 'background 0.15s',
                  }}
                />
                <span
                  style={{
                    position: 'absolute', top: 2, left: draft.analytics ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.15s',
                  }}
                />
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#6b6e65' }}>
              Google Analytics, and, for signed-in clients only, Smartlook session
              recording, so we can understand usage and improve the product. Nothing is
              loaded unless you turn this on.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={rejectAll}
              style={{ background: 'none', border: '1px solid #ddd8cb', color: '#3f4038', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
            >
              Reject non-essential
            </button>
            <button
              type="button"
              onClick={savePreferences}
              style={{ background: '#3c7a5b', border: '1px solid #3c7a5b', color: '#fff', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Save preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
