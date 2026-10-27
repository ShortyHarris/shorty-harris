import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn() } }));

import { activationByClient, sendClientInvite } from './useAdminData';
import { supabase } from '../lib/supabase';

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

describe('activationByClient', () => {
  it('counts a client as activated if ANY of its profiles is activated', () => {
    const map = activationByClient([
      { client_id: 'c1', activated_at: '2026-10-01T00:00:00Z' },
      { client_id: 'c1', activated_at: null },
      { client_id: 'c2', activated_at: null },
    ]);
    expect(map.get('c1')).toBe('2026-10-01T00:00:00Z');
    expect(map.get('c2')).toBeNull();
    expect(map.has('c3')).toBe(false);
  });

  it('keeps the latest activation', () => {
    const map = activationByClient([
      { client_id: 'c1', activated_at: '2026-10-01T00:00:00Z' },
      { client_id: 'c1', activated_at: '2026-10-05T00:00:00Z' },
    ]);
    expect(map.get('c1')).toBe('2026-10-05T00:00:00Z');
  });
});

describe('sendClientInvite', () => {
  it('reads user_already_active from a 409 error body', async () => {
    const res = new Response(JSON.stringify({ error: 'user_already_active', message: 'x' }), { status: 409 });
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: res } });
    expect(await sendClientInvite('c1', 'a@b.cz', 'Biz')).toEqual({ error: 'Already active', alreadyActive: true });
  });

  it('falls back to the generic message when the error body is not JSON', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom', context: new Response('<html>', { status: 502 }) } });
    expect((await sendClientInvite('c1', 'a@b.cz', 'Biz')).error).toBe('boom');
  });

  it('reports a resend and a fresh invite', async () => {
    invoke.mockResolvedValue({ data: { success: true, resent: true }, error: null });
    expect(await sendClientInvite('c1', 'a@b.cz', 'Biz')).toEqual({ error: null, resent: true });
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    expect(await sendClientInvite('c1', 'a@b.cz', 'Biz')).toEqual({ error: null, resent: false });
  });
});
