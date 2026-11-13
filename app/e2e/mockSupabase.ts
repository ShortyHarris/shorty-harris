import type { Page, Route } from '@playwright/test';

// A small in-memory stand-in for the Supabase project, enough to run the client zone's
// Approvals screen with no network. Each test can override any endpoint to replay a failure
// (a statement timeout, a request that never answers) exactly as production showed it.

export const SUPABASE = 'https://lxoeotyibsalbxgbjfxo.supabase.co';
const STORAGE_KEY = 'sb-lxoeotyibsalbxgbjfxo-auth-token';

export const USER_ID = '3e580491-0000-4000-8000-000000000001';
export const CLIENT_ID = '40d3f053-0000-4000-8000-000000000002';
export const CAMPAIGN_ARCH = { id: 'c0000000-0000-4000-8000-000000000001', name: 'Tutel - Komerční Fit-out - Architektonická a designová studia' };
export const CAMPAIGN_SVJ = { id: 'c0000000-0000-4000-8000-000000000002', name: 'Tutel - Služby pro SVJ - Přímý kontakt SVJ' };

export interface Draft {
  id: string;
  prospect_id: string;
  campaign_id: string;
  message_type: 'initial' | 'follow_up_d3' | 'follow_up_d7' | 'follow_up_d14';
  approval_status: 'pending' | 'approved' | 'rejected';
  business_name: string;
  location: string;
}

export function draft(n: number, over: Partial<Draft>): Draft {
  return {
    id: `m0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    prospect_id: `p0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    campaign_id: CAMPAIGN_SVJ.id,
    message_type: 'follow_up_d7',
    approval_status: 'pending',
    business_name: `SVJ ${n}`,
    location: 'Praha',
    ...over,
  };
}

/** Fake but well-formed JWT: supabase-js only needs to read it, never verify it. */
function fakeJwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
}

type Handler = (route: Route, body: Record<string, unknown> | null) => Promise<void> | void;

export class MockSupabase {
  drafts: Draft[];
  /** Overrides by "METHOD path" (path without query), e.g. "PATCH /rest/v1/messages" or "POST /rest/v1/rpc/approved_queue". */
  overrides = new Map<string, Handler>();
  calls: { method: string; path: string; url: string; body: Record<string, unknown> | null }[] = [];

  constructor(drafts: Draft[]) { this.drafts = drafts; }

  override(key: string, h: Handler) { this.overrides.set(key, h); }
  clear(key: string) { this.overrides.delete(key); }
  count(key: string) { return this.calls.filter((c) => `${c.method} ${c.path}` === key).length; }

  async install(page: Page) {
    const session = {
      access_token: fakeJwt(), refresh_token: 'refresh', token_type: 'bearer',
      expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'client@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-09-22T00:00:00Z' },
    };
    await page.addInitScript(([key, value, userId]) => {
      // Signed in, cookie banner answered, first-run tour already seen.
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(`sh-tour-seen-${userId}`, '1');
      window.localStorage.setItem('sh_cookie_consent', JSON.stringify({ analytics: false, respondedAt: new Date().toISOString() }));
    }, [STORAGE_KEY, JSON.stringify(session), USER_ID] as const);

    // Realtime: accept the socket and say nothing.
    await page.routeWebSocket(/\/realtime\/v1\//, () => {});
    await page.route(`${SUPABASE}/**`, (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
    let body: Record<string, unknown> | null;
    try { body = req.postDataJSON(); } catch { body = null; }
    this.calls.push({ method, path: url.pathname, url: req.url(), body });
    const key = `${method} ${url.pathname}`;
    const o = this.overrides.get(key);
    if (o) return o(route, body);
    return this.defaultHandler(route, method, url, body);
  }

  private defaultHandler(route: Route, method: string, url: URL, body: Record<string, unknown> | null) {
    const p = url.pathname;
    const wantsObject = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const one = (o: unknown) => json(route, wantsObject ? o : [o]);

    if (p === '/rest/v1/profiles') return one({ id: USER_ID, role: 'client', full_name: 'TUTEL s.r.o.', client_id: CLIENT_ID });
    if (p === '/rest/v1/clients') return one({ id: CLIENT_ID, business_name: 'TUTEL s.r.o.', is_sandbox: false, send_timezone: 'Europe/Prague', country: 'CZ' });
    if (p === '/rest/v1/billing_profiles') return one({ credits_remaining: 12 });
    if (p === '/rest/v1/campaigns') return json(route, [CAMPAIGN_ARCH, CAMPAIGN_SVJ].map((c) => ({ ...c, status: 'active', language: 'Czech', country: 'CZ', created_at: '2026-10-01T00:00:00Z', prospect_count: 10 })));
    if (p === '/functions/v1/gmail-client') return json(route, { connected: true, email: 'martin@example.com', status: 'active' });
    if (p === '/rest/v1/rpc/approved_queue') return json(route, this.approvedQueue(body));
    if (p === '/rest/v1/rpc/approvals_schedule') return json(route, []);
    if (p === '/rest/v1/rpc/send_pacing') return json(route, { ok: true, time_zone: 'Europe/Prague', mailbox_connected: true, today: { sent: 30, cap: 30 } });
    if (p === '/rest/v1/messages' && method === 'PATCH') return this.patchMessages(route, url, body);
    if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...cors(), 'content-range': '0-0/0' } });
    if (p.startsWith('/rest/v1/rpc/')) return json(route, method === 'POST' ? [] : null);
    return json(route, []);
  }

  /** Same shape approved_queue returns; only the pending tab carries rows here. */
  approvedQueue(body: Record<string, unknown> | null) {
    const pending = this.drafts.filter((d) => d.approval_status === 'pending');
    const approved = this.drafts.filter((d) => d.approval_status === 'approved');
    const tab = body?.p_tab ?? 'approved';
    const rows = tab === 'pending' ? pending : tab === 'approved' && Number(body?.p_limit) > 1 ? approved : [];
    return {
      ok: true, is_admin: false, time_zone: 'Europe/Prague',
      total: tab === 'pending' ? pending.length : approved.length,
      counts: { approved: approved.length, sendable: approved.length, pending: pending.length, pending_followups: pending.length },
      stats: { pending: pending.length, approved_today: approved.length, sent_today: 30 },
      rows: rows.map((d) => ({
        id: d.id, prospect_id: d.prospect_id, campaign_id: d.campaign_id, channel: 'email',
        subject: 'Re: nabídka', body: 'Dobrý den,\n\nnavazuji na svůj e-mail.\n\nMartin', message_type: d.message_type,
        approval_status: d.approval_status, created_at: '2026-11-13T10:00:00Z', pending_since: '2026-11-13T10:00:00Z',
        campaign_status: 'active',
        prospect: { id: d.prospect_id, business_name: d.business_name, contact_name: null, email: 'info@example.cz', phone: null, category: null, location: d.location },
      })),
    };
  }

  private patchMessages(route: Route, url: URL, body: Record<string, unknown> | null) {
    const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
    const d = this.drafts.find((x) => x.id === id);
    if (!d || !body?.approval_status) return json(route, []);
    d.approval_status = body.approval_status as Draft['approval_status'];
    return json(route, [{ id }]);
  }
}

export function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'access-control-expose-headers': 'content-range',
  };
}

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, headers: { ...cors(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** What PostgREST answered on 13 Nov 2026 under load. */
export function statementTimeout(route: Route) {
  return json(route, { code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' }, 500);
}

/** A request the server never answers: what mobile Safari was left holding. */
export function neverAnswer(): Handler {
  return () => new Promise<void>(() => {});
}
