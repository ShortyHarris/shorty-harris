import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WizardRolloutToggle } from './WizardRolloutToggle';

const setSandboxOnly = vi.fn();
let sandboxOnly: boolean | null = true;

vi.mock('../hooks/useWizardRollout', () => ({
  useWizardRollout: () => ({ sandboxOnly, loading: false, error: null, setSandboxOnly }),
}));

describe('WizardRolloutToggle', () => {
  beforeEach(() => {
    setSandboxOnly.mockReset().mockResolvedValue({ error: null });
  });

  it('asks before giving the wizard to every client', async () => {
    sandboxOnly = true;
    const onChanged = vi.fn();
    render(<WizardRolloutToggle onChanged={onChanged} />);
    expect(screen.getByText(/sandbox accounts only/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch'));
    expect(setSandboxOnly).not.toHaveBeenCalled();
    expect(screen.getByText('Give the campaign wizard to every client?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Give it to everyone' }));
    await waitFor(() => expect(setSandboxOnly).toHaveBeenCalledWith(false));
    expect(onChanged).toHaveBeenCalledWith('Campaign wizard: on for every client.');
  });

  it('cancelling the question changes nothing', () => {
    sandboxOnly = true;
    render(<WizardRolloutToggle />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(setSandboxOnly).not.toHaveBeenCalled();
  });

  it('goes back to sandbox-only without asking', async () => {
    sandboxOnly = false;
    render(<WizardRolloutToggle />);
    expect(screen.getByText(/every client$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(setSandboxOnly).toHaveBeenCalledWith(true));
  });

  it('reports a refused change', async () => {
    sandboxOnly = false;
    setSandboxOnly.mockResolvedValue({ error: 'Only an admin can change this.' });
    const onChanged = vi.fn();
    render(<WizardRolloutToggle onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.stringContaining('Only an admin'), 'error'));
  });
});
