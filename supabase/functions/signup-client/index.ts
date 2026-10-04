// Edge Function: signup-client
// Public, unauthenticated self-serve signup. Creates a `clients` row, a
// starting `billing_profiles` grant, and a default campaign — the same
// three inserts the admin "New client" flow makes (see createClient() in
// useAdminData.ts) — then creates the auth user last, with client_id
// already in its metadata.
//
// Order matters here: the project has a live trigger (on_auth_user_created
// -> handle_new_user()) that auto-inserts a `profiles` row the instant a
// row lands in auth.users, reading client_id out of raw_user_meta_data. So
// the auth user must be created LAST, once we already know the client's
// id — that lets the trigger create the correctly-linked profiles row by
// itself. Creating the auth user first (and then inserting into `profiles`
// ourselves, as this function originally did) collides with that trigger's
// own insert on every single call, not just on a race — invite-client works
// around the same trigger with an upsert; this flow avoids it entirely by
// never touching `profiles` directly.
//
// Must run server-side (service_role key never leaves this function) and
// must be deployed with --no-verify-jwt, since there is no caller JWT to
// verify at signup time.
//
// Stripe checkout is not wired up yet (see docs/KNOWN_ISSUES.md) — every
// self-serve signup starts on a small free-trial credit grant instead of a
// paid plan. Revisit FREE_TRIAL_CREDITS once billing is connected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FREE_TRIAL_CREDITS = 2

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

  let body: { business_name?: string; contact_email?: string; contact_name?: string; password?: string }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const business_name = (body.business_name ?? '').trim()
  const contact_email = (body.contact_email ?? '').trim().toLowerCase()
  const contact_name  = (body.contact_name ?? '').trim() || null
  const password      = body.password ?? ''

  if (!business_name) return json({ error: 'Business name is required' }, 400)
  if (!contact_email || !contact_email.includes('@')) return json({ error: 'A valid email is required' }, 400)
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 1. clients row ────────────────────────────────────────────────────
  const { data: clientData, error: clientErr } = await adminClient
    .from('clients')
    .insert({
      business_name,
      contact_email,
      contact_name,
      status: 'active',
    })
    .select('id')
    .single()

  if (clientErr) return json({ error: clientErr.message }, 500)

  const clientId = (clientData as { id: string }).id

  async function rollbackClient() {
    await adminClient.from('campaigns').delete().eq('client_id', clientId)
    await adminClient.from('billing_profiles').delete().eq('client_id', clientId)
    await adminClient.from('clients').delete().eq('id', clientId)
  }

  // ── 2. billing_profiles — free trial grant, no payment ───────────────
  const { error: billingErr } = await adminClient
    .from('billing_profiles')
    .insert({ client_id: clientId, credits_remaining: FREE_TRIAL_CREDITS, sms_credits_remaining: 0 })

  if (billingErr) {
    await rollbackClient()
    return json({ error: billingErr.message }, 500)
  }

  // ── 3. Default campaign — same shape as the admin "New client" flow ──
  const { error: campaignErr } = await adminClient
    .from('campaigns')
    .insert({
      client_id: clientId,
      name: `${business_name} — Campaign 1`,
      channel: 'email',
      status: 'active',
      scrape_enabled: false,
    })

  if (campaignErr) {
    await rollbackClient()
    return json({ error: campaignErr.message }, 500)
  }

  // ── 4. Create the auth user last, client_id already in its metadata ──
  // handle_new_user() picks client_id/full_name/role straight off
  // raw_user_meta_data and inserts the profiles row itself — nothing left
  // for this function to do once the user exists.
  // email_confirm: true — this is the "fully automatic, live immediately"
  // flow, so there's no confirmation-email step blocking first login.
  const { data: userData, error: userErr } = await adminClient.auth.admin.createUser({
    email: contact_email,
    password,
    email_confirm: true,
    user_metadata: { full_name: contact_name, role: 'client', client_id: clientId },
  })

  if (userErr) {
    await rollbackClient()
    const msg = userErr.message.toLowerCase()
    if (msg.includes('already been registered') || msg.includes('already registered')) {
      return json({ error: 'An account with this email already exists. Try logging in instead.' }, 409)
    }
    return json({ error: userErr.message }, 400)
  }

  const userId = userData.user.id

  // Trigger-created profiles row has no activated_at — set it so this
  // account shows the same "active" signal an admin-invited client gets
  // once they first sign in. Not fatal if it fails: the account already
  // works without it.
  await adminClient.from('profiles').update({ activated_at: new Date().toISOString() }).eq('id', userId)

  return json({ success: true, user_id: userId, client_id: clientId })
})
