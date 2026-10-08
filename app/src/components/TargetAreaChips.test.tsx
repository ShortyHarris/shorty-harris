import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TargetAreaChips } from './TargetAreaChips';
import type { TargetArea } from '../lib/targetAreas';

const areas: TargetArea[] = [
  { mode: 'text', label: 'Peoria, IL' },
  { mode: 'radius', label: 'Normal, IL', lat: '40.5', lng: '-89', radius_km: '40.23' },
];

describe('TargetAreaChips', () => {
  it('shows every area, with a pin only on radius areas', () => {
    const { container } = render(<TargetAreaChips areas={areas} />);
    expect(screen.getByText('Peoria, IL')).toBeTruthy();
    expect(screen.getByText('Within 25 miles of Normal, IL')).toBeTruthy();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('radiusOnly hides plain places so text-only campaigns render nothing', () => {
    render(<TargetAreaChips areas={areas} radiusOnly />);
    expect(screen.queryByText('Peoria, IL')).toBeNull();
    expect(screen.getByText('Within 25 miles of Normal, IL')).toBeTruthy();

    const { container } = render(<TargetAreaChips areas={[areas[0]]} radiusOnly />);
    expect(container.firstChild).toBeNull();
  });
});
