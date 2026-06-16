import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Login } from './screens/Login';
import { AdminLayout } from './screens/admin/Layout';
import { Shell } from './screens/client/Shell';
import { Dashboard } from './screens/client/Dashboard';
import { Billing } from './screens/client/Billing';
import { useClientHeader } from './hooks/useClientHeader';
import './styles/theme-admin.css';
import './styles/theme-client.css';
import { Home } from './screens/Home';

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
  const { businessName, credits, reloadHeader } = useClientHeader(clientId);

  // Refresh credits after a successful Stripe checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success') {
      const t = setTimeout(() => reloadHeader(), 2600);
      return () => clearTimeout(t);
    }
  }, [reloadHeader]);

  return (
    <div className="theme-client">
      <Shell
        businessName={businessName}
        credits={credits}
        displayName={profile!.full_name ?? 'Account'}
        onSignOut={signOut}
      >
        <Routes>
          <Route index element={<Dashboard clientId={clientId} />} />
          <Route path="billing" element={<Billing clientId={clientId} onCreditsChanged={reloadHeader} />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </Shell>
    </div>
  );
}

// ── Shared UI ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a909c' }}>
      Loading…
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* / is reserved for the future public landing page */}
        <Route path="/" element={<Home/>} />

        <Route path="/login" element={<LoginRoute />} />

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

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
