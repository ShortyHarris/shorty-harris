import { useEffect, useState, type CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';

/** After this long the splash offers a reload, whatever it is waiting for. */
export const SPLASH_STALL_MS = 15_000;

const BRAND = 'var(--ad-green, #7412ef)';
const INK = 'var(--ad-ink, #0e0822)';

const btnBase: CSSProperties = {
  minHeight: 44, padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 650,
  cursor: 'pointer', fontFamily: 'inherit',
};
const primaryBtn: CSSProperties = { ...btnBase, background: BRAND, color: '#fff', border: 0 };
const secondaryBtn: CSSProperties = { ...btnBase, background: 'transparent', color: INK, border: '1px solid var(--ad-line-mid, #cfc9e8)' };

/**
 * The full-screen SHORTY Harris splash (see LOADING_SCREEN_SPEC.md). It never spins forever:
 * if the auth bootstrap failed it shows why, with Try again, Reload and Sign out, and if it has
 * been up for SPLASH_STALL_MS for any other reason (a slow code chunk, a request that never
 * answered) it offers a reload. On 13 Nov 2026 a reload in mobile Safari sat on the bare
 * spinner indefinitely while the server was overloaded, with no way out but closing the tab.
 */
export function BootSplash() {
  const { bootError, retry, signOut, session } = useAuth();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStalled(true), SPLASH_STALL_MS);
    return () => clearTimeout(t);
  }, []);

  const showSpinner = !bootError;

  return (
    <div
      data-testid="boot-splash"
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center',
        background: 'var(--ad-surface-2, #f9f6ff)',
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <style>{`@keyframes sh-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Wordmark */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', color: BRAND }}>
          Shorty
        </span>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color: INK }}>
          Harris
        </span>
      </div>

      {showSpinner && (
        <div
          role="progressbar"
          aria-label="Loading"
          style={{
            marginTop: 28, width: 18, height: 18, borderRadius: '50%',
            border: '2px solid var(--ad-line-mid, #cfc9e8)', borderTopColor: BRAND,
            animation: 'sh-spin 0.7s linear infinite',
          }}
        />
      )}

      {bootError && (
        <div role="alert" style={{ marginTop: 24, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: INK }}>{bootError}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            <button type="button" style={primaryBtn} onClick={retry}>Try again</button>
            <button type="button" style={secondaryBtn} onClick={() => window.location.reload()}>Reload page</button>
            {session && <button type="button" style={secondaryBtn} onClick={() => { signOut(); }}>Sign out</button>}
          </div>
        </div>
      )}

      {!bootError && stalled && (
        <div role="status" style={{ marginTop: 24, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: INK }}>
            This is taking longer than usual. The server may be busy.
          </p>
          <button type="button" style={primaryBtn} onClick={() => window.location.reload()}>Reload page</button>
        </div>
      )}
    </div>
  );
}
