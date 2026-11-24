/** @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskMapBundle } from '@/contracts';
import { taskMapHelperBundle, taskMapIndoorBundle, taskMapLaterBundle, taskMapStormBundle } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { TaskMapPanel } from './task-map-panel';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/tasks/sample' }));

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  return () => vi.unstubAllGlobals();
});

/** The device's place: about a mile from the yard task's area (Crestview), or a refusal. */
function geolocation(answer: 'found' | 'denied') {
  const getCurrentPosition = vi.fn((success: PositionCallback, failure?: PositionErrorCallback) => {
    if (answer === 'found') success({ coords: { latitude: 30.3479 - 0.0145, longitude: -97.7254, accuracy: 30 } } as GeolocationPosition);
    else failure?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' } as GeolocationPositionError);
  });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

/** Rendered inside an async act, so the weather and the places (promises, as from the server) settle in it. */
async function show(map: TaskMapBundle) {
  await act(async () => {
    render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>
      <TaskMapPanel map={map} live={false} />
    </NextIntlClientProvider>);
  });
}

describe('TaskMapPanel', () => {
  it('asks before using the location, then shows drive, bike and walk times worked out on the device', async () => {
    const user = userEvent.setup();
    const ask = geolocation('found');
    await show(taskMapStormBundle);
    expect(screen.getByRole('region', { name: "Map of Crestview: the task's general area" })).toBeInTheDocument();
    expect(screen.getByText(/Your location stays on this device/)).toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(ask).toHaveBeenCalledTimes(1);
    const modes = screen.getByRole('radiogroup', { name: "How you'd get there" });
    const [drive, bike, walk] = within(modes).getAllByRole('radio');
    expect(drive).toHaveAccessibleName(/Drive/);
    expect(drive).toHaveAttribute('aria-checked', 'true');
    expect(bike).toHaveAccessibleName(/Bike/);
    expect(walk).toHaveAccessibleName(/Walk.*min.*mi/);
    await user.click(walk!);
    expect(walk).toHaveAttribute('aria-checked', 'true');
    // A radio group: one Tab stop, the arrow keys move the choice.
    expect([drive, bike, walk].map((radio) => radio!.tabIndex)).toEqual([-1, -1, 0]);
    await user.keyboard('{ArrowRight}');
    expect(drive).toHaveAttribute('aria-checked', 'true');
    expect(drive).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(walk).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/The address is somewhere in the circle/)).toBeInTheDocument();
  });

  it('says when the location is turned off', async () => {
    const user = userEvent.setup();
    geolocation('denied');
    await show(taskMapStormBundle);
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Location is turned off for this site/);
    expect(screen.queryByRole('button', { name: 'Use my location' })).not.toBeInTheDocument();
  });

  it('shows outdoor work the weather hour by hour, what it means, and what is around', async () => {
    geolocation('found');
    await show(taskMapStormBundle);
    expect(await screen.findByRole('heading', { name: 'Weather for the task' })).toBeInTheDocument();
    expect(screen.getByText('68°–70°F')).toBeInTheDocument();
    expect(screen.getByText('Thunderstorms')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Hour by hour' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/Thunderstorms are possible/)).toBeInTheDocument();
    expect(screen.getByText(/Windy: secure loose things/)).toBeInTheDocument();
    expect(screen.getByText('Forecast: National Weather Service')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Around the area' })).toBeInTheDocument();
    expect(screen.getByText('Sample Park')).toBeInTheDocument();
    expect(screen.getByText('Sample Garden Center')).toBeInTheDocument();
    expect(screen.getByText('Mostly houses')).toBeInTheDocument();
    expect(screen.getByText('4 parking lots in the area')).toBeInTheDocument();
  });

  it("starts a helper's trip from their home neighborhood, with an alert, and the tasks nearby", async () => {
    const user = userEvent.setup();
    geolocation('found');
    await show(taskMapHelperBundle);
    const from = screen.getByRole('group', { name: 'Start from' });
    expect(within(from).getByRole('button', { name: 'Home: Hyde Park' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radiogroup', { name: "How you'd get there" })).toBeInTheDocument();
    expect(screen.getByText(/From the middle of Hyde Park/)).toBeInTheDocument();
    expect(await screen.findByText('Heat Advisory')).toBeInTheDocument();
    expect(screen.getByText(/Hot work: bring water/)).toBeInTheDocument();
    expect(screen.getByText('Feels like 99°')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 more open tasks nearby' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Clear the gutters/ })).toHaveAttribute('href', '/app/find-work/tsk_near_gutter');
    expect(screen.getByText('Same day')).toBeInTheDocument();
    // Their own place instead: asked for, then the trip starts there.
    await user.click(within(from).getByRole('button', { name: 'My location' }));
    expect(within(from).getByRole('button', { name: 'My location' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/The address is somewhere in the circle/)).toBeInTheDocument();
  });

  it('keeps indoor work to the short weather, and says when the forecast is not out yet', async () => {
    await show(taskMapIndoorBundle);
    expect(await screen.findByText('64°–70°F')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Hour by hour' })).not.toBeInTheDocument();
    expect(screen.getByText('Sample Hardware')).toBeInTheDocument();
    expect(screen.getByText('No parking lots: expect street parking')).toBeInTheDocument();
    cleanup();
    await show({ ...taskMapIndoorBundle, surroundings: Promise.resolve({ status: 'found', landmarks: [], helpful: [], parkingLots: 263, source: 'osm' }) });
    expect(await screen.findByText('Plenty of parking lots nearby')).toBeInTheDocument();
    cleanup();
    await show(taskMapLaterBundle);
    expect(await screen.findByText(/The forecast reaches a week ahead/)).toBeInTheDocument();
    expect(await screen.findByText("Places around the area aren't available right now.")).toBeInTheDocument();
  });

  it('shows no weather for computer help', async () => {
    await show({ ...taskMapIndoorBundle, data: { ...taskMapIndoorBundle.data, category: 'computer-help', weatherWeight: 'none' } });
    expect(await screen.findByRole('heading', { name: 'Around the area' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Weather for the task' })).not.toBeInTheDocument();
  });

  it('opens the map large with its layers, and gives focus back on closing', async () => {
    const user = userEvent.setup();
    await show(taskMapHelperBundle);
    const open = screen.getByRole('button', { name: 'Open map' });
    await user.click(open);
    const dialog = screen.getByRole('dialog', { name: 'Crestview' });
    const layers = within(dialog).getByRole('group', { name: 'What the map shows' });
    const threeD = within(layers).getByRole('button', { name: '3D buildings' });
    expect(threeD).toHaveAttribute('aria-pressed', 'false');
    await user.click(threeD);
    expect(threeD).toHaveAttribute('aria-pressed', 'true');
    expect(within(layers).getByRole('button', { name: 'Tasks nearby' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });
});
