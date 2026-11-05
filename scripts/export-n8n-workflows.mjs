#!/usr/bin/env node
// Exports every n8n workflow into n8n/<name>.json so workflow changes are reviewed and
// versioned in git like code. Secrets are redacted before anything is written.
//
//   N8N_API_KEY=... node scripts/export-n8n-workflows.mjs
//
// Create the API key in n8n: Settings -> n8n API -> Create an API key. Optional:
// N8N_BASE_URL (default https://n8n.shortyharris.com). Needs Node 18+ (built-in fetch).
// Review the diff before committing: the redaction patterns cover the secret formats
// this project uses, but a new kind of secret would need a new pattern below.

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = (process.env.N8N_BASE_URL || 'https://n8n.shortyharris.com').replace(/\/$/, '');
const KEY = process.env.N8N_API_KEY;
const OUT = join(process.cwd(), 'n8n');

if (!KEY) {
  console.error('Set N8N_API_KEY (n8n: Settings -> n8n API).');
  process.exit(1);
}

// Values that must never reach git. Supabase publishable keys (sb_publishable_...) are
// public by design and are left alone.
const SECRET_PATTERNS = [
  [/whsec_[A-Za-z0-9]+/g, 'whsec_REDACTED'],                      // Stripe webhook signing secrets
  [/\b(sk|rk)_(live|test)_[A-Za-z0-9]+/g, '$1_$2_REDACTED'],       // Stripe secret / restricted keys
  [/sb_secret_[A-Za-z0-9_-]+/g, 'sb_secret_REDACTED'],            // Supabase secret keys
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'JWT_REDACTED'], // service-role JWTs etc.
  [/ya29\.[A-Za-z0-9._-]+/g, 'GOOGLE_ACCESS_TOKEN_REDACTED'],      // Google OAuth access tokens
  [/\b1\/\/0[A-Za-z0-9_-]{20,}/g, 'GOOGLE_REFRESH_TOKEN_REDACTED'], // Google OAuth refresh tokens
  [/AIza[0-9A-Za-z_-]{35}/g, 'GOOGLE_API_KEY_REDACTED'],           // Google API keys
  [/\bAC[0-9a-f]{32}\b/g, 'TWILIO_ACCOUNT_SID_REDACTED'],          // Twilio account SIDs
  [/apify_api_[A-Za-z0-9]+/g, 'apify_api_REDACTED'],               // Apify tokens
];

function redact(text) {
  let out = text;
  let hits = 0;
  for (const [re, rep] of SECRET_PATTERNS) {
    out = out.replace(re, () => { hits++; return rep; });
    re.lastIndex = 0;
  }
  return { out, hits };
}

async function api(path) {
  const res = await fetch(`${BASE}/api/v1${path}`, { headers: { 'X-N8N-API-KEY': KEY, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

const list = [];
let cursor;
do {
  const page = await api(`/workflows?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
  list.push(...page.data);
  cursor = page.nextCursor;
} while (cursor);

await mkdir(OUT, { recursive: true });
// Start clean so deleted workflows disappear from the export too.
for (const f of await readdir(OUT)) if (f.endsWith('.json')) await rm(join(OUT, f));

let total = 0;
for (const w of list) {
  const full = await api(`/workflows/${w.id}`);
  // Keep what defines behaviour; drop run-time noise that changes on every save.
  const { id, name, active, nodes, connections, settings, tags } = full;
  const doc = { id, name, active, settings, tags: (tags || []).map((t) => t.name ?? t), nodes, connections };
  const { out, hits } = redact(JSON.stringify(doc, null, 2) + '\n');
  total += hits;
  await writeFile(join(OUT, `${slug(name)}.json`), out);
  console.log(`${name}${hits ? `  (${hits} secret${hits === 1 ? '' : 's'} redacted)` : ''}`);
}
console.log(`\nExported ${list.length} workflows to n8n/, ${total} secret value${total === 1 ? '' : 's'} redacted.`);
console.log('Review the diff before committing.');
