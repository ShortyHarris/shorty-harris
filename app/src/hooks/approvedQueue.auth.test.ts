import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { fetchApprovedQueue, parseApprovedQueue } from './useClientApprovals';

// approved_queue is SECURITY DEFINER, so it bypasses RLS: can_manage_client() inside it is the
// ONLY thing stopping one client reading another client's prospect emails, phone numbers and
// message bodies. This is the cross-client denial test for that gate.

// ── Always runs: the app must never turn a refusal into data ─────────────────
describe('approved_queue refusal handling (no network)', () => {
  it('turns a not_permitted body into an error, never into rows or counts', () => {
    expect(() => parseApprovedQueue({ ok: false, error: 'not_permitted' })).toThrow('not_permitted');
  });

  it('turns an empty body into an error', () => {
    expect(() => parseApprovedQueue(null)).toThrow('not_permitted');
  });
});

// ── Live: needs a real CLIENT login (not an admin) against the real project ──
// Set TEST_CLIENT_EMAIL, TEST_CLIENT_PASSWORD and TEST_OTHER_CLIENT_ID (the id of any client
// that is NOT the test user's own) in the environment. Skipped when they are not all set, so
// CI without credentials stays green; run it by hand before merging any change to the RPC.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const EMAIL = env.TEST_CLIENT_EMAIL;
const PASSWORD = env.TEST_CLIENT_PASSWORD;
const OTHER_CLIENT_ID = env.TEST_OTHER_CLIENT_ID;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

describe.skipIf(!EMAIL || !PASSWORD || !OTHER_CLIENT_ID)('approved_queue cross-client denial (live PostgREST)', () => {
  let ownClientId = '';

  const rawCall = (clientId: string) =>
    supabase.rpc('approved_queue', { p_client_id: clientId, p_tab: 'approved', p_limit: 50 });

  beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: EMAIL as string, password: PASSWORD as string });
    if (error) throw new Error(`test login failed: ${error.message}`);
    const { data, error: ownErr } = await supabase.from('clients').select('id');
    if (ownErr) throw new Error(ownErr.message);
    // A client login sees exactly one client; more than one means this is an admin, which proves nothing.
    expect(data?.length).toBe(1);
    ownClientId = (data as { id: string }[])[0].id;
    expect(ownClientId).not.toBe(OTHER_CLIENT_ID);
  });

  afterAll(async () => { await supabase.auth.signOut(); });

  it("refuses another client's id with not_permitted and returns no rows or counts", async () => {
    const { data, error } = await rawCall(OTHER_CLIENT_ID as string);
    expect(error).toBeNull();
    expect(data).toEqual({ ok: false, error: 'not_permitted' });
  });

  it('refuses a client id that does not exist the same way', async () => {
    const { data, error } = await rawCall(NIL_UUID);
    expect(error).toBeNull();
    expect(data).toEqual({ ok: false, error: 'not_permitted' });
  });

  it('makes the app-side fetch reject for another client', async () => {
    await expect(fetchApprovedQueue(OTHER_CLIENT_ID as string, supabase, {
      tab: 'approved', page: 1, pageSize: 50, sort: 'approved_desc', messageType: null, reason: null,
    })).rejects.toThrow('not_permitted');
  });

  // plpgsql does not check a function body at CREATE time, so a migration can report success and then
  // fail on every call (a column mismatch in a UNION did exactly that). Calling each tab is the only
  // check that catches it.
  it.each(['approved', 'blocked', 'pending'] as const)('answers ok:true for the %s tab on the own client', async (tab) => {
    const { data, error } = await supabase.rpc('approved_queue', { p_client_id: ownClientId, p_tab: tab, p_limit: 5 });
    expect(error).toBeNull();
    const body = data as { ok: boolean; counts: Record<string, number>; rows: unknown[]; total: number };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe('number');
    for (const key of ['approved', 'sendable', 'scheduled', 'blocked', 'policy_held', 'pending', 'pending_policy_held', 'awaiting_prospects']) {
      expect(typeof body.counts[key]).toBe('number');
    }
  });

  it('shows a client no send-rule-held pending drafts', async () => {
    const q = await fetchApprovedQueue(ownClientId, supabase, {
      tab: 'pending', page: 1, pageSize: 200, sort: 'approved_desc', messageType: null, reason: null,
    });
    expect(q.isAdmin).toBe(false);
    expect(q.counts.pendingPolicyHeld).toBe(0);
    expect(q.items.some((m) => m.policy_held)).toBe(false);
    expect(q.items.every((m) => m.approval_status === 'pending')).toBe(true);
  });

  it('serves the own client as a non-admin with no send-rule-held rows', async () => {
    const q = await fetchApprovedQueue(ownClientId, supabase, {
      tab: 'approved', page: 1, pageSize: 200, sort: 'approved_desc', messageType: null, reason: null,
    });
    expect(q.isAdmin).toBe(false);
    expect(q.counts.policyHeld).toBe(0);
    expect(q.items.some((m) => m.policy_held)).toBe(false);
    expect(q.items.some((m) => m.block_reason === 'generic_mailbox' || m.block_reason === 'freemail_address')).toBe(false);
  });
});
