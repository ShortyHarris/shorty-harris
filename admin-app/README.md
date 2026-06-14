# Shorty Harris — Admin Console

Internal dashboard for the Shorty Harris MVP. Now gated behind Supabase Auth.

## Run locally
```bash
npm install
npm run dev
```

## Login
You must sign in with an ADMIN account. Created during setup:
- Email: marcus@gmail.com  (the password you set in the Supabase dashboard)

Only users whose profile role = 'admin' can access this console. Client accounts
are rejected with a message pointing them to the client dashboard.

## Screens
- Approvals — review/edit/approve/reject AI drafts (approving triggers the send pipeline)
- Prospects — full pipeline table with search + status/category filters
- Campaigns — per-client campaigns with live prospect counts
- Hot leads — all qualified opportunities across every client
- Monitoring — error logs, mark-as-resolved

## Env (.env, prefilled)
VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — anon key is browser-safe; RLS enforces access.
