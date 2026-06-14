# Deployment

How to stand the system up from scratch, or deploy the current build.

## 1. Database (Supabase)

1. Create a Supabase project.
2. Open the SQL Editor and run `shorty-harris-schema-and-seed.sql` top to bottom. This creates all 24 tables, RLS policies, functions, triggers, and seed data.
3. From Project Settings → API, copy:
   - the **Project URL**
   - the **publishable (anon) key** — browser-safe, used by both frontends
   - the **service_role key** — secret, used only by n8n (never in frontend code)

### Auth users
Create users in Authentication → Users (Auto Confirm on). A trigger auto-creates their `profiles` row. Then set roles via SQL:
```sql
-- make an admin
update profiles set role='admin', client_id=null
where id = (select id from auth.users where email='you@example.com');

-- link a client login to a client business
update profiles set role='client', client_id='<client uuid>'
where id = (select id from auth.users where email='client@example.com');
```

## 2. Automation (n8n)

1. In n8n, create credentials:
   - **Supabase API** — project URL + service_role key.
   - **Google Gemini (PaLM) API** — Gemini API key.
   - **Gmail OAuth2** — connect a sandbox Gmail test account.
2. Import the 7 workflows (WF1, WF2, WF2.5, WF3, WF4, WF5, WF6).
3. Confirm each Supabase node points at the new project's credential, and the Gemini/Gmail nodes use the right credentials.
4. The pre-send gate HTTP node in WF3 calls `/rest/v1/rpc/presend_gate` — update its URL + key to the new project.
5. Activate all 7 workflows.

## 3. Frontends (Vercel)

Each app is a Vite + React build.

```bash
npm install
npm run build   # outputs to dist/
```

Deploy `admin-app` and `client-app` as two Vercel projects. Set env vars on each:
```
VITE_SUPABASE_URL=<project url>
VITE_SUPABASE_ANON_KEY=<publishable key>
```

Recommended hosting: two subdomains, e.g. `app.<domain>` (admin) and `my.<domain>` (clients). They can also be one app with role-based routing if preferred — both read the same backend.

## 4. Post-deploy checks

- Log in as admin → Approvals loads.
- Log in as a client → only that client's hot leads show (verify RLS isolation by checking a second client can't see the first's data).
- Approve a message → within a minute WF2.5 → WF3 sends it (to a sandbox address).
- Confirm the pre-send gate blocks a paused campaign.

## Environment / secrets summary

| Secret | Where it lives | Notes |
|---|---|---|
| Publishable (anon) key | Frontend `.env`, WF3 gate node | Browser-safe; RLS protects data |
| service_role key | n8n Supabase credential only | Never in frontend |
| Gemini API key | n8n credential | — |
| Gmail OAuth | n8n credential | Sandbox test account |
| DB password | Your records | Set at project creation |
