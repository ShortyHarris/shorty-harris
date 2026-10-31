import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SendingCardView, SendingLineView } from './SendingPanel';
import { parseSendPacing } from '../lib/sendPacing';

function pacing(over: Record<string, unknown> = {}) {
  return parseSendPacing({
    ok: true,
    is_admin: false,
    time_zone: 'America/Chicago',
    window: { start: '09:00', end: '17:00', days: 'Mon-Fri' },
    mailbox_connected: true,
    paused_until: null,
    warmup: { mode: 'warm', active: false, day: 40, next_step_cap: null, next_step_date: null, ladder: [] },
    today: { cap: 40, sent: 12, remaining: 28, in_window_now: true },
    queue: { ready: 30, ready_first_emails: 22, ready_follow_ups: 8, waiting_for_date: 3, estimated_clear_date: '2026-10-30' },
    follow_ups: { awaiting_approval: 4, scheduled: 9, next_due: '2026-10-31T15:00:00Z' },
    admin: null,
    ...over,
  });
}

describe('SendingCardView', () => {
  it('shows the plain-language lines and the follow-up explainer', () => {
    render(<SendingCardView pacing={pacing()} />);
    expect(screen.getByText('12 of 40 emails sent today.')).toBeTruthy();
    expect(screen.getByText('Full sending volume.')).toBeTruthy();
    expect(screen.getByText(/30 approved emails are queued/)).toBeTruthy();
    expect(screen.getByText(/4 waiting for your approval/)).toBeTruthy();
    expect(screen.getByText(/3, then 5, then 7 business days/)).toBeTruthy();
  });

  it('puts the estimate tooltip on the queue line', () => {
    render(<SendingCardView pacing={pacing()} />);
    expect(screen.getByLabelText('An estimate. Follow-ups share the same daily limit.')).toBeTruthy();
  });

  it('shows no admin section to a client', () => {
    render(<SendingCardView pacing={pacing({ admin: { held_by_send_rules: 5, blocked_total: 9 } })} />);
    expect(screen.queryByTestId('sending-admin')).toBeNull();
    expect(screen.queryByText(/held by send rules/)).toBeNull();
    expect(screen.queryByText(/Warm-up mode/)).toBeNull();
  });

  it("shows the admin section from the response's is_admin", () => {
    render(<SendingCardView pacing={pacing({ is_admin: true, admin: { held_by_send_rules: 5, blocked_total: 9 } })} />);
    expect(screen.getByTestId('sending-admin')).toBeTruthy();
    expect(screen.getByText('Warm-up mode: warm.')).toBeTruthy();
    expect(screen.getByText('5 held by send rules.')).toBeTruthy();
    expect(screen.getByText('9 blocked from sending.')).toBeTruthy();
  });

  it('warns prominently when no mailbox is connected, and drops the misleading lines', () => {
    render(<SendingCardView pacing={pacing({ mailbox_connected: false })} />);
    expect(screen.getByRole('status').textContent).toContain('Connect Gmail, nothing can send until you do.');
    expect(screen.queryByText(/emails sent today/)).toBeNull();
  });

  it('warns when sending is paused', () => {
    render(<SendingCardView pacing={pacing({ paused_until: '2026-11-03T14:00:00Z' })} />);
    expect(screen.getByRole('status').textContent).toMatch(/Sending is paused until Nov 3/);
  });

  it('hides zero-count lines instead of printing zeros', () => {
    render(<SendingCardView pacing={pacing({
      queue: { ready: 0, ready_first_emails: 0, ready_follow_ups: 0, waiting_for_date: 0, estimated_clear_date: null },
      follow_ups: { awaiting_approval: 0, scheduled: 0, next_due: null },
    })} />);
    expect(screen.queryByText(/approved email/)).toBeNull();
    expect(screen.queryByText(/waiting for your approval/)).toBeNull();
    expect(screen.queryByText(/scheduled/)).toBeNull();
  });

  it('lists the warm-up ladder when warming up', () => {
    render(<SendingCardView pacing={pacing({
      warmup: { mode: 'ramp', active: true, day: 3, next_step_cap: 10, next_step_date: '2026-11-02', ladder: [{ cap: 5, starts_on: '2026-10-26' }, { cap: 10, starts_on: '2026-11-02' }] },
      today: { cap: 5, sent: 1, remaining: 4, in_window_now: true },
    })} />);
    expect(screen.getByText(/Your mailbox is warming up/)).toBeTruthy();
    expect(screen.getByText('5 a day from Oct 26')).toBeTruthy();
    expect(screen.getByText('10 a day from Nov 2')).toBeTruthy();
  });
});

describe('SendingLineView', () => {
  it('is one status line', () => {
    render(<SendingLineView pacing={pacing()} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain('12 of 40 emails sent today.');
  });

  it('shows the warning in place of the usual line', () => {
    render(<SendingLineView pacing={pacing({ mailbox_connected: false })} />);
    expect(screen.getByRole('status').textContent).toBe('Connect Gmail, nothing can send until you do.');
  });
});
