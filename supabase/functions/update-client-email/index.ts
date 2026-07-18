// Edge Function: update-client-email
// Changes the Supabase Auth login email for a client's account. Must run
// server-side (service_role key never leaves this function) — only the
// service role can update another user's auth email.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!

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

  // ── 2. Parse and validate body ───────────────────────────────────────
  let body: { client_id?: string; new_email?: string }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { client_id, new_email } = body
  if (!client_id || !new_email) {
    return json({ error: 'client_id and new_email are required' }, 400)
  }

  // ── 3. Find the client's login account ───────────────────────────────
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('id')
    .eq('client_id', client_id)
    .maybeSingle()

  if (profileErr) return json({ error: profileErr.message }, 500)
  if (!profile) {
    return json({ error: 'This client has no login account yet — send an invite first.' }, 404)
  }

  // ── 4. Update the auth email — email_confirm marks it verified
  // immediately, since this is an admin-initiated change, not a self-serve
  // one that needs a confirmation click from the client's old inbox.
  const { error: updateErr } = await adminClient.auth.admin.updateUserById(profile.id, {
    email: new_email,
    email_confirm: true,
  })

  if (updateErr) {
    return json({ error: updateErr.message, message: updateErr.message }, 400)
  }

  return json({ success: true })
})
