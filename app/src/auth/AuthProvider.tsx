import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { settleWithin } from '../lib/fetchWithTimeout';
import { isServerBusyError } from '../lib/approvalErrors';

// The whole bootstrap (session from storage, maybe a token refresh, then the profile row) gets one
// deadline. Past it the splash turns into an error with Try again, never an endless spinner.
export const AUTH_BOOT_TIMEOUT_MS = 20_000;

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
  /** Set when the session or profile couldn't be loaded; the app shows it with Try again. */
  bootError: string | null;
  /** Re-runs the bootstrap after bootError. */
  retry: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const loadedProfileId = useRef<string | null>(null);
  // One profile request per user at a time: getSession() and the INITIAL_SESSION event both ask.
  const profileInFlight = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  async function loadProfile(userId: string) {
    // Already have this exact user's profile loaded - skip the redundant
    // setLoading(true)/refetch cycle entirely.
    if (loadedProfileId.current === userId) return;
    if (profileInFlight.current?.userId === userId) return profileInFlight.current.promise;

    setLoading(true);
    const promise = (async () => {
      try {
        const { data, error } = await settleWithin(
          supabase.from('profiles').select('id, role, full_name, client_id').eq('id', userId).maybeSingle(),
          AUTH_BOOT_TIMEOUT_MS,
        );
        // A failed request is not "no profile": treating it as one bounced a signed-in user to
        // /login. Show it as an error the user can retry instead.
        if (error) throw new Error(error.message);
        setProfile((data as Profile | null) ?? null);
        loadedProfileId.current = userId;
        setBootError(null);
      } catch (e) {
        setBootError(bootErrorMessage(e));
      } finally {
        profileInFlight.current = null;
        setLoading(false);
      }
    })();
    profileInFlight.current = { userId, promise };
    return promise;
  }

  // Reads the stored session (supabase-js may refresh the token first), then the profile.
  // Bounded by AUTH_BOOT_TIMEOUT_MS; any failure lands in bootError.
  function boot(): Promise<void> {
    return settleWithin(supabase.auth.getSession(), AUTH_BOOT_TIMEOUT_MS).then(onSession, onBootFailure);
  }

  async function onSession({ data, error }: Awaited<ReturnType<typeof supabase.auth.getSession>>) {
    if (error) return onBootFailure(error);
    setSession(data.session);
    if (data.session) await loadProfile(data.session.user.id);
    else setLoading(false);
  }

  function onBootFailure(e: unknown) {
    setBootError(bootErrorMessage(e));
    setLoading(false);
  }

  useEffect(() => {
    boot();

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
      // here - doing so causes `loading` to flip back to true every time the
      // user switches tabs, which unmounts anything gated on it (e.g. modals).
      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      // Supabase's guidance: never call the client from inside this callback (it can run while
      // the auth client is mid-update). Defer the profile request to the next task.
      const userId = s.user.id;
      setTimeout(() => { loadProfile(userId); }, 0);
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    loadedProfileId.current = null;
    setBootError(null);
    setLoading(true);
    boot();
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Swallow failures (e.g. Navigator LockManager timeouts or a failed
      // revoke request) - we still want to clear local state below so the
      // user is signed out on this device even if the server call hung.
      console.error('Sign out request failed', err);
    } finally {
      setSession(null);
      setProfile(null);
      setBootError(null);
      setLoading(false);
      loadedProfileId.current = null;
    }
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/set-password`,
    });
    return { error: error?.message ?? null };
  };

  return (
    <AuthCtx.Provider value={{ session, profile, loading, bootError, retry, signIn, signOut, resetPassword }}>
      {children}
    </AuthCtx.Provider>
  );
}

function bootErrorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e ?? '');
  if (isServerBusyError(message) || /AbortError|aborted/i.test(message)) {
    return "The server didn't answer in time. It may be busy - try again in a moment.";
  }
  if (/Failed to fetch|Load failed|NetworkError|network connection was lost|offline/i.test(message)) {
    return "Couldn't reach the server. Check your internet connection and try again.";
  }
  return message ? `Couldn't load your account: ${message}` : "Couldn't load your account.";
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
