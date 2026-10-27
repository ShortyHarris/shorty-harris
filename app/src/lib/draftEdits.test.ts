import { describe, it, expect } from 'vitest';
import { saveDraftEdits, DRAFT_NOT_SAVED } from './draftEdits';

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: unknown[][] = [];
  const b: Record<string, unknown> = {};
  b.update = (p: unknown) => { calls.push(['update', p]); return b; };
  b.eq = (...a: unknown[]) => { calls.push(['eq', ...a]); return b; };
  b.in = (...a: unknown[]) => { calls.push(['in', ...a]); return b; };
  b.select = (...a: unknown[]) => { calls.push(['select', ...a]); return Promise.resolve(result); };
  return { client: { from: (t: string) => { calls.push(['from', t]); return b; } } as never, calls };
}

describe('saveDraftEdits', () => {
  it('errors when zero rows were updated instead of reporting success', async () => {
    const { client } = fakeClient({ data: [], error: null });
    const res = await saveDraftEdits(client, 'm1', { body: 'x' });
    expect(res.error).toBe(DRAFT_NOT_SAVED);
  });

  it('treats a null data array the same as zero rows', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect((await saveDraftEdits(client, 'm1', { body: 'x' })).error).toBe(DRAFT_NOT_SAVED);
  });

  it('passes through a database error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'permission denied' } });
    expect((await saveDraftEdits(client, 'm1', { body: 'x' })).error).toBe('permission denied');
  });

  it('succeeds when a row was updated and returns the patch', async () => {
    const { client } = fakeClient({ data: [{ id: 'm1' }], error: null });
    const res = await saveDraftEdits(client, 'm1', { subject: 'Dobrý den', body: 'Příliš žluťoučký kůň' });
    expect(res.error).toBeNull();
    expect(res.patch).toMatchObject({ subject: 'Dobrý den', body: 'Příliš žluťoučký kůň' });
    expect(res.patch.updated_at).toBeTruthy();
  });

  it('only writes fields that were passed', async () => {
    const { client } = fakeClient({ data: [{ id: 'm1' }], error: null });
    const res = await saveDraftEdits(client, 'm1', { body: 'x' });
    expect(Object.keys(res.patch).sort()).toEqual(['body', 'updated_at']);
  });

  it('guards on pending/edited and unsent, and selects the ids back', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'm1' }], error: null });
    await saveDraftEdits(client, 'm1', { body: 'x' });
    expect(calls).toContainEqual(['eq', 'id', 'm1']);
    expect(calls).toContainEqual(['in', 'approval_status', ['pending', 'edited']]);
    expect(calls).toContainEqual(['eq', 'send_status', 'not_sent']);
    expect(calls).toContainEqual(['select', 'id']);
  });

  it('uses a wider status guard when asked (approved but unsent steps)', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'm1' }], error: null });
    await saveDraftEdits(client, 'm1', { body: 'x' }, ['pending', 'edited', 'approved']);
    expect(calls).toContainEqual(['in', 'approval_status', ['pending', 'edited', 'approved']]);
  });
});
