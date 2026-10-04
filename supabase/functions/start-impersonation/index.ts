// Edge Function: start-impersonation
// Admin-only. Mints a short-lived, read-only "View as client" JWT for the
// given client_id and logs the start in audit_logs. The minted token
// carries the ADMIN's own `sub` (so audit/debugging always traces back to
// the real actor) plus two custom claims { client_id, impersonating: true }
// that a migration (impersonation_rls.sql) teaches Postgres to recognise:
// is_admin() returns false while the claim is set, and a dedicated
// SELECT-only RLS policy per table scopes reads to that client_id. No
// write policy exists for the claim anywhere, so this token cannot write
// no matter what the frontend does with it.
//
// REQUIRES an `IMPERSONATION_JWT_SECRET` secret to be set on this project
// (Dashboard -> Edge Functions -> Manage secrets). This is the project's
// JWT signing secret (Dashboard -> Project Settings -> API -> JWT Settings)
// -- can't be named with a SUPABASE_ prefix (the dashboard reserves that
// for its own auto-injected vars), so it has to be added once by hand
// under this name before this function will work.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SignJWT } from 'https://esm.sh/jose@5'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const IMPERSONATION_TTL_SECONDS = 15 * 60

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
  const jwtSecret      = Deno.env.get('IMPERSONATION_JWT_SECRET')

  if (!jwtSecret) {
    return json({
      error: 'IMPERSONATION_JWT_SECRET is not set on this project. Add it under Edge Functions -> Manage secrets (copy the value from Project Settings -> API -> JWT Settings) before impersonation can work.',
    }, 500)
  }

  // ── 1. Verify the caller is an authenticated admin ──────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (callerProfile?.role !== 'admin') {
    return json({ error: 'Forbidden: admin access required' }, 403)
  }

  // ── 2. Parse body, look up the target client ─────────────────────────
  let body: { client_id?: string }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const clientId = body.client_id
  if (!clientId) return json({ error: 'client_id is required' }, 400)

  const { data: targetClient, error: clientErr } = await adminClient
    .from('clients')
    .select('id, business_name')
    .eq('id', clientId)
    .single()
  if (clientErr || !targetClient) return json({ error: 'Client not found' }, 404)

  // ── 3. Mint the impersonation JWT ───────────────────────────────────
  const now = Math.floor(Date.now() / 1000)
  const secretKey = new TextEncoder().encode(jwtSecret)
  const token = await new SignJWT({
    role: 'authenticated',
    client_id: clientId,
    impersonating: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + IMPERSONATION_TTL_SECONDS)
    .setAudience('authenticated')
    .sign(secretKey)

  // ── 4. Audit log ─────────────────────────────────────────────────────
  await adminClient.from('audit_logs').insert({
    actor_id: user.id,
    actor_type: 'admin',
    action: 'impersonation_start',
    resource_type: 'clients',
    resource_id: clientId,
    new_values: { business_name: targetClient.business_name },
  })

  return json({
    token,
    expires_in: IMPERSONATION_TTL_SECONDS,
    client_id: clientId,
    business_name: targetClient.business_name,
  })
})
