import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildClientIcp, clientIcpKey } from './useClientIcp';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() }, rpc: vi.fn() },
}));

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;
const GENERIC = "Couldn't rebuild your targeting profile - please try again.";

function httpError(body: unknown, rawText?: string) {
  const res = new Response(rawText ?? JSON.stringify(body), { status: 400 });
  return { message: 'Edge Function returned a non-2xx status code', context: res };
}

describe('buildClientIcp', () => {
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    invoke.mockReset();
    invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  });

  it('calls the edge function, never the RPC, and succeeds only on ok === true', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const res = await buildClientIcp('c1');
    expect(invoke).toHaveBeenCalledWith('rebuild-client-targeting', { body: { client_id: 'c1' } });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, error: null, limitedData: false });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientIcpKey('c1') });
  });

  it('reports limited_data on success', async () => {
    invoke.mockResolvedValue({ data: { ok: true, limited_data: true }, error: null });
    expect((await buildClientIcp('c1')).limitedData).toBe(true);
  });

  it('treats ok:false as an error and does not invalidate', async () => {
    invoke.mockResolvedValue({ data: { ok: false, step: 'website', reason: 'x', detail: 'Site blocked us' }, error: null });
    const res = await buildClientIcp('c1');
    expect(res).toEqual({ ok: false, error: 'Site blocked us', limitedData: false });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each([
    ['no_website_url', 'Add a website URL to this client first'],
    ['website_read_timeout', 'Reading the website took too long, try again in a minute'],
    ['not_permitted', "You don't have access to this client"],
    ['website_read_failed_403', GENERIC],
    ['something_new', GENERIC],
  ])('falls back by reason %s when there is no detail', async (reason, expected) => {
    invoke.mockResolvedValue({ data: { ok: false, reason }, error: null });
    expect((await buildClientIcp('c1')).error).toBe(expected);
  });

  it('is not a success when the body is missing or ok is not exactly true', async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    expect((await buildClientIcp('c1')).ok).toBe(false);
    invoke.mockResolvedValue({ data: { ok: 'true' }, error: null });
    expect((await buildClientIcp('c1')).ok).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('reads the JSON body from a non-2xx error context', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ ok: false, reason: 'not_permitted' }) });
    const res = await buildClientIcp('c1');
    expect(res.ok).toBe(false);
    expect(res.error).toBe("You don't have access to this client");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('prefers detail from a non-2xx body', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ ok: false, reason: 'no_website_url', detail: 'Custom detail' }) });
    expect((await buildClientIcp('c1')).error).toBe('Custom detail');
  });

  it('uses the generic message when the error body is not JSON or there is no context', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(null, '<html>502</html>') });
    expect((await buildClientIcp('c1')).error).toBe(GENERIC);
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function' } });
    const res = await buildClientIcp('c1');
    expect(res.ok).toBe(false);
    expect(res.error).toBe(GENERIC);
  });
});
