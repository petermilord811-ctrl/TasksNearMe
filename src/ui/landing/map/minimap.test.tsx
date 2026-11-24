/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { austinLandingMap, austinMapPins } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import type { MapControls } from './maplibre-view';
import { MinimapDock } from './minimap';
import type { MinimapMode } from './minimap-math';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/' }));

const t = createTranslator({ locale: 'en', messages, namespace: 'landing.map' });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The big map's handles, as stand-ins; its frame covers the middle of the city. */
function fakeControls(): MapControls & { listeners: (() => void)[] } {
  const listeners: (() => void)[] = [];
  const { lat, lng } = austinLandingMap.center;
  return {
    listeners,
    zoomBy: vi.fn(),
    resetNorth: vi.fn(),
    corners: () => [
      [lng - 0.05, lat + 0.04],
      [lng + 0.05, lat + 0.04],
      [lng + 0.05, lat - 0.04],
      [lng - 0.05, lat - 0.04],
    ],
    onMove: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
    centerOn: vi.fn(),
    panBy: vi.fn(),
    showCity: vi.fn(),
  };
}

function show(mode: MinimapMode, controls = fakeControls(), onMode = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>
      <MinimapDock
        mode={mode}
        onMode={onMode}
        map={austinLandingMap}
        pins={austinMapPins}
        controls={controls}
        litTaskId={null}
        pickedTaskId={null}
        activeCategory={null}
        selectedArea={null}
        onPickArea={vi.fn()}
        onPickTask={vi.fn()}
        market="Austin"
        timeZone="America/Chicago"
      />
    </NextIntlClientProvider>,
  );
  return { controls, onMode };
}

describe('the minimap (owner, 2026-11-24: "improve it more deeply, more functional")', () => {
  it('draws every task, says how many the big map shows and how many are outside it', async () => {
    vi.useFakeTimers();
    const { controls } = show('small');
    // The frame is drawn on the next frame.
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(document.querySelectorAll('[data-minimap-city] circle[stroke="var(--card)"]')).toHaveLength(austinMapPins.length);
    const footer = screen.getByText(/in view/);
    // Some tasks are inside the frame, some outside (Circle C is far out).
    expect(footer.textContent).toMatch(/^\d+ in view · \d+ outside the map$/);
    expect(controls.listeners.length).toBeGreaterThan(0);
  });

  it('its buttons: the whole city, bigger and smaller, and folding to a chip that opens it again', () => {
    const { controls, onMode } = show('small');
    fireEvent.click(screen.getByRole('button', { name: t('minimapFit') }));
    expect(controls.showCity).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: t('minimapBigger') }));
    expect(onMode).toHaveBeenLastCalledWith('large');
    fireEvent.click(screen.getByRole('button', { name: t('minimapFold') }));
    expect(onMode).toHaveBeenLastCalledWith('folded');
    cleanup();

    const folded = show('folded');
    expect(document.querySelector('[data-minimap]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('minimapOpen') }));
    expect(folded.onMode).toHaveBeenLastCalledWith('small');
  });

  it('with the keyboard: the arrows move the big map, + and − zoom it, Enter shows the whole city', () => {
    const { controls } = show('large');
    const drawing = screen.getByRole('group', { name: t('minimapLabel', { city: 'Austin' }) });
    fireEvent.keyDown(drawing, { key: 'ArrowLeft' });
    expect(controls.panBy).toHaveBeenLastCalledWith(-0.3, 0);
    fireEvent.keyDown(drawing, { key: 'ArrowDown' });
    expect(controls.panBy).toHaveBeenLastCalledWith(0, 0.3);
    fireEvent.keyDown(drawing, { key: '+' });
    expect(controls.zoomBy).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(drawing, { key: '-' });
    expect(controls.zoomBy).toHaveBeenLastCalledWith(-1);
    fireEvent.keyDown(drawing, { key: 'Enter' });
    expect(controls.showCity).toHaveBeenCalledTimes(1);
    // The larger size: a bigger drawing, and the button now makes it smaller.
    expect(document.querySelector('[data-minimap-city]')?.getAttribute('width')).toBe('300');
    expect(screen.getByRole('button', { name: t('minimapSmaller') })).toBeInTheDocument();
  });
});
