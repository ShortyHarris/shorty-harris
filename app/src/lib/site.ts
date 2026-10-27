// Single public origin for canonical URLs, og:url, JSON-LD and the sitemap.
// Production serves www; apex 301s to it (see ../vercel.json). Override with
// VITE_SITE_URL (no trailing slash) only for a different production host.
// (The cast keeps this importable from scripts/, which has no vite/client types.)
const envUrl = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SITE_URL;
export const SITE_URL = (envUrl || 'https://www.shortyharris.com').replace(/\/+$/, '');

// Canonical form of a site path: no query/hash, lowercase, no trailing slash
// except the homepage "/".
export function canonicalUrl(path: string): string {
  const clean = path.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '');
  return `${SITE_URL}${clean.startsWith('/') ? clean : `/${clean}`}`.replace(/^(https?:\/\/[^/]+)$/, '$1/');
}
