import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Login } from './screens/Login';
import { ForgotPassword } from './screens/ForgotPassword';
import { SetPassword } from './screens/SetPassword';
import { AdminLayout } from './screens/admin/Layout';
import { Shell } from './screens/client/Shell';
import { Dashboard } from './screens/client/Dashboard';
import { Billing } from './screens/client/Billing';
import { Approvals } from './screens/client/Approvals';
import { Settings } from './screens/client/Settings';
import { useClientHeader, clientHeaderKey } from './hooks/useClientHeader';
import { dashboardKey } from './hooks/useClientDashboard';
import { billingKey } from './hooks/useBilling';
import { useClientApprovals } from './hooks/useClientApprovals';
import { useClientRealtimeSync } from './hooks/useClientRealtimeSync';
import { queryClient } from './lib/queryClient';
import './styles/theme-admin.css';
import './styles/theme-client.css';
import { Home } from './screens/Home';
import { Blog } from './screens/Blog';
import { BlogPost } from './screens/BlogPost';
import { Privacy } from './screens/Privacy';
import { Terms } from './screens/Terms';

// ── Guards ──────────────────────────────────────────────────────────────────

function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  if (profile.role !== 'admin') return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function RequireClient({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  if (!profile.client_id) return <NoClientAccount />;
  return <>{children}</>;
}

// ── Login route: redirect away if already signed in ──────────────────────────

function LoginRoute() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session || !profile) return;
    if (profile.role === 'admin') navigate('/admin/approvals', { replace: true });
    else if (profile.client_id) navigate('/app', { replace: true });
    // profile exists but has neither admin role nor client_id — sign out and show login
    else signOut();
  }, [loading, session, profile, navigate, signOut]);

  if (loading || (session && profile)) return <Spinner />;
  return <Login />;
}

// ── Client zone — topbar shell + nested routes ───────────────────────────────

function ClientZone() {
  const { profile, signOut } = useAuth();
  const clientId = profile!.client_id!;
  const { businessName, credits } = useClientHeader(clientId);
  const { items: pendingApprovals } = useClientApprovals(clientId);
  useClientRealtimeSync(clientId);

  // After Stripe checkout redirect, invalidate header + billing + dashboard
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success') {
      const t = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: clientHeaderKey(clientId) });
        queryClient.invalidateQueries({ queryKey: billingKey(clientId) });
        queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
      }, 2600);
      return () => clearTimeout(t);
    }
  }, [clientId]);

  return (
    <div className="theme-client">
      <Shell
        businessName={businessName}
        credits={credits}
        displayName={profile!.full_name ?? 'Account'}
        pendingApprovals={pendingApprovals.length}
        onSignOut={signOut}
      >
        <Routes>
          <Route index element={<Dashboard clientId={clientId} />} />
          <Route path="approvals" element={<Approvals clientId={clientId} />} />
          <Route path="settings" element={<Settings clientId={clientId} />} />
          <Route path="billing" element={<Billing clientId={clientId} onCreditsChanged={() => {
            queryClient.invalidateQueries({ queryKey: clientHeaderKey(clientId) });
            queryClient.invalidateQueries({ queryKey: billingKey(clientId) });
            queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
          }} />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </Shell>
    </div>
  );
}

// ── Shared UI ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#f5f2ec',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <style>{`@keyframes sh-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Wordmark */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.26em',
          textTransform: 'uppercase',
          color: '#3c7a5b',
        }}>
          Shorty
        </span>
        <span style={{
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: '-0.045em',
          lineHeight: 1,
          color: '#20211c',
        }}>
          Harris
        </span>
      </div>

      {/* Spinner */}
      <div style={{
        marginTop: 28,
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: '2px solid #ddd8cb',
        borderTopColor: '#3c7a5b',
        animation: 'sh-spin 0.7s linear infinite',
      }} />
    </div>
  );
}

function NoClientAccount() {
  const { signOut } = useAuth();
  return (
    <div className="theme-client" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center', padding: 24 }}>
        <h2 style={{ margin: 0, color: 'var(--ink)' }}>No client account linked</h2>
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>This dashboard is for client accounts. Ask Shorty Harris to link your login to a business.</p>
        <button
          onClick={signOut}
          style={{ background: 'none', border: '1px solid var(--line-strong)', color: 'var(--ink-soft)', padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 550, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/set-password" element={<SetPassword />} />

      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />

      <Route path="/__preview-dashboard" element={
        <div className="theme-client">
          <Shell businessName="Acme Roofing" credits={42} displayName="Preview" onSignOut={() => {}}>
            <Dashboard clientId="__preview__" />
          </Shell>
        </div>
      } />

      <Route
        path="/admin/*"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      />

      <Route
        path="/app/*"
        element={
          <RequireClient>
            <ClientZone />
          </RequireClient>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

// Scrolls to the top of the page on every route change, since browsers
// otherwise keep the previous scroll position on client-side navigation.
// Skipped when the URL has a hash (e.g. "/#how") so in-page anchor
// navigation isn't fought.
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppRoutes />
    </BrowserRouter>
  );
}
