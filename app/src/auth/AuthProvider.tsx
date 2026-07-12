import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Profile {
  id: string;
  role: 'admin' | 'client';
  full_name: string | null;
  client_id: string | null;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedProfileId = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);

      if (!s) {
        setProfile(null);
        loadedProfileId.current = null;
        setLoading(false);
        return;
      }

      // Supabase fires TOKEN_REFRESHED whenever the tab regains focus/visibility
      // and the session gets silently revalidated. This is NOT a real sign-in
      // event, so we must not re-trigger loading state or refetch the profile
      // here — doing so causes `loading` to flip back to true every time the
      // user switches tabs, which unmounts anything gated on it (e.g. modals).
      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      loadProfile(s.user.id);
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(userId: string) {
    // Already have this exact user's profile loaded — skip the redundant
    // setLoading(true)/refetch cycle entirely.
    if (loadedProfileId.current === userId) return;

    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, role, full_name, client_id')
      .eq('id', userId)
      .single();
    setProfile((data as Profile) ?? null);
    loadedProfileId.current = userId;
    setLoading(false);
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    loadedProfileId.current = null;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/set-password`,
    });
    return { error: error?.message ?? null };
  };

  return (
    <AuthCtx.Provider value={{ session, profile, loading, signIn, signOut, resetPassword }}>
      {children}
    </AuthCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
