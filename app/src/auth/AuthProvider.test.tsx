import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// A controllable fake of the slice of supabase-js the provider uses.
const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  profileResult: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: h.getSession,
      onAuthStateChange: h.onAuthStateChange,
      signOut: h.signOut,
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => h.profileResult() }) }) }),
  },
}));

import { AuthProvider, AUTH_BOOT_TIMEOUT_MS } from './AuthProvider';
import { BootSplash, SPLASH_STALL_MS } from '../components/BootSplash';
import { useAuth } from './AuthProvider';

const SESSION = { user: { id: 'u1' } };
const PROFILE = { id: 'u1', role: 'client', full_name: 'TUTEL s.r.o.', client_id: 'c1' };

/** What the route guards do: splash while loading or on a boot error, else the app. */
function Gate() {
  const { loading, bootError, profile } = useAuth();
  if (loading || bootError) return <BootSplash />;
  return <div>app for {profile?.full_name ?? 'nobody'}</div>;
}

function renderApp() {
  return render(<AuthProvider><Gate /></AuthProvider>);
}

describe('auth bootstrap never leaves the splash spinning forever (13 Nov 2026 reload in mobile Safari)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.getSession.mockReset();
    h.profileResult.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('loads normally', async () => {
    h.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    h.profileResult.mockResolvedValue({ data: PROFILE, error: null });
    renderApp();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('app for TUTEL s.r.o.')).toBeInTheDocument();
  });

  it('a profile request that never answers turns into an error with Try again', async () => {
    h.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    h.profileResult.mockReturnValue(new Promise(() => {}));
    renderApp();
    await act(() => vi.advanceTimersByTimeAsync(AUTH_BOOT_TIMEOUT_MS + 10));
    expect(screen.getByRole('alert')).toHaveTextContent(/didn't answer in time/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('getSession hanging (e.g. a stuck token refresh) also ends in the error, not a spinner', async () => {
    h.getSession.mockReturnValue(new Promise(() => {}));
    renderApp();
    await act(() => vi.advanceTimersByTimeAsync(AUTH_BOOT_TIMEOUT_MS + 10));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('a failed profile request (statement timeout) is an error, not "signed out"', async () => {
    h.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    h.profileResult.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout' } });
    renderApp();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('alert')).toHaveTextContent(/server didn't answer in time/);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('Try again recovers once the server answers', async () => {
    h.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    h.profileResult.mockResolvedValueOnce({ data: null, error: { message: 'Gateway Timeout' } });
    renderApp();
    await act(() => vi.advanceTimersByTimeAsync(0));
    h.profileResult.mockResolvedValue({ data: PROFILE, error: null });
    await act(async () => { screen.getByRole('button', { name: 'Try again' }).click(); });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('app for TUTEL s.r.o.')).toBeInTheDocument();
  });

  it('getSession and the INITIAL_SESSION event share one profile request', async () => {
    h.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    h.profileResult.mockResolvedValue({ data: PROFILE, error: null });
    h.onAuthStateChange.mockImplementationOnce(((cb: (e: string, s: unknown) => void) => {
      cb('INITIAL_SESSION', SESSION);
      return { data: { subscription: { unsubscribe: () => {} } } };
    }) as never);
    renderApp();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(h.profileResult).toHaveBeenCalledTimes(1);
  });

  it('a splash that is up too long for any other reason offers a reload', async () => {
    h.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    h.profileResult.mockResolvedValue({ data: PROFILE, error: null });
    render(<AuthProvider><BootSplash /></AuthProvider>);
    await act(() => vi.advanceTimersByTimeAsync(SPLASH_STALL_MS));
    expect(screen.getByRole('status')).toHaveTextContent(/taking longer than usual/);
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });
});
