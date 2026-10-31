import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlockBadge } from './BlockBadge';

// Renders the copy a user actually reads; the live database has no rows for most of these.
describe('BlockBadge', () => {
  it.each([
    ['draft', 'Campaign not launched'],
    ['paused', 'Campaign paused'],
    ['cancelled', 'Campaign cancelled'],
  ])('renders "%s" campaigns as %s', (status, copy) => {
    render(<BlockBadge reason="campaign_inactive" campaignStatus={status} />);
    expect(screen.getByText(copy)).toBeInTheDocument();
    // Badge and text are the same string, so it is shown once, not twice.
    expect(screen.getAllByText(copy)).toHaveLength(1);
  });

  it('renders the generic "Paused" for an unknown campaign status', () => {
    render(<BlockBadge reason="campaign_inactive" campaignStatus="archived" />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.queryByText(/Campaign/)).toBeNull();
  });

  it('renders the followups_stopped explanation', () => {
    render(<BlockBadge reason="followups_stopped" />);
    expect(screen.getByText("Won't send: follow-ups for this prospect were stopped")).toBeInTheDocument();
  });

  it('renders nothing for a sendable draft', () => {
    const { container } = render(<BlockBadge reason={null} campaignStatus="draft" />);
    expect(container).toBeEmptyDOMElement();
  });
});
