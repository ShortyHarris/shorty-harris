import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

const DEMO_CLIENT_ID =
  (import.meta.env.VITE_DEMO_CLIENT_ID as string | undefined) ?? null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user);
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadProfile(s.user);
      else { setProfile(null); setLoading(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, role, full_name, client_id')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        setProfile(data as Profile);
      } else {
        // Fallback so routing isn't stuck when no profile row exists yet.
        setProfile({
          id: user.id,
          role: 'client',
          full_name: (user.user_metadata?.full_name as string) ?? user.email ?? null,
          client_id: DEMO_CLIENT_ID,
        });
      }
    } catch {
      setProfile({
        id: user.id,
        role: 'client',
        full_name: (user.user_metadata?.full_name as string) ?? user.email ?? null,
        client_id: DEMO_CLIENT_ID,
      });
    } finally {
      setLoading(false);
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) return { error: error.message, needsConfirm: false };
    const needsConfirm = !data.session;
    return { error: null, needsConfirm };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthCtx.Provider value={{ session, profile, loading, signIn, signUp, signOut }}>
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
