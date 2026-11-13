import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagInput } from './TagInput';

// The caps themselves come from the server (validate_campaign_inputs /
// suggest_campaign_inputs's `limits`), never hardcoded in this component -
// these tests just confirm TagInput enforces whatever limit it's given.

describe('TagInput caps', () => {
  it('blocks a 6th search term when maxItems=5', async () => {
    const onChange = vi.fn();
    render(
      <TagInput
        label="Search terms"
        placeholder="type a term"
        values={['a', 'b', 'c', 'd', 'e']}
        onChange={onChange}
        maxItems={5}
        capLabel="search term"
      />,
    );

    const input = screen.getByPlaceholderText(/limit reached \(5 search terms\)/i);
    expect(input).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('blocks a 4th location when maxItems=3', async () => {
    const onChange = vi.fn();
    render(
      <TagInput
        label="Target locations"
        placeholder="type a location"
        values={['Prague', 'Brno', 'Ostrava']}
        onChange={onChange}
        maxItems={3}
        capLabel="location"
      />,
    );

    expect(screen.getByPlaceholderText(/limit reached \(3 locations\)/i)).toBeDisabled();
  });

  it('allows adding up to the limit and stops exactly at it, not one past, in a single paste', async () => {
    const onChange = vi.fn();
    render(
      <TagInput
        label="Search terms"
        placeholder="type a term"
        values={['a', 'b', 'c']}
        onChange={onChange}
        maxItems={5}
        splitOn=","
      />,
    );

    // Pasting "d,e,f" and pressing Enter commits all three parts in one
    // commitDraft call - only d and e fit under the cap of 5, f is dropped.
    const input = screen.getByPlaceholderText('type a term');
    fireEvent.change(input, { target: { value: 'd,e,f' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'c', 'd', 'e']);
  });

  it('with no maxItems set, never blocks input (server-driven cap not loaded yet)', () => {
    const onChange = vi.fn();
    render(
      <TagInput
        label="Search terms"
        placeholder="type a term"
        values={['a', 'b', 'c', 'd', 'e', 'f', 'g']}
        onChange={onChange}
      />,
    );
    expect(screen.getByPlaceholderText('type a term')).not.toBeDisabled();
  });
});

describe('TagInput long lists', () => {
  const many = Array.from({ length: 21 }, (_, i) => `term ${i + 1}`);

  it('collapses past collapseAfter and expands on demand', () => {
    render(<TagInput label="Search terms" placeholder="x" values={many} onChange={() => {}} collapseAfter={8} />);
    expect(screen.getByText('term 8')).toBeInTheDocument();
    expect(screen.queryByText('term 9')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+13 more' }));
    expect(screen.getByText('term 21')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.queryByText('term 21')).not.toBeInTheDocument();
  });

  it('removes the right chip from a collapsed list', () => {
    const onChange = vi.fn();
    render(<TagInput label="Search terms" placeholder="x" values={many} onChange={onChange} collapseAfter={8} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove term 3' }));
    expect(onChange).toHaveBeenCalledWith(many.filter((t) => t !== 'term 3'));
  });

  it('offers Clear all once over the cap', () => {
    const onChange = vi.fn();
    render(<TagInput label="Search terms" placeholder="x" values={many.slice(0, 7)} onChange={onChange} maxItems={5} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('does not offer Clear all for a short list within the cap', () => {
    render(<TagInput label="Search terms" placeholder="x" values={['a', 'b']} onChange={() => {}} maxItems={5} />);
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });
});
