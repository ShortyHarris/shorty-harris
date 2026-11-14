import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WarmupSection } from './SendingPanel';
import { warmupView } from '../lib/warmup';
import { parseSendPacing } from '../lib/sendPacing';

describe('WarmupSection', () => {
  it('answers "why only 5 a day" and marks where the mailbox is', () => {
    const view = warmupView(parseSendPacing({
      ok: true, time_zone: 'America/Chicago', mailbox_connected: true,
      warmup: { mode: 'ramp', active: true, day: 8, ladder: [
        { cap: 5, starts_on: '2026-10-28' }, { cap: 10, starts_on: '2026-11-04' }, { cap: 20, starts_on: '2026-11-11' },
        { cap: 30, starts_on: '2026-11-18' }, { cap: 40, starts_on: '2026-11-25' },
      ] },
      today: { cap: 10, sent: 2, remaining: 8, in_window_now: true },
    }), new Date('2026-11-05T17:00:00Z'))!;
    render(<WarmupSection view={view} />);
    expect(screen.getByRole('heading', { name: 'Why only 10 emails a day?' })).toBeTruthy();
    expect(screen.getByText(/land in inboxes instead of spam/)).toBeTruthy();
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(5);
    expect(steps[1].textContent).toContain("You're here");
    expect(steps[1].textContent).toContain('This week');
    expect(steps[4].textContent).toContain('From Nov 25');
  });
});
