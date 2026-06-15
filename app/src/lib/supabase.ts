import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

const FRIENDLY_ERROR =
  'This feature is temporarily unavailable. Please try again in a moment.';

function createStubClient(): SupabaseClient {
  if (typeof console !== 'undefined') {
    // Surface once at boot for developers; users see the friendly error above.
    console.warn(
      '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
        'Public pages will render, but any sign-in or database call will fail.',
    );
  }

  const reject = () => Promise.reject(new Error(FRIENDLY_ERROR));

  // Proxy that no-ops chains and rejects on terminal await/call.
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return undefined; // not a thenable
      if (prop === Symbol.toPrimitive) return () => '[SupabaseStub]';
      return (..._args: unknown[]) => new Proxy(() => {}, handler);
    },
    apply() {
      return new Proxy(() => {}, handler);
    },
  };

  const chain: any = new Proxy(function () {}, handler);

  const auth = {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: (_cb: unknown) => ({
      data: { subscription: { unsubscribe() {} } },
    }),
    signInWithPassword: reject,
    signInWithOAuth: reject,
    signUp: reject,
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: reject,
    updateUser: reject,
  };

  return new Proxy(
    { auth, from: () => chain, rpc: reject, storage: chain, functions: chain, channel: () => chain, removeChannel: () => {} },
    {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return chain;
      },
    },
  ) as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : createStubClient();
