/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type LandingCityResult, type LandingHandlers } from '@/contracts';
import { gainesvilleLandingCity, homePageData } from '@/fixtures';
import { distanceMiles, type LatLng } from '@/shared/geo';
import messages from '../../../messages/en/ui';
import { LandingHandlersProvider } from './landing-handlers';
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
      <LandingProvider initialCity={{ market: homePageData.market, map: homePageData.map }} initialLocation={location}>
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

/** The page drawn for Austin, with a way to load another city (a stand-in for the route's server action). */
function showCities(handlers: LandingHandlers, options: { location?: LatLng; cityPicked?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LandingHandlersProvider handlers={handlers}>
        <LandingProvider initialCity={{ market: homePageData.market, map: homePageData.map }} initialLocation={options.location} cityPicked={options.cityPicked}>
          <MapSection data={homePageData} mapMode="static" />
        </LandingProvider>
      </LandingHandlersProvider>
    </NextIntlClientProvider>,
  );
}

const austinCity = { market: homePageData.market, map: homePageData.map };
const loads = (results: Record<string, LandingCityResult>) =>
  vi.fn(async ({ slug }: { slug: string; remember: boolean }): Promise<LandingCityResult> => results[slug] ?? { ok: false, code: 'not_found' });
/** A visitor in Gainesville's Duckpond. */
const inGainesville: LatLng = { lat: 29.6577, lng: -82.3195 };

describe('one city at a time (owner, 2026-11-23: "If I am in Austin, you are still showing Gainesville")', () => {
  it('a visitor whose location falls in another open city sees that city, and one press goes back (remembered)', async () => {
    const onLoadCity = loads({ gainesville: { ok: true, city: gainesvilleLandingCity }, austin: { ok: true, city: austinCity } });
    showCities({ onLoadCity }, { location: inGainesville });
    expect(await screen.findByText(t('cityMoved', { city: 'Gainesville' }))).toBeInTheDocument();
    // Only the city's slug was asked for, and not remembered (the location found it, the visitor didn't pick it).
    expect(onLoadCity).toHaveBeenCalledWith({ slug: 'gainesville', remember: false });
    expect(screen.getByRole('button', { name: t('cityButton', { city: t('cityName', { city: 'Gainesville', state: 'FL' }) }) })).toBeInTheDocument();
    // Its tasks, nearest first.
    const near = hrefs(screen.getByRole('list', { name: t('listNearYou') }));
    expect(near[0]).toBe(routes.publicTask(gainesvilleLandingCity.map.pins[0]!.slug));
    expect(near).toHaveLength(gainesvilleLandingCity.map.pins.length);

    fireEvent.click(screen.getByRole('button', { name: t('cityBack', { city: 'Austin' }) }));
    await waitFor(() => expect(onLoadCity).toHaveBeenLastCalledWith({ slug: 'austin', remember: true }));
    // Back in Austin, newest first: the visitor is in another city, so distances from them mean nothing here.
    expect(await screen.findByRole('list', { name: t('listNewest') })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(t('cityMoved', { city: 'Gainesville' }))).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: t('cityButton', { city: t('cityName', { city: 'Austin', state: 'TX' }) }) })).toBeInTheDocument();
  });

  it('a city the visitor picked before stays, wherever they are', async () => {
    const onLoadCity = loads({ gainesville: { ok: true, city: gainesvilleLandingCity } });
    showCities({ onLoadCity }, { location: inGainesville, cityPicked: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onLoadCity).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: t('cityButton', { city: t('cityName', { city: 'Austin', state: 'TX' }) }) })).toBeInTheDocument();
  });

  it('far from every city: how far this one is, and the nearest open city to show instead', async () => {
    const onLoadCity = loads({ houston: { ok: false, code: 'unavailable' } });
    // Baton Rouge: no city there; Houston is nearer than Austin.
    showCities({ onLoadCity }, { location: { lat: 30.4515, lng: -91.1871 } });
    expect(screen.getByText(/^You're [\d,]+ mi from Austin: we're opening city by city\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^The nearest open city is Houston, [\d,]+ mi away\.$/)).toBeInTheDocument();
    expect(onLoadCity).not.toHaveBeenCalled();
    // Houston can't be loaded just now: the card says so, with a way to try again.
    fireEvent.click(screen.getByRole('button', { name: t('outsideShow', { city: 'Houston' }) }));
    expect(await screen.findByText(t('cityFailed', { city: 'Houston' }))).toBeInTheDocument();
    expect(onLoadCity).toHaveBeenCalledWith({ slug: 'houston', remember: true });
    expect(screen.getByRole('button', { name: t('cityRetry') })).toBeInTheDocument();
  });

  it('the switcher lists every open city with its status; a pick moves the map there', async () => {
    const onLoadCity = loads({ gainesville: { ok: true, city: gainesvilleLandingCity } });
    showCities({ onLoadCity });
    fireEvent.click(screen.getByRole('button', { name: t('cityButton', { city: t('cityName', { city: 'Austin', state: 'TX' }) }) }));
    const list = await screen.findByRole('group', { name: t('citiesTitle') });
    const rows = within(list).getAllByRole('button');
    // Open now first, then opening soon, each alphabetical.
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Gainesville, FL'),
      expect.stringContaining('Austin, TX'),
      expect.stringContaining('Houston, TX'),
    ]);
    expect(rows[0]).toHaveTextContent(t('cityOpen'));
    expect(rows[1]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(rows[0]!);
    await waitFor(() => expect(onLoadCity).toHaveBeenCalledWith({ slug: 'gainesville', remember: true }));
    expect(await screen.findByRole('button', { name: t('cityButton', { city: t('cityName', { city: 'Gainesville', state: 'FL' }) }) })).toBeInTheDocument();
    // A pick isn't a move by location: no note about it.
    expect(screen.queryByText(t('cityMoved', { city: 'Gainesville' }))).not.toBeInTheDocument();
  });
});
