// Edge Function: delete-client-auth
// Deletes one or more Supabase auth users (and their profiles rows, via cascade).
// Called by the admin frontend when deleting a client that has an associated auth account.
// Requires service_role key — never expose this to the browser.

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
  let body: { user_ids?: string[] }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { user_ids } = body
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return json({ error: 'user_ids must be a non-empty array' }, 400)
  }

  // ── 3. Delete each auth user ─────────────────────────────────────────
  // Deleting from auth.users cascades to profiles (via FK profiles.id → auth.users.id).
  const errors: { user_id: string; message: string }[] = []

  for (const userId of user_ids) {
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteErr) {
      // "User not found" is acceptable — may have been deleted already
      if (!deleteErr.message.toLowerCase().includes('not found')) {
        errors.push({ user_id: userId, message: deleteErr.message })
      }
    }
  }

  if (errors.length > 0) {
    return json({ error: 'Some users could not be deleted', details: errors }, 500)
  }

  return json({ success: true, deleted: user_ids.length })
})
