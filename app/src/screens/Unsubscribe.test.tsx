import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Unsubscribe } from './Unsubscribe';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}));

const mockedRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const VALID_TOKEN = '11111111-2222-3333-4444-555555555555';

function setSearch(search: string) {
  window.history.pushState({}, '', `/unsubscribe${search}`);
}

describe('Unsubscribe page', () => {
  beforeEach(() => {
    mockedRpc.mockReset();
  });

  it('valid token: calls unsubscribe_by_token and shows the success state', async () => {
    setSearch(`?t=${VALID_TOKEN}`);
    mockedRpc.mockResolvedValueOnce({ data: { ok: true, business_name: 'Eastpark Dental' }, error: null });

    render(<Unsubscribe />);

    expect(mockedRpc).toHaveBeenCalledWith('unsubscribe_by_token', { p_token: VALID_TOKEN });
    expect(await screen.findByText(/Sorry to see you go/i)).toBeInTheDocument();
    expect(screen.getByText(/Eastpark Dental/)).toBeInTheDocument();
  });

  it('a well-formed but unknown/already-used token: RPC returns ok:false, shows invalid state', async () => {
    setSearch(`?t=${VALID_TOKEN}`);
    mockedRpc.mockResolvedValueOnce({ data: { ok: false }, error: null });

    render(<Unsubscribe />);

    expect(await screen.findByText(/invalid or expired/i)).toBeInTheDocument();
  });

  it('missing token: never calls the RPC, shows invalid state immediately', async () => {
    setSearch('');

    render(<Unsubscribe />);

    await waitFor(() => expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument());
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('malformed token (not a UUID): never calls the RPC, shows invalid state', async () => {
    setSearch('?t=not-a-real-token');

    render(<Unsubscribe />);

    await waitFor(() => expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument());
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('RPC failure: shows the error state with a retry option, not the invalid-link copy', async () => {
    setSearch(`?t=${VALID_TOKEN}`);
    mockedRpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });

    render(<Unsubscribe />);

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
