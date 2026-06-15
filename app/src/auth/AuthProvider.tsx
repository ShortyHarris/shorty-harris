import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

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
  (import.meta.env.VITE_DEMO_CLIENT_ID as string | undefined) ?? '11111111-1111-1111-1111-111111111111';

const STORAGE_KEY = 'sh-fake-auth';

function makeFakeSession(email: string): { session: Session; profile: Profile } {
  const isAdmin = /admin/i.test(email);
  const id = `fake-${email.toLowerCase()}`;
  const session = {
    access_token: 'fake',
    refresh_token: 'fake',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id,
      email,
      app_metadata: {},
      user_metadata: { full_name: email.split('@')[0] },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
  } as unknown as Session;
  const profile: Profile = {
    id,
    role: isAdmin ? 'admin' : 'client',
    full_name: email.split('@')[0],
    client_id: isAdmin ? null : DEMO_CLIENT_ID,
  };
  return { session, profile };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { email } = JSON.parse(raw) as { email: string };
        const fake = makeFakeSession(email);
        setSession(fake.session);
        setProfile(fake.profile);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, _password: string) => {
    if (!email.trim()) return { error: 'Please enter an email.' };
    const fake = makeFakeSession(email.trim());
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: email.trim() }));
    setSession(fake.session);
    setProfile(fake.profile);
    return { error: null };
  };

  const signUp = async (email: string, _password: string, fullName: string) => {
    if (!email.trim()) return { error: 'Please enter an email.', needsConfirm: false };
    const fake = makeFakeSession(email.trim());
    if (fullName.trim()) fake.profile.full_name = fullName.trim();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: email.trim() }));
    setSession(fake.session);
    setProfile(fake.profile);
    return { error: null, needsConfirm: false };
  };

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
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
