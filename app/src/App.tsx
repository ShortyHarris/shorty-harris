import { useEffect, useState, lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from './auth/AuthProvider';
import { startImpersonation, endImpersonation } from './lib/impersonation';
import { AnimatePresence } from 'framer-motion';
import { ImpersonationBanner } from './components/ImpersonationBanner';
import { ConfirmDialog } from './components/ConfirmDialog';
import { supabase } from './lib/supabase';
import { useClientHeader, clientHeaderKey } from './hooks/useClientHeader';
import { useClientDashboard, dashboardKey } from './hooks/useClientDashboard';
import { billingKey } from './hooks/useBilling';
import { useClientApprovals } from './hooks/useClientApprovals';
import { useGmailConnection } from './hooks/useGmailConnection';
import { useClientNotifications } from './hooks/useClientNotifications';
import { useClientRealtimeSync } from './hooks/useClientRealtimeSync';
import { TourProvider } from './tour/TourProvider';
import { initSmartlook, identifySmartlookUser } from './lib/smartlook';
import { queryClient } from './lib/queryClient';
import { getConsent, onConsentChange, applyStoredConsent } from './lib/consent';
import { CookieConsent } from './components/CookieConsent';
import { loadGoogleAnalytics, trackPageView } from './lib/googleAnalytics';
import './styles/admin-palette.css';
import './styles/theme-admin.css';
import './styles/theme-client.css';
import { Home } from './screens/Home';
import { Blog } from './screens/Blog';
import { BlogPost } from './screens/BlogPost';
import { Privacy } from './screens/Privacy';
import { Terms } from './screens/Terms';
import { Cookies } from './screens/Cookies';
import { Unsubscribe } from './screens/Unsubscribe';
import { NotFound } from './screens/NotFound';

// Everything below is gated behind auth (or is an auth screen itself) - lazy
// loading it keeps the public marketing/blog pages from shipping the admin
// dashboard, client dashboard, and their dependencies (recharts, the
// markdown editor, …) in the initial bundle.
const Login          = lazy(() => import('./screens/Login').then((m) => ({ default: m.Login })));
const Signup         = lazy(() => import('./screens/Signup').then((m) => ({ default: m.Signup })));
const ForgotPassword = lazy(() => import('./screens/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const SetPassword    = lazy(() => import('./screens/SetPassword').then((m) => ({ default: m.SetPassword })));
const AdminLayout    = lazy(() => import('./screens/admin/Layout').then((m) => ({ default: m.AdminLayout })));
const Shell          = lazy(() => import('./screens/client/Shell').then((m) => ({ default: m.Shell })));
const Dashboard      = lazy(() => import('./screens/client/Dashboard').then((m) => ({ default: m.Dashboard })));
const Billing        = lazy(() => import('./screens/client/Billing').then((m) => ({ default: m.Billing })));
const Approvals      = lazy(() => import('./screens/client/Approvals').then((m) => ({ default: m.Approvals })));
const ClientCampaigns = lazy(() => import('./screens/client/Campaigns').then((m) => ({ default: m.Campaigns })));
const Settings       = lazy(() => import('./screens/client/Settings').then((m) => ({ default: m.Settings })));
const ClientAnalytics = lazy(() => import('./screens/client/Analytics').then((m) => ({ default: m.Analytics })));
const TargetingProfile = lazy(() => import('./screens/client/TargetingProfile').then((m) => ({ default: m.TargetingProfile })));
const Results         = lazy(() => import('./screens/client/Results').then((m) => ({ default: m.Results })));
const Prospects       = lazy(() => import('./screens/client/Prospects').then((m) => ({ default: m.Prospects })));
const Docs           = lazy(() => import('./screens/docs/Docs').then((m) => ({ default: m.Docs })));

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

// Any signed-in user, admin or client - used for screens (like /docs) that
// both zones link into and that scope their own content via RLS instead of
// a route-level role check.
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session || !profile) return <Navigate to="/login" replace />;
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
    // profile exists but has neither admin role nor client_id - sign out and show login
    else signOut();
  }, [loading, session, profile, navigate, signOut]);

  if (loading || (session && profile)) return <Spinner />;
  return <Login />;
}

// ── Signup route: same already-signed-in redirect as LoginRoute ──────────────

function SignupRoute() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session || !profile) return;
    if (profile.role === 'admin') navigate('/admin/approvals', { replace: true });
    else if (profile.client_id) navigate('/app', { replace: true });
    else signOut();
  }, [loading, session, profile, navigate, signOut]);

  if (loading || (session && profile)) return <Spinner />;
  return <Signup />;
}

// ── Client zone - topbar shell + nested routes ───────────────────────────────

function ClientZone() {
  const { profile, signOut } = useAuth();
  const clientId = profile!.client_id!;
  const { businessName, credits } = useClientHeader(clientId);
  const { items: pendingItems, stats: approvalStats } = useClientApprovals(clientId);
  // Exact count, not the loaded list, which is capped for very large queues.
  const pendingApprovals = Math.max(approvalStats.pending, pendingItems.length);
  const { connection: gmailConnection } = useGmailConnection(clientId);
  const { leads } = useClientDashboard(clientId);
  const newHotLeads = leads.filter((l) => l.status === 'new').length;
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useClientNotifications(clientId);
  useClientRealtimeSync(clientId);

  // Client dashboard only, per the plan - not admin, not the public site.
  // Gated on analytics consent, same as Google Analytics; also re-checked if
  // the visitor grants consent later via the cookie preferences banner.
  useEffect(() => {
    function startIfConsented() {
      if (!getConsent().analytics) return;
      initSmartlook();
      identifySmartlookUser(profile!.id, {
        name: profile!.full_name,
        role: profile!.role,
        client_id: clientId,
      });
    }
    startIfConsented();
    return onConsentChange(startIfConsented);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile!.id]);

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
      <TourProvider userId={profile!.id}>
        <Shell
          businessName={businessName}
          credits={credits}
          displayName={profile!.full_name ?? 'Account'}
          pendingApprovals={pendingApprovals}
          newHotLeads={newHotLeads}
          gmailConnected={gmailConnection.connected}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onSignOut={signOut}
        >
          <Routes>
            <Route index element={<Dashboard clientId={clientId} />} />
            <Route path="campaigns" element={<ClientCampaigns clientId={clientId} />} />
            <Route path="prospects" element={<Prospects clientId={clientId} />} />
            <Route path="approvals" element={<Approvals clientId={clientId} />} />
            <Route path="analytics" element={<ClientAnalytics clientId={clientId} />} />
            <Route path="results" element={<Results clientId={clientId} />} />
            <Route path="targeting" element={<TargetingProfile clientId={clientId} />} />
            <Route path="settings" element={<Settings clientId={clientId} onSignOut={signOut} />} />
            <Route path="billing" element={<Billing clientId={clientId} onCreditsChanged={() => {
              queryClient.invalidateQueries({ queryKey: clientHeaderKey(clientId) });
              queryClient.invalidateQueries({ queryKey: billingKey(clientId) });
              queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
            }} />} />
            <Route path="*" element={<Navigate to="" replace />} />
          </Routes>
        </Shell>
      </TourProvider>
    </div>
  );
}

// ── Impersonation zone - admin "View as client" ─────────────────────────────
// Deliberately NOT a parameterized variant of ClientZone: it skips realtime
// sync, Smartlook identity, notifications, Gmail status, and Settings
// entirely (skipping them avoids threading the impersonation client into
// hooks that don't need it).
//
// Opens read-only. Reads go through the impersonation token, whose client
// throws on writes and which RLS only grants SELECT (see
// supabase/migrations/20261002090000_impersonation_rls.sql). Note the write
// hooks use the app's own `supabase` (the admin session), not the injected
// client - so in view mode it's the pages' readOnly gating that stops writes.
//
// "Edit as admin" (banner) switches the pages to the admin's own session, so
// writes go through the normal admin policies and are attributed to the admin.
// Billing, Gmail/Settings and campaign deletion stay unavailable either way.

function ImpersonateZone() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<{ client: SupabaseClient; businessName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Edit as admin": off by default. Lives here so it survives moving between
  // this client's pages, and resets on exit (the zone unmounts).
  const [editMode, setEditMode] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    startImpersonation(clientId)
      .then((s) => { if (!cancelled) setSession({ client: s.client, businessName: s.businessName }); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to start impersonation.'); });
    return () => { cancelled = true; };
  }, [clientId]);

  function exit() {
    if (clientId) endImpersonation(clientId);
    navigate('/admin/clients', { replace: true });
  }

  // Back to view only: mint a fresh read-only token first - the old one has
  // a 15 minute TTL and isn't refreshed, so it may have expired while editing.
  async function leaveEditMode() {
    if (!clientId) return;
    try {
      const s = await startImpersonation(clientId);
      setSession({ client: s.client, businessName: s.businessName });
      setEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restart the read-only view.');
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-[14px] text-[#a8533a]">{error}</p>
        <button onClick={exit} className="cursor-pointer rounded-xl border-0 bg-[#3c7a5b] px-4 py-2 text-[13px] font-semibold text-white">
          Back to Clients
        </button>
      </div>
    );
  }

  if (!session || !clientId) return <Spinner />;

  const basePath = `/admin/impersonate/${clientId}`;
  // View mode reads through the read-only impersonation token. Edit mode uses
  // the admin's own session instead: every client write RPC accepts is_admin(),
  // writes are attributed to the admin (approved_by etc.), and the session
  // doesn't expire after 15 minutes the way the impersonation token does.
  const client = editMode ? supabase : session.client;
  const readOnly = !editMode;

  return (
    <div className="theme-client">
      <ImpersonationBanner
        businessName={session.businessName}
        editMode={editMode}
        onToggleEdit={() => (editMode ? leaveEditMode() : setConfirmEdit(true))}
        onExit={exit}
      />
      <Shell
        businessName={session.businessName}
        credits="-"
        displayName={session.businessName}
        hideSettings
        signOutLabel="Exit impersonation"
        onSignOut={exit}
        basePath={basePath}
      >
        <Routes>
          <Route index element={<Dashboard clientId={clientId} client={client} readOnly={readOnly} markViewedOnOpen={false} basePath={basePath} />} />
          {/* Deleting a campaign wipes its prospects and messages - never from here. */}
          <Route path="campaigns" element={<ClientCampaigns clientId={clientId} client={client} readOnly={readOnly} canDelete={false} basePath={basePath} />} />
          <Route path="prospects" element={<Prospects clientId={clientId} client={client} readOnly={readOnly} basePath={basePath} />} />
          <Route path="approvals" element={<Approvals clientId={clientId} client={client} readOnly={readOnly} basePath={basePath} isAdmin />} />
          <Route path="analytics" element={<ClientAnalytics clientId={clientId} client={client} />} />
          <Route path="results" element={<Results clientId={clientId} client={client} basePath={basePath} />} />
          <Route path="targeting" element={<TargetingProfile clientId={clientId} client={client} readOnly={readOnly} />} />
          {/* Buying credits charges the client - read-only even in edit mode. */}
          <Route path="billing" element={<Billing clientId={clientId} client={client} readOnly />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </Shell>

      <AnimatePresence>
        {confirmEdit && (
          <ConfirmDialog
            key="confirm-edit-mode"
            title={`Edit ${session.businessName} as admin?`}
            confirmLabel="Start editing"
            onConfirm={() => { setEditMode(true); setConfirmEdit(false); }}
            onCancel={() => setConfirmEdit(false)}
          >
            Approvals, lead updates, notes, campaign and targeting changes go live immediately and are recorded under your name. Billing, Gmail and deleting campaigns stay off.
          </ConfirmDialog>
        )}
      </AnimatePresence>
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
      <Route path="/signup" element={<SignupRoute />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/set-password" element={<SetPassword />} />

      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/cookies" element={<Cookies />} />
      <Route path="/unsubscribe" element={<Unsubscribe />} />

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

      {/* Deliberately outside AdminLayout - this renders the client's own
          Shell (read-only), not the admin's sidebar chrome. */}
      <Route
        path="/admin/impersonate/:clientId/*"
        element={
          <RequireAdmin>
            <ImpersonateZone />
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

      <Route
        path="/docs"
        element={
          <RequireAuth>
            <Docs />
          </RequireAuth>
        }
      />
      <Route
        path="/docs/:slug"
        element={
          <RequireAuth>
            <Docs />
          </RequireAuth>
        }
      />

      <Route path="*" element={<NotFound />} />
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

// Sends a GA4 page_view on the first load and every client-side route change,
// since the config call has send_page_view: false and the GA property's
// history-based page change tracking is off. Only runs with analytics consent,
// and also fires for the current page when consent is granted later.
// Rendered after the routes so their effects (e.g. document.title) run first.
function GoogleAnalyticsPageViews() {
  const { pathname, search } = useLocation();
  const pagePath = pathname + search;

  useEffect(() => {
    if (!getConsent().analytics) return;
    // Idempotent; needed because this child effect runs before App's
    // applyStoredConsent() on the first render.
    loadGoogleAnalytics();
    trackPageView(pagePath);
  }, [pagePath]);

  useEffect(() => {
    return onConsentChange((state) => {
      if (!state.analytics) return;
      loadGoogleAnalytics();
      trackPageView(pagePath);
    });
  }, [pagePath]);

  return null;
}

export default function App() {
  useEffect(() => {
    applyStoredConsent();
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<Spinner />}>
        <AppRoutes />
      </Suspense>
      <GoogleAnalyticsPageViews />
      <CookieConsent />
    </BrowserRouter>
  );
}
