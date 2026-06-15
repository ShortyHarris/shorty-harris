## What's broken

1. **No env file** — `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` aren't loaded, so the client is the no-op stub and every sign-in throws *"This feature is temporarily unavailable."* Nothing can route because nothing can sign in.
2. **Post-login redirect can stall** — `LoginRoute` waits on `profile` to decide where to navigate. If a user authenticates but has no row in `public.profiles` (very likely for a brand-new sign-up), `loadProfile` returns `null`, `loading` flips to `false`, but `session && !profile` falls through none of the branches → user sits on `/login` forever.
3. **"Request access" mailto** — should be an in-app **Sign up** action.
4. **Buttons** are flat charcoal — user wants a clean dark glassmorphism style.

## Changes

### 1. `app/.env` (new)
Write the four vars the user pasted:
```
VITE_SUPABASE_URL=https://lxoeotyibsalbxgbjfxo.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_CdK80AB1j_99hPPZGGS_jA_XYsNzrUs
VITE_DEMO_CLIENT_ID=11111111-1111-1111-1111-111111111111
VITE_CHECKOUT_WEBHOOK_URL=https://shortyharris.app.n8n.cloud/webhook/wf7-create-checkout
```
Then restart the dev server so Vite picks them up.

### 2. `app/src/auth/AuthProvider.tsx`
- Add `signUp(email, password, fullName)` → `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`.
- In `loadProfile`, when no profile row exists, **don't leave `profile = null` forever** — set a sentinel `{ id: userId, role: 'client', full_name: null, client_id: import.meta.env.VITE_DEMO_CLIENT_ID ?? null }` so the router has something to act on. (Real role/client_id will come from the DB once an admin links them; until then the demo client id keeps the dashboard usable, matching the existing `VITE_DEMO_CLIENT_ID` convention.)
- Expose `signUp` from context.

### 3. `app/src/App.tsx` — `LoginRoute`
- Replace the "neither admin nor client_id → signOut" branch with: render Login with a friendly "Your account isn't linked yet" banner instead of silently signing out (prevents the bounce loop people hit when their profile row is partial).
- Keep the existing admin → `/admin/approvals`, client → `/app` redirects.

### 4. `app/src/screens/Login.tsx`
- Toggle between **Sign in** and **Sign up** modes (single component, `mode` state).
- Sign-up form: full name + email + password, calls `signUp`, then shows "Check your inbox to confirm" OR auto-signs-in if confirmation is off.
- Replace the `mailto:` "Request access" with a button that flips to sign-up mode. Add a "Already have an account? Sign in" link in sign-up mode.

### 5. `app/src/screens/Login.css`
Dark glassmorphism for `.auth-btn` and the password toggle:
- `background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02))`
- `backdrop-filter: blur(14px) saturate(140%)`
- `border: 1px solid rgba(255,255,255,.14)`
- `box-shadow: 0 1px 0 rgba(255,255,255,.08) inset, 0 10px 30px -12px rgba(0,0,0,.55)`
- Hover: lift + brighter inner highlight. Active: press-in shadow. Disabled: 55% opacity, no hover.
- Same treatment (slightly smaller) for the eye toggle and the new "Sign up" / "Sign in" switch button.

## Out of scope
- Creating a `profiles` table / RLS / trigger (Cloud isn't enabled here — user supplied their own Supabase). If sign-up doesn't auto-create a profile row in their project, the dashboard falls back to the demo `client_id` so routing still works; we can wire a real profile trigger next once you confirm the schema.
