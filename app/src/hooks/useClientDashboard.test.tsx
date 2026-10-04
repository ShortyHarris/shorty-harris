import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useClientDashboard } from './useClientDashboard';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

const mockedRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useClientDashboard.setOutcome', () => {
  beforeEach(() => {
    mockedRpc.mockReset();
    mockedRpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('writes status changes only through set_hot_lead_outcome, never a direct table update', async () => {
    const { result } = renderHook(() => useClientDashboard('__preview__'), { wrapper });

    await act(async () => {
      await result.current.setOutcome('mock-0', 'contacted');
    });

    expect(mockedRpc).toHaveBeenCalledTimes(1);
    expect(mockedRpc).toHaveBeenCalledWith('set_hot_lead_outcome', expect.anything());
  });

  it('never sends trigger-owned timestamp fields', async () => {
    const { result } = renderHook(() => useClientDashboard('__preview__'), { wrapper });

    await act(async () => {
      await result.current.setOutcome('mock-0', 'won', 'closing the deal', 'meeting_agreed');
    });

    const payload = mockedRpc.mock.calls[0][1];
    for (const forbidden of ['status_updated_at', 'contacted_at', 'first_viewed_at', 'closed_at']) {
      expect(payload).not.toHaveProperty(forbidden);
    }
    expect(payload).toEqual({
      p_hot_lead_id: 'mock-0',
      p_status: 'won',
      p_note: 'closing the deal',
      p_call_outcome: 'meeting_agreed',
    });
  });
});
