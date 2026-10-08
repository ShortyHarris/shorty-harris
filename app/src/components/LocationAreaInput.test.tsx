import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { LocationAreaInput } from './LocationAreaInput';
import { buildAreaColumns, type TargetArea } from '../lib/targetAreas';

vi.mock('./RadiusMap', () => ({
  default: ({ center, radiusKm, existing, onMove }: { center: { lat: number; lng: number }; radiusKm: number; existing: unknown[]; onMove: (a: number, b: number) => void }) => (
    <div data-testid="map" data-lat={center.lat} data-lng={center.lng} data-miles={Math.round(radiusKm / 1.60934)} data-others={existing.length}>
      <button type="button" onClick={() => onMove(48.1, 11.5)}>drop pin</button>
    </div>
  ),
}));

const geocode = vi.hoisted(() => ({
  geocodePlace: vi.fn(),
  reverseGeocode: vi.fn(),
}));
vi.mock('../lib/mapboxGeocode', () => geocode);

const PRAGUE = { label: 'Prague, Czechia', lat: '50.08', lng: '14.43' };

function Harness({ initial = [] as TargetArea[], onChange }: { initial?: TargetArea[]; onChange?: (v: TargetArea[]) => void }) {
  const [v, setV] = useState<TargetArea[]>(initial);
  return <LocationAreaInput label="Locations" values={v} onChange={(n) => { setV(n); onChange?.(n); }} maxItems={3} />;
}

async function pickPrague(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Within X miles of a point' }));
  await user.type(screen.getByPlaceholderText(/Search for a city/), 'prague{Enter}');
  await user.click(await screen.findByText(PRAGUE.label));
}

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test');
  geocode.geocodePlace.mockReset().mockResolvedValue({ data: [PRAGUE], error: null });
  geocode.reverseGeocode.mockReset().mockResolvedValue('Munich, Germany');
});

describe('LocationAreaInput map', () => {
  it('shows the map once a place is picked and saves the same TargetArea shape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await pickPrague(user);
    expect(await screen.findByTestId('map')).toHaveAttribute('data-miles', '25');
    await user.click(screen.getByRole('button', { name: /^Add "Within 25 miles/ }));
    const saved = onChange.mock.calls[0][0] as TargetArea[];
    expect(saved).toEqual([{ mode: 'radius', label: PRAGUE.label, lat: PRAGUE.lat, lng: PRAGUE.lng, radius_km: '40.23' }]);
    expect(buildAreaColumns(saved).target_areas).toEqual(saved);
  });

  it('moving the pin updates lat/lng and reverse-geocodes the label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await pickPrague(user);
    await user.click(await screen.findByText('drop pin'));
    await waitFor(() => expect(screen.getByLabelText('Label')).toHaveValue('Munich, Germany'));
    expect(screen.getByTestId('map')).toHaveAttribute('data-lat', '48.1');
    await user.click(screen.getByRole('button', { name: /^Add "Within 25 miles of Munich/ }));
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ label: 'Munich, Germany', lat: '48.100000', lng: '11.500000' });
  });

  it('keeps the label editable when reverse lookup fails', async () => {
    geocode.reverseGeocode.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<Harness />);
    await pickPrague(user);
    await user.click(await screen.findByText('drop pin'));
    expect(await screen.findByText(/Couldn't look up a name/)).toBeInTheDocument();
    const input = screen.getByLabelText('Label');
    expect(input).toHaveValue(PRAGUE.label);
    await user.clear(input);
    await user.type(input, 'My yard');
    expect(input).toHaveValue('My yard');
  });

  it('clicking a chip loads the area and saving replaces it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const existing: TargetArea[] = [
      { mode: 'radius', label: 'Brno', lat: '49.19', lng: '16.6', radius_km: '16.09' },
      { mode: 'radius', label: 'Ostrava', lat: '49.83', lng: '18.28', radius_km: '8.05' },
    ];
    render(<Harness initial={existing} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Within 10 miles of Brno/ }));
    const map = await screen.findByTestId('map');
    expect(map).toHaveAttribute('data-miles', '10');
    expect(map).toHaveAttribute('data-others', '1'); // Ostrava only; the edited area is excluded
    await user.click(screen.getByRole('button', { name: /^Update "Within 10 miles of Brno"/ }));
    const saved = onChange.mock.calls[0][0] as TargetArea[];
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ label: 'Brno', radius_km: '16.09' });
  });

  it('can still adjust an area when the list is at the cap', async () => {
    const user = userEvent.setup();
    const full: TargetArea[] = [
      { mode: 'radius', label: 'A', lat: '1', lng: '1', radius_km: '16.09' },
      { mode: 'text', label: 'B' },
      { mode: 'text', label: 'C' },
    ];
    render(<Harness initial={full} />);
    expect(screen.getByText(/reached the 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Within 10 miles of A/ }));
    expect(await screen.findByTestId('map')).toBeInTheDocument();
  });

  it('hides the map but keeps the form working without a token', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', '');
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await pickPrague(user);
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Add "Within 25 miles/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
