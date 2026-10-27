/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

interface Redirect { source: string; destination: string; has?: unknown }
interface VercelConfig { redirects: Redirect[]; rewrites: unknown[] }
const load = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as VercelConfig;
const root = load('../../../vercel.json');
const app = load('../../vercel.json');

describe('vercel.json bare-slug redirect', () => {
  const rule = root.redirects.find((r) => r.destination === '/blog/:slug' && r.source.startsWith('/:slug('))!;
  // Param pattern is everything between "/:slug(" and the final ")".
  const re = new RegExp(`^${rule.source.slice('/:slug('.length, -1)}$`);

  it('redirects hyphenated post slugs', () => {
    for (const s of ['attracting-talent-small-town-businesses', 'family-business-transition-planning']) {
      expect(re.test(s)).toBe(true);
    }
  });

  it('never redirects real top-level routes', () => {
    for (const s of ['pricing', 'blog', 'login', 'signup', 'app', 'admin', 'privacy', 'terms', 'cookies',
      'gmail-data-use', 'home', 'forgot-password', 'auth', 'unsubscribe']) {
      expect(re.test(s)).toBe(false);
    }
  });

  it('keeps app/vercel.json in step with the root file (Root Directory is unconfirmed)', () => {
    expect(app.redirects).toEqual(root.redirects);
    expect(app.rewrites).toEqual(root.rewrites);
  });

  it('apex rule matches only the apex host', () => {
    const apex = root.redirects[0];
    expect(apex.has).toEqual([{ type: 'host', value: 'shortyharris.com' }]);
    expect(apex.destination.startsWith('https://www.shortyharris.com/')).toBe(true);
  });
});
