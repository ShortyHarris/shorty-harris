import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimezoneSelect } from './TimezoneSelect';

function open() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Send timezone' }));
}

describe('TimezoneSelect', () => {
  it('shows the selected zone as "City (UTC±hh:mm)"', () => {
    render(<TimezoneSelect value="Europe/Prague" onValueChange={() => {}} />);
    expect(screen.getByRole('combobox').textContent).toMatch(/^Prague \(UTC\+0[12]:00\)$/);
  });

  it('filters the full list as you type and selects with a click', () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="America/Chicago" onValueChange={onChange} />);
    open();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(300);

    fireEvent.change(screen.getByLabelText('Search send timezone'), { target: { value: 'Prag' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Prague');

    fireEvent.click(options[0]);
    expect(onChange).toHaveBeenCalledWith('Europe/Prague');
  });

  it('lists suggested zones first under "Suggested"', () => {
    render(
      <TimezoneSelect
        value="America/Chicago"
        onValueChange={() => {}}
        suggested={['Australia/Sydney', 'Australia/Perth']}
      />,
    );
    open();
    expect(screen.getByText('Suggested')).toBeTruthy();
    const first = screen.getAllByRole('option').slice(0, 2).map((o) => o.textContent);
    expect(first[0]).toContain('Sydney');
    expect(first[1]).toContain('Perth');
  });

  it('keeps a saved zone that is not in the list as a selectable option', () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="Mars/Olympus_Mons" onValueChange={onChange} />);
    open();
    expect(screen.getByText('Current setting')).toBeTruthy();
    const current = screen.getAllByRole('option')[0];
    expect(current.getAttribute('aria-selected')).toBe('true');
    expect(current.textContent).toContain('Olympus Mons');
  });

  it('selects the highlighted match with Enter', () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="America/Chicago" onValueChange={onChange} />);
    open();
    const search = screen.getByLabelText('Search send timezone');
    fireEvent.change(search, { target: { value: 'nairobi' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Africa/Nairobi');
  });

  it('matches the IANA path as well as the city', () => {
    render(<TimezoneSelect value="America/Chicago" onValueChange={() => {}} />);
    open();
    fireEvent.change(screen.getByLabelText('Search send timezone'), { target: { value: 'america/new_y' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('New York');
  });

  it('says so when nothing matches', () => {
    render(<TimezoneSelect value="America/Chicago" onValueChange={() => {}} />);
    open();
    fireEvent.change(screen.getByLabelText('Search send timezone'), { target: { value: 'zzzzqq' } });
    expect(screen.getByText('No matching timezone.')).toBeTruthy();
  });
});
