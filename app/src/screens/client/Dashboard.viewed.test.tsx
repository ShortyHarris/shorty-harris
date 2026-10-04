import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import { useClientDashboard } from '../../hooks/useClientDashboard';
import { useClientApprovals } from '../../hooks/useClientApprovals';
import { useWarmProspects } from '../../hooks/useWarmProspects';
import type { HotLead } from '../../types';

vi.mock('../../hooks/useClientDashboard');
vi.mock('../../hooks/useClientApprovals');
vi.mock('../../hooks/useWarmProspects');

function makeLead(overrides: Partial<HotLead> = {}): HotLead {
  return {
    hot_lead_id: 'lead-1',
    business_name: 'Eastpark Dental',
    contact_name: null,
    email: 'contact@eastpark.test',
    phone: null,
    status: 'new',
    ai_summary: null,
    suggested_action: null,
    routed_at: new Date().toISOString(),
    first_viewed_at: null,
    contacted_at: null,
    closed_at: null,
    outcome_note: null,
    call_outcome: null,
    nudge_count: 0,
    escalated: false,
    hours_waiting: 5,
    reply: null,
    latest_reply: null,
    ...overrides,
  };
}

describe('Dashboard: opening a hot lead marks it viewed', () => {
  const setOutcome = vi.fn().mockResolvedValue({ error: null });

  beforeEach(() => {
    setOutcome.mockClear();
    (useClientApprovals as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ items: [] });
    (useWarmProspects as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      prospects: [], loading: false, logCallOutcome: vi.fn(),
    });
  });

  it('does not call setOutcome just from rendering the list', () => {
    (useClientDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      leads: [makeLead()], loading: false, error: null, setOutcome, reload: vi.fn(),
      isFetching: false, dataUpdatedAt: Date.now(),
    });

    render(<Dashboard clientId="client-1" />);

    expect(setOutcome).not.toHaveBeenCalled();
  });

  it('calls setOutcome(id, "viewed") exactly once when a new lead is opened', async () => {
    (useClientDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      leads: [makeLead()], loading: false, error: null, setOutcome, reload: vi.fn(),
      isFetching: false, dataUpdatedAt: Date.now(),
    });

    render(<Dashboard clientId="client-1" />);

    const rows = await screen.findAllByText('Eastpark Dental');
    await userEvent.click(rows[0]);

    expect(setOutcome).toHaveBeenCalledTimes(1);
    expect(setOutcome).toHaveBeenCalledWith('lead-1', 'viewed');
  });

  it('does not call setOutcome again when an already-viewed lead is opened', async () => {
    (useClientDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      leads: [makeLead({ status: 'viewed' })], loading: false, error: null, setOutcome, reload: vi.fn(),
      isFetching: false, dataUpdatedAt: Date.now(),
    });

    render(<Dashboard clientId="client-1" />);

    // The default filter tab is "New", which hides already-viewed leads.
    await userEvent.click(screen.getByRole('button', { name: /^all/i }));

    const rows = await screen.findAllByText('Eastpark Dental');
    await userEvent.click(rows[0]);

    expect(setOutcome).not.toHaveBeenCalled();
  });
});
