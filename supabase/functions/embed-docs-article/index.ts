// Edge Function: embed-docs-article
// Chunks a docs_articles row's body_md and (re-)embeds it into docs_embeddings
// via Gemini's text-embedding-004 model (768 dims).
//
// Callable two ways:
//   - by an authenticated admin (the frontend calls this right after a save
//     succeeds in the docs editor, and from the "Re-embed all" bulk action)
//   - by the service role key directly, for any future server-side/script use
//
// Requires a GEMINI_API_KEY secret to be configured on this project.

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

const WORDS_PER_CHUNK_TARGET = 320 // ~300-500 tokens at ~1.3 tokens/word

// Split on ## / ### section boundaries first (natural semantic units for a
// help-center article); any section still too long gets further split by
// paragraph so no single chunk balloons past the target size.
function chunkMarkdown(md: string): string[] {
  const sections = md.split(/\n(?=#{2,3}\s)/g).map((s) => s.trim()).filter(Boolean)
  const base = sections.length > 0 ? sections : [md.trim()]

  const chunks: string[] = []
  for (const section of base) {
    const words = section.split(/\s+/)
    if (words.length <= WORDS_PER_CHUNK_TARGET * 1.5) {
      chunks.push(section)
      continue
    }
    const paragraphs = section.split(/\n\s*\n/)
    let buffer = ''
    for (const p of paragraphs) {
      const candidate = buffer ? `${buffer}\n\n${p}` : p
      if (candidate.split(/\s+/).length > WORDS_PER_CHUNK_TARGET && buffer) {
        chunks.push(buffer)
        buffer = p
      } else {
        buffer = candidate
      }
    }
    if (buffer) chunks.push(buffer)
  }
  return chunks.filter((c) => c.length > 0)
}

async function embedChunks(chunks: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: chunks.map((text) => ({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] },
        })),
      }),
    },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini embedding request failed (HTTP ${res.status}): ${detail}`)
  }
  const data = await res.json()
  return (data.embeddings ?? []).map((e: { values: number[] }) => e.values)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
  const geminiApiKey   = Deno.env.get('GEMINI_API_KEY')

  // ── Auth: service role key, or an authenticated admin ───────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (token !== serviceRoleKey) {
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (callerProfile?.role !== 'admin') return json({ error: 'Forbidden: admin access required' }, 403)
  }

  if (!geminiApiKey) return json({ error: 'GEMINI_API_KEY secret is not configured' }, 500)

  let body: { article_id?: string }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { article_id } = body
  if (!article_id) return json({ error: 'article_id is required' }, 400)

  const { data: article, error: articleErr } = await admin
    .from('docs_articles')
    .select('id, body_md')
    .eq('id', article_id)
    .single()

  if (articleErr || !article) return json({ error: articleErr?.message ?? 'Article not found' }, 404)

  const chunks = chunkMarkdown(article.body_md ?? '')
  if (chunks.length === 0) {
    // Nothing to embed (empty body) — clear any stale chunks and stop.
    await admin.from('docs_embeddings').delete().eq('article_id', article_id)
    return json({ success: true, chunks: 0 })
  }

  let embeddings: number[][]
  try {
    embeddings = await embedChunks(chunks, geminiApiKey)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Embedding failed' }, 502)
  }

  if (embeddings.length !== chunks.length) {
    return json({ error: 'Embedding count mismatch from Gemini response' }, 502)
  }

  // Replace this article's chunks wholesale — simplest way to stay correct
  // across edits that add, remove, or reorder sections.
  await admin.from('docs_embeddings').delete().eq('article_id', article_id)

  const rows = chunks.map((chunk_text, i) => ({
    article_id,
    chunk_index: i,
    chunk_text,
    embedding: embeddings[i],
  }))

  const { error: insertErr } = await admin.from('docs_embeddings').insert(rows)
  if (insertErr) return json({ error: insertErr.message }, 500)

  return json({ success: true, chunks: rows.length })
})
