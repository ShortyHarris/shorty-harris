# Loading Screen Spec

How the full-screen branded loading screen (wordmark + small spinner) works in this project: what it looks like, every situation that triggers it, and how to drop the same thing into another React project.

Source files:

- `src/App.tsx`: the `Spinner` component, the route guards that show it, and the root `<Suspense>` that shows it
- `src/auth/AuthProvider.tsx`: the `loading` flag that drives it
- `src/main.tsx`: provider order
- `index.html`: loads the Plus Jakarta Sans font the wordmark uses

---

## 1. What it looks like

A fixed, full-viewport screen covering everything, with the content centered:

```
        SHORTY          <- small, spaced-out, uppercase, brand green
        Harris          <- big, heavy, tight wordmark
                        <- 28px gap
          ◜             <- 18px ring spinner, one green arc rotating
```

| Part | Value |
|---|---|
| Container | `position: fixed; inset: 0`, flex column, centered on both axes |
| Background | `#f5f2ec` (warm off-white) |
| Font | `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif` |
| Wordmark stack | flex column, centered, `gap: 3px` |
| Top line ("Shorty") | `font-size: 10.5px; font-weight: 700; letter-spacing: 0.26em; text-transform: uppercase; color: #3c7a5b` |
| Main line ("Harris") | `font-size: 40px; font-weight: 800; letter-spacing: -0.045em; line-height: 1; color: #20211c` |
| Spinner | `18 x 18px`, `border-radius: 50%`, `border: 2px solid #ddd8cb`, `border-top-color: #3c7a5b`, `margin-top: 28px` |
| Animation | `@keyframes sh-spin { to { transform: rotate(360deg); } }`, `0.7s linear infinite` |
| Fade in / out | none, it appears and disappears instantly |
| Minimum display time | none, it shows only as long as something is actually loading |
| Image logo | none, the "logo" is the typographic wordmark |

Everything is inline styles plus one inline `<style>` tag for the keyframes. There are no CSS files or Tailwind classes involved, so it renders correctly before any app stylesheet loads.

---

## 2. When it shows (triggers)

The same `<Spinner />` is rendered from three places.

### 2.1 Auth is still being checked (route guards)

Every protected route is wrapped in a guard. While `loading` from `useAuth()` is `true`, the guard renders the spinner instead of the page:

```tsx
function RequireClient({ children }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Spinner />;                                   // still checking
  if (!session || !profile) return <Navigate to="/login" replace />; // not signed in
  if (!profile.client_id) return <NoClientAccount />;                // signed in, wrong account type
  return <>{children}</>;                                            // allowed
}
```

`RequireAdmin` (redirects non-admins to `/app`) and `RequireAuth` (any signed-in user, used for `/docs`) follow the same pattern.

`loading` (in `AuthProvider`) starts as `true` and is `true` while:

1. **Initial page load / hard refresh:** `supabase.auth.getSession()` reads the stored session. With no session, `loading` goes `false` immediately. With a session, the app then fetches the user's `profiles` row (role, client_id) and only sets `loading = false` once that returns.
2. **A new sign-in:** `onAuthStateChange` fires `SIGNED_IN`, `loadProfile()` sets `loading = true`, fetches the profile, then sets it `false`.

It deliberately does **not** show again when:

- Supabase fires `TOKEN_REFRESHED` (happens whenever the tab regains focus). That event is ignored, otherwise switching tabs would flash the spinner and unmount open modals.
- The same user's profile is already loaded (`loadedProfileId` ref short-circuits the refetch).

### 2.2 Just after login / signup (the "before the dashboard" moment)

`/login` and `/signup` use a wrapper route:

```tsx
function LoginRoute() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session || !profile) return;
    if (profile.role === 'admin') navigate('/admin/approvals', { replace: true });
    else if (profile.client_id) navigate('/app', { replace: true });
    else signOut(); // profile has no role and no client: sign out, show login
  }, [loading, session, profile, navigate, signOut]);

  if (loading || (session && profile)) return <Spinner />;
  return <Login />;
}
```

So the spinner shows while the profile is loading after sign-in, **and** for the instant where the user is signed in but the redirect hasn't happened yet. The login form never flashes back into view, and signed-in users who visit `/login` get bounced to their dashboard behind the spinner.

### 2.3 Page code is still downloading (React `Suspense`)

All signed-in screens are code-split with `React.lazy`:

```tsx
const Shell     = lazy(() => import('./screens/client/Shell').then((m) => ({ default: m.Shell })));
const Dashboard = lazy(() => import('./screens/client/Dashboard').then((m) => ({ default: m.Dashboard })));
// ...Login, Signup, AdminLayout, Billing, Settings, etc.
```

and the whole router is wrapped once:

```tsx
<BrowserRouter>
  <Suspense fallback={<Spinner />}>
    <AppRoutes />
  </Suspense>
</BrowserRouter>
```

The first time a lazy screen is needed, React suspends and shows the spinner until that JavaScript chunk has downloaded. Public pages (Home, Blog, legal pages) are imported normally, so they never trigger it.

There is only this one `Suspense` boundary. A lazy page nested inside the shell (e.g. first visit to `/app/billing`) suspends up to the root, so the spinner replaces the **entire** screen, including the sidebar, for that first load. Later visits are cached and instant.

### 2.4 Admin "view as client"

`ImpersonateZone` shows the spinner while it creates the read-only impersonation session (`if (!session || !clientId) return <Spinner />`).

---

## 3. Full sequence: sign in, then dashboard

1. User submits the login form, `signIn()` calls `supabase.auth.signInWithPassword`.
2. Supabase fires `SIGNED_IN`, `AuthProvider` sets `loading = true` and fetches `profiles`.
3. `LoginRoute` sees `loading`, renders **Spinner**.
4. The profile arrives and `loading = false`. `session && profile` is still truthy, so the **Spinner** stays while the effect calls `navigate('/app')`.
5. `/app` renders `RequireClient`, which passes (already loaded).
6. `ClientZone` needs the lazy `Shell` and `Dashboard` chunks, so root `Suspense` shows the **Spinner** until they download.
7. The dashboard renders. Its own data loading then uses in-page skeletons, not this screen.

On a hard refresh of `/app`: steps 2 to 7 happen from the stored session, showing the same single continuous spinner.

All of these phases render the identical component in the identical position, so the user sees one uninterrupted loading screen even though three different mechanisms are handing it off.

---

## 4. Drop-in code for another project

### 4.1 `LoadingScreen.tsx`

Copied from `Spinner` in `src/App.tsx`. Change the two words and the colors in `BRAND` for another product.

```tsx
const BRAND = {
  top: 'Shorty',       // small uppercase line
  main: 'Harris',      // big wordmark
  bg: '#f5f2ec',
  accent: '#3c7a5b',   // top line + spinner arc
  ink: '#20211c',      // big wordmark
  track: '#ddd8cb',    // spinner ring
  font: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
};

export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: BRAND.bg,
        fontFamily: BRAND.font,
      }}
    >
      <style>{`@keyframes sh-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Wordmark */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.26em',
          textTransform: 'uppercase',
          color: BRAND.accent,
        }}>
          {BRAND.top}
        </span>
        <span style={{
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: '-0.045em',
          lineHeight: 1,
          color: BRAND.ink,
        }}>
          {BRAND.main}
        </span>
      </div>

      {/* Spinner */}
      <div style={{
        marginTop: 28,
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: `2px solid ${BRAND.track}`,
        borderTopColor: BRAND.accent,
        animation: 'sh-spin 0.7s linear infinite',
      }} />
    </div>
  );
}
```

The original has no `role` / `aria-label`; they are added here as a harmless improvement. To show an image logo instead of the wordmark, replace the wordmark `<div>` with an `<img>` (keep the 28px gap to the spinner).

Font: add Plus Jakarta Sans (weights 700 and 800 at minimum) in your `index.html`, or switch `BRAND.font` to whatever your app already loads:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
```

### 4.2 Auth provider with a `loading` flag

Pattern from `src/auth/AuthProvider.tsx`, written against Supabase. With another auth library, keep the same rules: `loading` starts `true`, goes `false` once you know who the user is (including their role / profile), and is not reset on silent token refreshes.

```tsx
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface Profile { id: string; role: 'admin' | 'client'; client_id: string | null; }

const AuthCtx = createContext<{ session: Session | null; profile: Profile | null; loading: boolean } | undefined>(undefined);

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
      // Fired on tab focus; not a real sign-in. Re-showing the loader here
      // would flash it on every tab switch and unmount open modals.
      if (event === 'TOKEN_REFRESHED') return;
      loadProfile(s.user.id);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    if (loadedProfileId.current === userId) return; // already loaded
    setLoading(true);
    const { data } = await supabase.from('profiles').select('id, role, client_id').eq('id', userId).single();
    setProfile((data as Profile) ?? null);
    loadedProfileId.current = userId;
    setLoading(false);
  }

  return <AuthCtx.Provider value={{ session, profile, loading }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

### 4.3 Guards, login redirect and Suspense

```tsx
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { LoadingScreen } from './LoadingScreen';

const Login     = lazy(() => import('./screens/Login'));
const Dashboard = lazy(() => import('./screens/Dashboard'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session || !profile) return;
    navigate(profile.role === 'admin' ? '/admin' : '/app', { replace: true });
  }, [loading, session, profile, navigate]);

  // Keep the loader up until the redirect lands, so the form never flashes.
  if (loading || (session && profile)) return <LoadingScreen />;
  return <Login />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/app/*" element={<RequireAuth><Dashboard /></RequireAuth>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

And in `main.tsx`, `AuthProvider` must wrap `App` (this project's order is `ErrorBoundary > QueryClientProvider > AuthProvider > App`).

---

## 5. Behaviour notes and options

- **Why it feels seamless:** auth check, post-login redirect and chunk download all render the same fixed full-screen component, so the hand-offs are invisible.
- **No flicker guard:** on fast connections it may show for only a few milliseconds. If you want a guaranteed brief branded moment, add a minimum duration (e.g. keep it for at least 400ms after mount) in your own version. This project does not do this.
- **No fade:** it disappears instantly. For a softer exit, wrap the app content in a fade-in or use an animation library on unmount. Not present here.
- **Shell blanks on first visit to a new page:** because there is only one root `Suspense`, a lazily loaded page inside the dashboard hides the whole shell for its first load. If you want the sidebar to stay visible, add a second `<Suspense fallback={...}>` inside your layout around the routed content, with a smaller in-page loader.
- **Not used for data loading:** once a page is mounted, its data uses in-page skeletons, not this screen.
- **Reduced motion:** the project's global `@media (prefers-reduced-motion: reduce) { * { animation: none !important } }` in `index.css` stops the spinner from rotating for those users (the static ring and wordmark still show). Copy that rule too if you want the same behavior.
