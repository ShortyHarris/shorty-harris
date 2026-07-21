// Edge Function: docs-search
// Embeds the user's question, retrieves the top matching docs_embeddings
// chunks (audience-scoped to the caller's role via match_docs_chunks — a
// client's query can never surface 'internal'/'admin'-only content), then
// streams a grounded answer from Gemini. Any authenticated user may call
// this (client or admin) — the audience scoping is what keeps it safe.
//
// Response protocol: the answer streams as raw text chunks, followed by the
// literal delimiter "\n\n---SOURCES---\n" and a trailing JSON array of the
// source articles used, e.g. [{"slug":"...","title":"..."}]. The frontend
// splits on that delimiter as chunks arrive.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SOURCES_DELIM = '\n\n---SOURCES---\n'
const EMBED_MODEL = 'text-embedding-004'
const CHAT_MODEL = 'gemini-2.0-flash'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function embedQuestion(question: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: question }] },
      }),
    },
  )
  if (!res.ok) throw new Error(`Embedding request failed (HTTP ${res.status})`)
  const data = await res.json()
  return data.embedding.values as number[]
}

const SYSTEM_PROMPT = `Answer the user's question using only the provided documentation excerpts. If the excerpts don't cover it, say you're not sure and suggest which doc category might help. Keep answers concise (a few sentences to a short paragraph). Do not mention "excerpts" or "context" explicitly — just answer naturally. Do not fabricate anything not present in the excerpts.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
  const geminiApiKey   = Deno.env.get('GEMINI_API_KEY')

  // ── 1. Any authenticated user (client or admin) ──────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  if (!geminiApiKey) return json({ error: 'GEMINI_API_KEY secret is not configured' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = callerProfile?.role === 'admin'

  // ── 2. Parse body ─────────────────────────────────────────────────────
  let body: { question?: string }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const question = (body.question ?? '').trim()
  if (!question) return json({ error: 'question is required' }, 400)

  // ── 3. Embed + retrieve, scoped to the caller's role ─────────────────────
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedQuestion(question, geminiApiKey)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Embedding failed' }, 502)
  }

  const { data: matches, error: matchErr } = await admin.rpc('match_docs_chunks', {
    query_embedding: queryEmbedding,
    caller_is_admin: isAdmin,
    match_count: 5,
  })
  if (matchErr) return json({ error: matchErr.message }, 500)

  const chunks = (matches ?? []) as { chunk_text: string; article_title: string; article_slug: string; similarity: number }[]

  const encoder = new TextEncoder()

  // No relevant (audience-permitted) content at all — say so plainly rather
  // than letting the model improvise or hint at what was filtered out.
  if (chunks.length === 0) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("I couldn't find anything on that in the docs. Try browsing the sidebar categories, or rephrase your question."))
        controller.enqueue(encoder.encode(`${SOURCES_DELIM}[]`))
        controller.close()
      },
    })
    return new Response(stream, { headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  const sourcesSeen = new Map<string, string>() // slug -> title
  for (const c of chunks) sourcesSeen.set(c.article_slug, c.article_title)
  const sources = Array.from(sourcesSeen.entries()).map(([slug, title]) => ({ slug, title }))

  const contextBlock = chunks
    .map((c, i) => `[Excerpt ${i + 1} — from "${c.article_title}"]\n${c.chunk_text}`)
    .join('\n\n')

  // ── 4. Stream the answer from Gemini, then append the sources JSON ───────
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:streamGenerateContent?alt=sse&key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [{ text: `Documentation excerpts:\n\n${contextBlock}\n\nQuestion: ${question}` }],
        }],
      }),
    },
  )

  if (!geminiRes.ok || !geminiRes.body) {
    const detail = await geminiRes.text().catch(() => '')
    return json({ error: `Answer generation failed (HTTP ${geminiRes.status}): ${detail}` }, 502)
  }

  const upstreamReader = geminiRes.body.getReader()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = ''
      try {
        for (;;) {
          const { done, value } = await upstreamReader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const evt of events) {
            const line = evt.trim()
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            try {
              const parsed = JSON.parse(payload)
              const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
              if (typeof text === 'string') controller.enqueue(encoder.encode(text))
            } catch {
              // partial/incomplete JSON line — skip, next chunk will complete it
            }
          }
        }
      } finally {
        controller.enqueue(encoder.encode(`${SOURCES_DELIM}${JSON.stringify(sources)}`))
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } })
})
