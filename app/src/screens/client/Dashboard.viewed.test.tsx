import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { Dashboard } from './Dashboard';
import { useClientDashboard } from '../../hooks/useClientDashboard';
import { useApprovedQueueCounts } from '../../hooks/useClientApprovals';
import { useWarmProspects } from '../../hooks/useWarmProspects';
import { useSendPacing } from '../../hooks/useSendPacing';
import type { HotLead } from '../../types';

vi.mock('../../hooks/useClientDashboard');
vi.mock('../../hooks/useClientApprovals');
vi.mock('../../hooks/useWarmProspects');
vi.mock('../../hooks/useSendPacing');

function render(ui: ReactElement, path = '/app') {
  return rtlRender(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

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
    (useSendPacing as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ pacing: null, loading: false, error: null });
    (useApprovedQueueCounts as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ awaitingProspects: 0 });
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

    const rows = await screen.findAllByText('Eastpark Dental');
    await userEvent.click(rows[0]);

    expect(setOutcome).not.toHaveBeenCalled();
  });
});

describe('Dashboard: status filters', () => {
  const setOutcome = vi.fn().mockResolvedValue({ error: null });
  const lostLead = makeLead({
    hot_lead_id: 'lead-lost', business_name: 'Four Seasons Health Club',
    status: 'lost', hours_waiting: null, closed_at: new Date().toISOString(),
  });

  beforeEach(() => {
    (useSendPacing as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ pacing: null, loading: false, error: null });
    setOutcome.mockClear();
    (useApprovedQueueCounts as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ awaitingProspects: 0 });
    (useWarmProspects as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      prospects: [], loading: false, logCallOutcome: vi.fn(),
    });
    (useClientDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      leads: [lostLead], loading: false, error: null, setOutcome, reload: vi.fn(),
      isFetching: false, dataUpdatedAt: Date.now(),
    });
  });

  it('shows a lost lead under the default All filter, with its status badge', async () => {
    render(<Dashboard clientId="client-1" />);
    expect((await screen.findAllByText('Four Seasons Health Club')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lost', { selector: '.status-pill' }).length).toBeGreaterThan(0);
  });

  it('shows the lost lead under Lost and hides it under Open', async () => {
    render(<Dashboard clientId="client-1" />);
    const bar = document.querySelector('.filter-bar') as HTMLElement;

    await userEvent.click(within(bar).getByRole('button', { name: /^lost/i }));
    expect(screen.queryAllByText('Four Seasons Health Club').length).toBeGreaterThan(0);

    await userEvent.click(within(bar).getByRole('button', { name: /^open/i }));
    expect(screen.queryAllByText('Four Seasons Health Club')).toHaveLength(0);
  });

  it('opens the lead named in ?lead= (notification deep link)', async () => {
    render(<Dashboard clientId="client-1" />, '/app?lead=lead-lost');
    expect(await screen.findByRole('heading', { name: 'Four Seasons Health Club' })).toBeTruthy();
  });
});
