import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { fetchSendPacing } from './useSendPacing';
import { parseSendPacing } from '../lib/sendPacing';

// send_pacing is SECURITY DEFINER, so can_manage_client() inside it is the only gate between one client
// and another client's queue sizes, and between a client and the admin-only counts. Same pattern as
// approvedQueue.auth.test.ts.

// ── Always runs: the app must never turn a refusal into data ─────────────────
describe('send_pacing refusal handling (no network)', () => {
  it('turns not_permitted into an error, never into a panel', () => {
    expect(() => parseSendPacing({ ok: false, error: 'not_permitted' })).toThrow('not_permitted');
  });
});

// ── Live: needs a real CLIENT login (not an admin) against the real project ──
// Set TEST_CLIENT_EMAIL, TEST_CLIENT_PASSWORD and (optionally) TEST_OTHER_CLIENT_ID. Skipped when the
// login is not set, so CI without credentials stays green; run it by hand before merging a change to
// the RPC or to the Sending panels.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const EMAIL = env.TEST_CLIENT_EMAIL;
const PASSWORD = env.TEST_CLIENT_PASSWORD;
const OTHER_CLIENT_ID = env.TEST_OTHER_CLIENT_ID;

describe.skipIf(!EMAIL || !PASSWORD)('send_pacing for a client login (live PostgREST)', () => {
  let ownClientId = '';

  beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: EMAIL as string, password: PASSWORD as string });
    if (error) throw new Error(`test login failed: ${error.message}`);
    const { data, error: ownErr } = await supabase.from('clients').select('id');
    if (ownErr) throw new Error(ownErr.message);
    // A client login sees exactly one client; more than one means this is an admin, which proves nothing.
    expect(data?.length).toBe(1);
    ownClientId = (data as { id: string }[])[0].id;
  });

  afterAll(async () => { await supabase.auth.signOut(); });

  it('answers ok:true for the own client with admin == null and is_admin false', async () => {
    const { data, error } = await supabase.rpc('send_pacing', { p_client_id: ownClientId });
    expect(error).toBeNull();
    const body = data as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.is_admin).toBe(false);
    expect(body.admin).toBeNull();
  });

  it('parses into every section the panels read, with no admin data', async () => {
    const p = await fetchSendPacing(ownClientId, supabase);
    expect(p.is_admin).toBe(false);
    expect(p.admin).toBeNull();
    expect(typeof p.time_zone).toBe('string');
    expect(typeof p.today.cap).toBe('number');
    expect(p.today.sent + p.today.remaining).toBeGreaterThanOrEqual(p.today.cap);
    expect(Array.isArray(p.warmup.ladder)).toBe(true);
  });

  it.skipIf(!OTHER_CLIENT_ID)("refuses another client's id with not_permitted", async () => {
    const { data, error } = await supabase.rpc('send_pacing', { p_client_id: OTHER_CLIENT_ID });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: false, error: 'not_permitted' });
    await expect(fetchSendPacing(OTHER_CLIENT_ID as string, supabase)).rejects.toThrow('not_permitted');
  });
});
