import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReplyBreakdown } from './ReplyBreakdown';
import type { ReplyRecord } from '../../lib/replyIntents';

const rec = (id: string, intent: string): ReplyRecord => ({
  id, intent, body: 'x'.repeat(200), at: '2026-10-01T00:00:00Z', prospectName: `Prospect ${id}`,
});

const replies = [
  rec('a1', 'automated'), rec('a2', 'out_of_office'), rec('b1', 'bounced'),
  rec('h1', 'interested'), rec('h2', 'interested'), rec('h3', 'maybe'),
];

describe('ReplyBreakdown', () => {
  it('shows the real-reply total in the donut centre and the grand total in the header', () => {
    render(<ReplyBreakdown replies={replies} />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('real replies')).toBeTruthy();
    expect(screen.getByText('of 6 total replies')).toBeTruthy();
  });

  it('lists legend rows largest first', () => {
    render(<ReplyBreakdown replies={replies} />);
    const rows = screen.getAllByRole('button', { pressed: false }).map((b) => b.textContent);
    expect(rows[0]).toContain('Interested');
    expect(rows[1]).toContain('Maybe');
  });

  it('shows a tooltip on legend focus and filters on click', () => {
    render(<ReplyBreakdown replies={replies} />);
    const row = screen.getByRole('button', { name: /Interested/ });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(row);
    expect(screen.getByRole('tooltip').textContent).toContain('Interested · 2 · 67%');
    fireEvent.click(row);
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Prospect h1')).toBeTruthy();
    expect(screen.queryByText('Prospect h3')).toBeNull();
  });

  it('filters to automated replies from the tile', () => {
    render(<ReplyBreakdown replies={replies} />);
    fireEvent.click(screen.getByRole('button', { name: /Automated/ }));
    expect(screen.getByText('Prospect a1')).toBeTruthy();
    expect(screen.queryByText('Prospect h1')).toBeNull();
  });

  it('shows an empty state instead of a donut when there are no human replies', () => {
    render(<ReplyBreakdown replies={[rec('a1', 'automated')]} />);
    expect(screen.getByText(/No real replies yet/)).toBeTruthy();
    expect(screen.queryByText('real replies')).toBeNull();
  });
});
