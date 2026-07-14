// Edge Function: trigger-blog-deploy
// Fires a Vercel Deploy Hook after a blog post is published from the admin
// dashboard. The public blog is pre-rendered at build time (it doesn't read
// Supabase live), so a fresh deploy is what actually makes a newly-published
// post show up on the public site.
//
// The deploy hook URL is kept server-side (VERCEL_DEPLOY_HOOK_URL) rather
// than as a VITE_-prefixed env var, since anything VITE_-prefixed ends up
// baked into the public JS bundle — and anyone with the hook URL can trigger
// a rebuild.

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
  const deployHookUrl  = Deno.env.get('VERCEL_DEPLOY_HOOK_URL')

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

  // ── 2. Fire the deploy hook ───────────────────────────────────────────
  if (!deployHookUrl) {
    return json({
      error: 'VERCEL_DEPLOY_HOOK_URL is not configured',
      message: 'Set it with: supabase secrets set VERCEL_DEPLOY_HOOK_URL=...',
    }, 500)
  }

  const res = await fetch(deployHookUrl, { method: 'POST' })
  if (!res.ok) {
    return json({ error: `Deploy hook returned HTTP ${res.status}` }, 502)
  }

  return json({ success: true })
})
