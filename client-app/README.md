# Shorty Harris — Client Dashboard

What a client logs into to see their qualified opportunities. Gated behind Supabase Auth.

## Run locally
```bash
npm install
npm run dev
```

## Login
Sign in with a CLIENT account. Created during setup:
- Email: kabwata@sandbox.test  (the password you set in the Supabase dashboard)
  → linked to "Kabwata Laundry Co." — the dashboard automatically scopes to that client.

The dashboard reads the logged-in user's client_id from their profile. There is no longer
a hardcoded demo client. Admin accounts (no client_id) are shown a "no client linked" notice.

## What works
- Credit balance + stats, hot lead feed, lead detail with Call/Email/WhatsApp, mark won/lost.

## Env (.env, prefilled)
VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. (VITE_DEMO_CLIENT_ID is no longer used.)
