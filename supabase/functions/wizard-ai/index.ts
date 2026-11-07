// Edge Function: wizard-ai — the Campaign Wizard's AI (docs/CAMPAIGN_WIZARD_BUILD_PLAN.md).
//
// POST { action, ... } with the signed-in client's Authorization header. Actions:
//   analyze        { url } or { name, description, area_text, best_customers }
//                  -> a business profile for screen 2 (never saved here; the app merges and autosaves)
//   ideas          { session_id } -> 1-5 campaign ideas with estimates, saved on the session
//   create_drafts  { session_id, idea_ids[] } -> writes each idea's 4 emails, then creates the drafts
//   rewrite        { campaign_id, step (0-3 or null for all), emails[], instruction? }
//                  -> rewritten emails; uses one of the campaign's free rewrites only on success
//
// Only clients with the wizard switched on (clients.wizard_enabled) may call it. Calls are
// rate-limited per client (wizard_settings.ai_calls_per_hour) and logged in wizard_ai_calls.
// Secrets: GEMINI_API_KEY (already used by docs-search). WIZARD_AI_MOCK=1 returns sample output
// without calling Gemini (local development only).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  analyzePrompt, extractJson, fallbackSequence, htmlToText, ideasPrompt, isPublicIp, isThin, mockAnalysis,
  mockIdeas, normalizeAnalysis, normalizeIdeas, normalizeSequence, normalizeWebsite, rewritePrompt,
  sequencePrompt, type Email, type Idea, type WizardAnswersLite,
} from '../_shared/wizard.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MODEL = 'gemini-2.5-flash'
const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGE_BYTES = 1_500_000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

class WizardError extends Error {
  constructor(public code: string, public status = 400) { super(code) }
}

// ── Gemini ──────────────────────────────────────────────────────────────────────────────────
async function gemini(prompt: string, apiKey: string): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    ).catch(() => null)
    if (res?.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
      try { return extractJson(text) } catch { /* retry once */ }
    }
  }
  throw new WizardError('ai_failed', 502)
}

// ── Safe website fetch ──────────────────────────────────────────────────────────────────────
async function hostIsPublic(host: string): Promise<boolean> {
  const addrs: string[] = []
  for (const type of ['A', 'AAAA'] as const) {
    try { addrs.push(...(await Deno.resolveDns(host, type))) } catch { /* no record of this type */ }
  }
  return addrs.length > 0 && addrs.every(isPublicIp)
}

async function fetchSite(url: string): Promise<string> {
  let current = url
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current)
    if (!(await hostIsPublic(u.hostname))) throw new WizardError('site_unreachable')
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'ShortyHarrisWizard/1.0 (+https://shortyharris.com)', Accept: 'text/html,text/plain' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => null)
    if (!res) throw new WizardError('site_unreachable')
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = normalizeWebsite(new URL(res.headers.get('location')!, current).toString())
      if (!next) throw new WizardError('site_unreachable')
      current = next
      continue
    }
    if (!res.ok) throw new WizardError('site_unreachable')
    const type = res.headers.get('content-type') ?? ''
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) throw new WizardError('site_unreachable')
    const reader = res.body?.getReader()
    if (!reader) throw new WizardError('site_unreachable')
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PAGE_BYTES) { await reader.cancel(); break }
      chunks.push(value)
    }
    const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
    let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.byteLength }
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  }
  throw new WizardError('site_unreachable')
}

// ── Actions ─────────────────────────────────────────────────────────────────────────────────
interface Ctx { db: SupabaseClient; clientId: string; apiKey: string; mock: boolean; body: Record<string, any> }

async function analyze({ body, apiKey, mock }: Ctx) {
  if (body.url) {
    const url = normalizeWebsite(String(body.url))
    if (!url) throw new WizardError('bad_url')
    const html = mock ? '<title>Mock</title>' + 'Sample text. '.repeat(60) : await fetchSite(url)
    const text = htmlToText(html)
    const thin = isThin(text)
    const raw = mock ? mockAnalysis({ url }) : await gemini(analyzePrompt({ url, pageText: text }), apiKey)
    return { ok: true, source: 'website', thin, profile: normalizeAnalysis(raw) }
  }
  const name = String(body.name ?? '').slice(0, 120)
  const description = String(body.description ?? '').slice(0, 1000)
  if (!name.trim() || !description.trim()) throw new WizardError('missing_description')
  const raw = mock
    ? mockAnalysis({ name, description })
    : await gemini(analyzePrompt({ name, description, areaText: String(body.area_text ?? '').slice(0, 200), bestCustomers: String(body.best_customers ?? '').slice(0, 300) }), apiKey)
  return { ok: true, source: 'description', thin: false, profile: normalizeAnalysis(raw) }
}

async function loadSession(db: SupabaseClient, clientId: string, sessionId: unknown) {
  const { data } = await db.from('wizard_sessions').select('id, client_id, answers, ideas, entry_point, status').eq('id', String(sessionId)).maybeSingle()
  if (!data || data.client_id !== clientId) throw new WizardError('not_permitted', 403)
  return data as { id: string; client_id: string; answers: WizardAnswersLite; ideas: Idea[]; entry_point: string; status: string }
}

async function ideas({ db, clientId, apiKey, mock, body }: Ctx) {
  const session = await loadSession(db, clientId, body.session_id)
  const [{ data: client }, { data: limitsRow }, { data: campaigns }] = await Promise.all([
    db.from('clients').select('max_campaigns').eq('id', clientId).single(),
    db.from('scrape_limits').select('max_search_terms, max_locations, max_term_location_pairs, max_results').eq('id', 1).maybeSingle(),
    db.from('campaigns').select('name, status').eq('client_id', clientId),
  ])
  const live = (campaigns ?? []).filter((c: { status: string }) => c.status !== 'archived')
  const slotsLeft = Math.max((client?.max_campaigns ?? 5) - live.length, 0)
  if (slotsLeft === 0) return { ok: true, ideas: [], duplicates: [], slots_left: 0, cost: null }
  const limits = {
    maxTerms: limitsRow?.max_search_terms ?? 5,
    maxLocations: limitsRow?.max_locations ?? 3,
    maxPairs: limitsRow?.max_term_location_pairs ?? 10,
    maxResults: limitsRow?.max_results ?? 500,
  }
  const today = new Date().toISOString().slice(0, 10)
  const maxIdeas = Math.min(5, slotsLeft)
  const existing = (campaigns ?? []).map((c: { name: string }) => c.name)
  const raw = mock
    ? mockIdeas(session.answers)
    : await gemini(ideasPrompt(session.answers, { existing, maxIdeas, today, maxTerms: limits.maxTerms }), apiKey)
  const { ideas: list, duplicates } = normalizeIdeas(raw, { answers: session.answers, existing, limits, maxIdeas, today })

  for (const idea of list) {
    const { data: est } = await db.rpc('estimate_prospects', {
      p_client_id: clientId, p_terms: idea.search_queries.length, p_areas: idea.target_areas.length, p_max_results: idea.max_results,
    })
    idea.est_lo = est?.lo ?? 0
    idea.est_hi = est?.hi ?? idea.max_results
  }
  const { data: cost } = await db.rpc('estimate_campaign_cost', {
    p_client_id: clientId, p_items: list.map((i) => ({ lo: i.est_lo, hi: i.est_hi })),
  })
  // Keep the user's own ideas (added on screen 3) alongside the new suggestions.
  const own = (session.ideas ?? []).filter((i) => i.fit === 'own')
  await db.from('wizard_sessions').update({ ideas: [...list, ...own] }).eq('id', session.id)
  return { ok: true, ideas: list, duplicates, slots_left: slotsLeft, cost }
}

async function createDrafts({ db, clientId, apiKey, mock, body }: Ctx) {
  const session = await loadSession(db, clientId, body.session_id)
  const ids: string[] = Array.isArray(body.idea_ids) ? body.idea_ids.map(String).slice(0, 5) : []
  const chosen = (session.ideas ?? []).filter((i) => ids.includes(i.id))
  if (chosen.length === 0) throw new WizardError('nothing_selected')

  const sequences: Record<string, Email[]> = {}
  const fallbacks: string[] = []
  await Promise.all(chosen.map(async (idea) => {
    try {
      sequences[idea.id] = mock
        ? fallbackSequence(idea, session.answers)
        : normalizeSequence(await gemini(sequencePrompt(idea, session.answers), apiKey))
    } catch {
      // The AI failed for this one: give it a plain starter sequence the client can edit.
      sequences[idea.id] = fallbackSequence(idea, session.answers)
      fallbacks.push(idea.id)
    }
  }))
  const { data, error } = await db.rpc('create_wizard_drafts', { p_session_id: session.id, p_idea_ids: ids, p_sequences: sequences })
  if (error) throw new WizardError(`drafts_failed: ${error.message}`, 500)
  return { ...(data as object), fallback_sequences: fallbacks }
}

async function rewrite({ db, clientId, apiKey, mock, body }: Ctx) {
  const { data: campaign } = await db.from('campaigns').select('id, client_id, name, language, rewrites_used').eq('id', String(body.campaign_id)).maybeSingle()
  if (!campaign || campaign.client_id !== clientId) throw new WizardError('not_permitted', 403)
  const { data: settings } = await db.from('wizard_settings').select('free_rewrites_per_campaign').eq('id', 1).single()
  const limit = settings?.free_rewrites_per_campaign ?? 3
  if (campaign.rewrites_used >= limit) return { ok: false, error: 'no_rewrites_left', left: 0, limit }

  const emails: Email[] = (Array.isArray(body.emails) ? body.emails : []).slice(0, 4)
    .map((e: any) => ({ subject: String(e?.subject ?? '').slice(0, 200), body: String(e?.body ?? '').slice(0, 3000) }))
  const step = body.step === null || body.step === undefined ? null : Number(body.step)
  if (step !== null && !(step >= 0 && step < emails.length)) throw new WizardError('bad_step')
  const target = step === null ? emails : [emails[step]]
  const out = mock
    ? target.map((e) => ({ subject: e.subject || 'Quick question', body: `${e.body}\n\n(rewritten)`.trim() }))
    : normalizeSequence(await gemini(rewritePrompt({ emails: target, step, instruction: body.instruction, campaignName: campaign.name, language: campaign.language }), apiKey), target.length)
  const { data: used } = await db.rpc('use_campaign_rewrite', { p_campaign_id: campaign.id })
  if (!used?.ok) return { ok: false, error: 'no_rewrites_left', left: 0, limit }
  return { ok: true, step, emails: out, left: used.left, limit }
}

const ACTIONS: Record<string, (c: Ctx) => Promise<unknown>> = { analyze, ideas, create_drafts: createDrafts, rewrite }

// ── Entry point ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const mock = Deno.env.get('WIZARD_AI_MOCK') === '1'
  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (!apiKey && !mock) return json({ ok: false, error: 'ai_not_configured' }, 500)

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'unauthorized' }, 401)
  const caller = createClient(supabaseUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: profile } = await db.from('profiles').select('role, client_id').eq('id', user.id).maybeSingle()
  const clientId = profile?.client_id as string | undefined
  if (!clientId) return json({ ok: false, error: 'not_a_client' }, 403)
  const { data: client } = await db.from('clients').select('wizard_enabled').eq('id', clientId).single()
  if (!client?.wizard_enabled) return json({ ok: false, error: 'wizard_not_enabled' }, 403)

  let body: Record<string, any>
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad_json' }, 400) }
  const action = String(body.action ?? '')
  const handler = ACTIONS[action]
  if (!handler) return json({ ok: false, error: 'unknown_action' }, 400)

  const { data: settings } = await db.from('wizard_settings').select('ai_calls_per_hour').eq('id', 1).single()
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db.from('wizard_ai_calls').select('id', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', since)
  if ((count ?? 0) >= (settings?.ai_calls_per_hour ?? 30)) return json({ ok: false, error: 'rate_limited' }, 429)

  const started = Date.now()
  try {
    const result = await handler({ db, clientId, apiKey, mock, body })
    await db.from('wizard_ai_calls').insert({ client_id: clientId, action, ok: true, duration_ms: Date.now() - started })
    return json(result)
  } catch (e) {
    const code = e instanceof WizardError ? e.code : 'internal_error'
    const status = e instanceof WizardError ? e.status : 500
    await db.from('wizard_ai_calls').insert({ client_id: clientId, action, ok: false, error: code.slice(0, 200), duration_ms: Date.now() - started })
    return json({ ok: false, error: code }, status === 400 && code === 'site_unreachable' ? 200 : status)
  }
})
