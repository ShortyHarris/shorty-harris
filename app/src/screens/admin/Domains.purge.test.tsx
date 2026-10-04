import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurgeModal } from './Domains';
import { purgeBlacklistedProspects } from '../../hooks/useBlacklistedDomains';

vi.mock('../../hooks/useBlacklistedDomains', () => ({
  purgeBlacklistedProspects: vi.fn(),
}));

const mockedPurge = purgeBlacklistedProspects as unknown as ReturnType<typeof vi.fn>;

describe('PurgeModal dry-run gate', () => {
  beforeEach(() => {
    mockedPurge.mockReset();
  });

  it('calls the dry run (p_confirm=false) before any destructive call is possible', async () => {
    mockedPurge.mockResolvedValueOnce({
      data: { dry_run: true, would_delete: 3, of_which_already_emailed: 0, sample: [] },
      error: null,
    });

    render(<PurgeModal clients={[]} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));

    await waitFor(() => expect(mockedPurge).toHaveBeenCalledTimes(1));
    expect(mockedPurge).toHaveBeenNthCalledWith(1, null, false);

    // The destructive confirm button only appears after the dry run result lands.
    expect(await screen.findByRole('button', { name: /delete 3 prospect/i })).toBeInTheDocument();
  });

  it('shows the dry-run count and only fires the confirm call (p_confirm=true) after the user clicks delete', async () => {
    mockedPurge.mockResolvedValueOnce({
      data: { dry_run: true, would_delete: 5, of_which_already_emailed: 2, sample: [] },
      error: null,
    });
    mockedPurge.mockResolvedValueOnce({
      data: { dry_run: false, deleted: 5, of_which_had_been_emailed: 2 },
      error: null,
    });

    render(<PurgeModal clients={[]} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));
    const confirmBtn = await screen.findByRole('button', { name: /delete 5 prospect/i });

    // Displayed count comes straight from the dry run, before any deletion happened.
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(mockedPurge).toHaveBeenCalledTimes(1);

    await userEvent.click(confirmBtn);

    await waitFor(() => expect(mockedPurge).toHaveBeenCalledTimes(2));
    expect(mockedPurge).toHaveBeenNthCalledWith(2, null, true);
    expect(await screen.findByRole('button', { name: /^done$/i })).toBeInTheDocument();
  });

  it('has no path to the confirm RPC without a dry run first — the confirm button does not exist before one runs', () => {
    render(<PurgeModal clients={[]} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /delete \d+ prospect/i })).not.toBeInTheDocument();
    expect(mockedPurge).not.toHaveBeenCalled();
  });
});
