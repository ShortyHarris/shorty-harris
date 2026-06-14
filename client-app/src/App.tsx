import { useState, useEffect } from 'react';
import { Dashboard } from './screens/Dashboard';
import { Billing } from './screens/Billing';
import { Shell, type ClientView } from './screens/Shell';
import { Login } from './screens/Login';
import { useAuth } from './auth/AuthProvider';
import { useClientHeader } from './hooks/useClientHeader';

export default function App() {
  const { session, profile, loading, signOut } = useAuth();
  const [view, setView] = useState<ClientView>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'billing' ? 'billing' : 'dashboard';
  });

  const clientId = profile?.client_id ?? '';
  const { businessName, credits, reloadHeader } = useClientHeader(clientId);

  // If returning from a successful Stripe checkout, refresh the header credits shortly after.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success') {
      const t = setTimeout(() => reloadHeader(), 2600);
      return () => clearTimeout(t);
    }
  }, [reloadHeader]);

  if (loading) return <div className="full-center">Loading…</div>;
  if (!session) return <Login />;

  if (!profile?.client_id) {
    return (
      <div className="full-center col">
        <h2>No client account linked</h2>
        <p>This dashboard is for client accounts. Ask Shorty Harris to link your login to a business.</p>
        <button className="signout-plain" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
    <Shell
      businessName={businessName}
      credits={credits}
      displayName={profile.full_name ?? 'Account'}
      onSignOut={signOut}
      view={view}
      onViewChange={setView}
    >
      {view === 'dashboard'
        ? <Dashboard clientId={profile.client_id} />
        : <Billing clientId={profile.client_id} onCreditsChanged={reloadHeader} />}
    </Shell>
  );
}
