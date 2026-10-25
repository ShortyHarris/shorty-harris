import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CountrySelect } from './CountrySelect';

function open() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Country' }));
}

describe('CountrySelect', () => {
  it('shows the selected country name, or a placeholder when empty', () => {
    const { rerender } = render(<CountrySelect value="CZ" onValueChange={() => {}} />);
    expect(screen.getByRole('combobox').textContent).toBe('Czechia');
    rerender(<CountrySelect value="" onValueChange={() => {}} />);
    expect(screen.getByRole('combobox').textContent).toBe('Select a country');
  });

  it('lists every country, not just a few', () => {
    render(<CountrySelect value="" onValueChange={() => {}} />);
    open();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(200);
  });

  it('filters as you type and selects with a click', () => {
    const onChange = vi.fn();
    render(<CountrySelect value="" onValueChange={onChange} />);
    open();
    fireEvent.change(screen.getByLabelText('Search country'), { target: { value: 'japan' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    fireEvent.click(options[0]);
    expect(onChange).toHaveBeenCalledWith('JP');
  });

  it('keeps Other available', () => {
    const onChange = vi.fn();
    render(<CountrySelect value="" onValueChange={onChange} />);
    open();
    fireEvent.change(screen.getByLabelText('Search country'), { target: { value: 'other' } });
    fireEvent.click(screen.getAllByRole('option')[0]);
    expect(onChange).toHaveBeenCalledWith('XX');
  });

  it('keeps a saved code that is not in the list selectable', () => {
    render(<CountrySelect value="ZZ" onValueChange={() => {}} />);
    open();
    expect(screen.getByText('Current setting')).toBeTruthy();
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
  });

  it('says so when nothing matches', () => {
    render(<CountrySelect value="" onValueChange={() => {}} />);
    open();
    fireEvent.change(screen.getByLabelText('Search country'), { target: { value: 'zzzzqq' } });
    expect(screen.getByText('No matching country.')).toBeTruthy();
  });
});
