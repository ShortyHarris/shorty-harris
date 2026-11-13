import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendQueue } from './SendQueue';
import { useSendQueue, type QueuedMessage, type SendQueue as SendQueueData } from '../hooks/useSendQueue';

vi.mock('../hooks/useSendQueue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useSendQueue')>();
  return { ...actual, useSendQueue: vi.fn() };
});

function row(overrides: Partial<QueuedMessage> = {}): QueuedMessage {
  return {
    id: 'm1', prospect_id: 'p1', campaign_id: 'c1', channel: 'email',
    subject: 'Optimalizace provozu', body: 'Dobrý den,\npomáháme firmám optimalizovat jejich provoz.\n\nMartin',
    message_type: 'follow_up_d3', approval_status: 'approved', created_at: '2026-11-10T08:00:00Z',
    approved_at: '2026-11-10T09:00:00Z',
    prospect: { id: 'p1', business_name: 'SVJ Slancova', contact_name: null, email: 'vybor@svj.example', phone: null, category: null, location: 'Praha' },
    client_id: 'cl1', client_name: 'TUTEL s.r.o.', time_zone: 'Europe/Prague',
    campaign_name: 'Služby pro SVJ', sending: false, queue_edited_at: null,
    category: 'sendable', estimated_send_at: '2026-11-16T08:00:00Z', due: true, is_confirmed: false,
    basis: 'previous_email_sent', send_window: 'later',
    ...overrides,
  };
}

function queueOf(rows: QueuedMessage[]): SendQueueData {
  return {
    rows, total: rows.length,
    windows: { all: rows.length, today: 0, tomorrow: 0, later: rows.length, unscheduled: 0 },
    campaigns: [{ id: 'c1', name: 'Služby pro SVJ', client_id: 'cl1', count: rows.length }],
    clients: [], isAdmin: false,
  };
}

const edit = vi.fn();
const unapprove = vi.fn();
const cancel = vi.fn();
const toast = vi.fn();

function mockQueue(rows: QueuedMessage[]) {
  (useSendQueue as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    queue: queueOf(rows), loading: false, isFetching: false, dataUpdatedAt: 0, error: null,
    reload: vi.fn(), edit, unapprove, cancel,
  });
}

describe('SendQueue', () => {
  beforeEach(() => {
    [edit, unapprove, cancel, toast].forEach((f) => f.mockReset());
    edit.mockResolvedValue({ error: null });
    unapprove.mockResolvedValue({ done: 1, requested: 1, skipped: {}, error: null });
    cancel.mockResolvedValue({ done: 1, requested: 1, skipped: {}, error: null });
  });

  it('lists approved emails with when they go out', () => {
    mockQueue([row()]);
    render(<SendQueue clientId="cl1" toast={toast} />);
    const table = screen.getAllByTestId('send-queue-row')[0];
    expect(within(table).getByText('SVJ Slancova')).toBeInTheDocument();
    expect(within(table).getByText(/09:00$/)).toBeInTheDocument();
    expect(within(table).getByText('due, next send run')).toBeInTheDocument();
  });

  it('opens an email, saves a correction and keeps it approved', async () => {
    mockQueue([row()]);
    render(<SendQueue clientId="cl1" toast={toast} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Review' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Queued email' });
    const body = within(dialog).getByLabelText('Message body');
    await userEvent.clear(body);
    await userEvent.type(body, 'Dobrý den, zajišťujeme technickou správu pro SVJ.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), undefined, 'Dobrý den, zajišťujeme technickou správu pro SVJ.');
    expect(unapprove).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/stays approved/));
  });

  it('moves an email back to pending after confirming', async () => {
    mockQueue([row()]);
    render(<SendQueue clientId="cl1" toast={toast} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Review' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Move back to pending' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move to Pending' }));
    expect(unapprove).toHaveBeenCalledWith([expect.objectContaining({ id: 'm1' })]);
  });

  it('cancels selected emails in bulk and reports what was skipped', async () => {
    cancel.mockResolvedValue({ done: 1, requested: 2, skipped: { sending: 1 }, error: null });
    mockQueue([row(), row({ id: 'm2', prospect: { ...row().prospect!, business_name: 'SVJ Terronská' } })]);
    render(<SendQueue clientId="cl1" toast={toast} />);
    await userEvent.click(screen.getByLabelText('Select page'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel selected' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel email' }));
    expect(cancel).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'm1' }), expect.objectContaining({ id: 'm2' })]));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/1 skipped: 1 being sent right now/), 'warning');
  });

  it('locks an email the sender has already picked up', async () => {
    mockQueue([row({ sending: true })]);
    render(<SendQueue clientId="cl1" toast={toast} />);
    expect(screen.getAllByText('Sending now').length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'Review' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Queued email' });
    expect(within(dialog).getByLabelText('Message body')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel email' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Move back to pending' })).toBeDisabled();
  });

  it('is read-only in View as client', async () => {
    mockQueue([row()]);
    render(<SendQueue clientId="cl1" toast={toast} readOnly readOnlyMessage="read only" />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(toast).toHaveBeenCalledWith('read only', 'warning');
    expect(cancel).not.toHaveBeenCalled();
  });
});
