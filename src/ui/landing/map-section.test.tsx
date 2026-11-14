/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@/contracts';
import { homePageData } from '@/fixtures';
import { distanceMiles, type LatLng } from '@/shared/geo';
import messages from '../../../messages/en/ui';
import { LandingProvider } from './landing-state';
import { MapSection } from './map-section';
import { shownAmountCents } from './map/map-math';
import { pinPrice } from './map/pin-card';

const t = createTranslator({ locale: 'en', messages, namespace: 'landing.map' });
const category = createTranslator({ locale: 'en', messages, namespace: 'helperCard.categories' });
/** A visitor in Mueller. */
const inMueller: LatLng = { lat: 30.2989, lng: -97.7064 };
const pins = homePageData.map.pins;

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function show(location?: LatLng) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LandingProvider initialLocation={location}>
        <MapSection data={homePageData} mapMode="static" />
      </LandingProvider>
    </NextIntlClientProvider>,
  );
}

const hrefs = (list: HTMLElement) => within(list).getAllByRole('link').map((link) => link.getAttribute('href'));

describe('the map explorer', () => {
  it('orders the list newest first, or by the lowest shown price', () => {
    show();
    expect(hrefs(screen.getByRole('list', { name: t('listNewest') }))).toEqual(pins.slice(0, 7).map((pin) => routes.publicTask(pin.slug)));
    fireEvent.change(screen.getByRole('combobox', { name: t('sortLabel') }), { target: { value: 'price' } });
    const byPrice = [...pins].map((pin, index) => ({ pin, index })).sort((a, b) => shownAmountCents(a.pin) - shownAmountCents(b.pin) || a.index - b.index);
    expect(hrefs(screen.getByRole('list', { name: t('listByPrice') }))).toEqual(byPrice.slice(0, 7).map(({ pin }) => routes.publicTask(pin.slug)));
  });

  it('can only sort by distance once the visitor shares a location, and then does so by default', () => {
    show();
    expect(within(screen.getByRole('combobox', { name: t('sortLabel') })).getByRole('option', { name: t('sortNearest') })).toBeDisabled();
    expect(screen.queryByRole('group', { name: t('withinLabel') })).not.toBeInTheDocument();
    cleanup();

    show(inMueller);
    expect(screen.getByRole('list', { name: t('listNearYou') })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: t('withinLabel') })).toBeInTheDocument();
  });

  it('narrows the list to a distance from the visitor, and says so when nothing is that close', async () => {
    show(inMueller);
    // In the fixtures, two tasks are within a mile of Mueller (the desk and the kitchen), and no yard cleanup is.
    const within1 = pins.filter((pin) => distanceMiles(inMueller, pin.point) <= 1);
    expect(within1.map((pin) => pin.id)).toEqual(['tsk_desk', 'tsk_kitchen_map']);
    const distance = screen.getByRole('group', { name: t('withinLabel') });
    fireEvent.click(within(distance).getByRole('button', { name: t('withinMiles', { miles: 1 }) }));
    expect(within(distance).getByRole('button', { name: t('withinMiles', { miles: 1 }) })).toHaveAttribute('aria-pressed', 'true');
    expect(hrefs(screen.getByRole('list', { name: t('listNearYou') }))).toEqual(within1.map((pin) => routes.publicTask(pin.slug)));
    // The count line says how many of them the list shows.
    expect(screen.getByText((text) => text.includes(t('inView', { shown: 2, total: pins.length })))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: category('yard-cleanup') }));
    expect(screen.getByText(t('emptyWithinTitle', { miles: 1 }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('showEverything') }));
    expect(within(distance).getByRole('button', { name: t('withinAny') })).toHaveAttribute('aria-pressed', 'true');
    // The empty state leaves, then the list comes back.
    expect(within(await screen.findByRole('list', { name: t('listNearYou') })).getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('shows a task on the map from its row: the row is picked and its card opens on the drawn map', () => {
    const { container } = show();
    const first = pins[0]!;
    fireEvent.click(screen.getByRole('button', { name: t('showTaskOnMap', { title: first.title }) }));
    const list = screen.getByRole('list', { name: t('listNewest') });
    expect(within(list).getAllByRole('link')[0]!.closest('.outline-violet')).not.toBeNull();
    const card = container.querySelector('figure [aria-hidden="true"].bloom-in');
    expect(card?.textContent).toContain(first.title);
    expect(card?.textContent).toContain(t('offers', { count: first.offerCount }));
  });

  it('draws each task on the drawn map with its price', () => {
    const { container } = show();
    const drawing = container.querySelector('figure svg')!;
    const price = pinPrice(pins[0]!, (rate) => t('perHour', { rate }));
    expect(drawing.textContent).toContain(price);
    // Areas only: the drawing never names a street address.
    expect(drawing.textContent).not.toMatch(/\d+ (Example|Sample) (Lane|Street|Road)/);
  });
});
