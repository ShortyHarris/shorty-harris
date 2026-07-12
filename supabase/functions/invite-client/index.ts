// Edge Function: invite-client
// Sends a Supabase Auth invite email and creates/upserts the profiles row.
// Must run server-side (service_role key never leaves this function).
//
// ⚠ SMTP NOTE: inviteUserByEmail sends via Supabase's built-in email service
// by default. On the free tier this caps at ~2 emails/hour and uses shared IPs
// that commonly go to spam. For reliable delivery configure a custom SMTP
// provider: Supabase dashboard → Authentication → Settings → SMTP.

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

  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey         = Deno.env.get('SUPABASE_ANON_KEY')!

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
  let body: { email?: string; client_id?: string; full_name?: string; redirect_to?: string }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { email, client_id, full_name, redirect_to } = body
  if (!email || !client_id) {
    return json({ error: 'email and client_id are required' }, 400)
  }

  // ── 3. Send invite via Auth Admin API ────────────────────────────────
  const { data: inviteData, error: inviteErr } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: full_name ?? null, client_id },
      redirectTo: redirect_to,
    })

  if (inviteErr) {
    const msg = inviteErr.message.toLowerCase()
    const alreadyRegistered =
      msg.includes('already been registered') ||
      msg.includes('user already registered') ||
      msg.includes('email address has already been registered')

    if (!alreadyRegistered) {
      return json({ error: inviteErr.message, message: inviteErr.message }, 400)
    }

    // inviteUserByEmail only works once per email — Supabase creates the
    // auth user on the first call, so every subsequent "resend" click hits
    // this branch even if the client never opened the original email and
    // never set a password. We need to tell those two cases apart instead
    // of always reporting "already active":
    //   - already signed in at least once  -> genuinely active, nothing to resend
    //   - never signed in                  -> still mid-setup, send a fresh
    //                                          password-set link via the
    //                                          recovery flow (works for any
    //                                          existing user regardless of
    //                                          confirmation state)
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('client_id', client_id)
      .maybeSingle()

    let lastSignInAt: string | null = null
    if (existingProfile) {
      const { data: existingUser } = await adminClient.auth.admin.getUserById(existingProfile.id)
      lastSignInAt = existingUser?.user?.last_sign_in_at ?? null
    }

    if (lastSignInAt) {
      // Persist the discovery onto the profiles row (readable by the admin
      // frontend via normal RLS) so the invite button can be pre-disabled on
      // future page loads instead of only finding out after another wasted click.
      await adminClient
        .from('profiles')
        .update({ activated_at: lastSignInAt })
        .eq('id', existingProfile.id)

      return json({
        error: 'user_already_active',
        message: 'This email already has an active Shorty Harris account. The client can log in directly.',
      }, 409)
    }

    // Not yet activated — resend a working link instead of dead-ending.
    const { error: resendErr } = await adminClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirect_to,
    })
    if (resendErr) {
      return json({ error: resendErr.message, message: resendErr.message }, 400)
    }

    return json({ success: true, resent: true })
  }

  const userId = inviteData.user.id

  // ── 4. Upsert profiles row ────────────────────────────────────────────
  // Safe to call on resend — onConflict:'id' makes it a no-op if the row exists.
  const { error: profileErr } = await adminClient
    .from('profiles')
    .upsert(
      { id: userId, client_id, full_name: full_name ?? null, role: 'client' },
      { onConflict: 'id' },
    )

  if (profileErr) {
    return json({
      error: `Invite sent but profile row failed to create: ${profileErr.message}`,
      partial: true,
      user_id: userId,
    }, 500)
  }

  return json({ success: true, user_id: userId })
})
