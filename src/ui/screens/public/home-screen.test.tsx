/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type CategorySlug, type HomePageData } from '@/contracts';
import { homeEmptyMapData, homeNoRewardData, homePageData } from '@/fixtures';
import { formatMoney } from '@/shared/format';
import { distanceMiles, type LatLng } from '@/shared/geo';
import messages from '../../../../messages/en/ui';
import { HomeScreen } from './home-screen';

const now = '2026-11-17T15:00:00.000Z';
const t = createTranslator({ locale: 'en', messages, namespace: 'landing' });
const categoryName = createTranslator({ locale: 'en', messages, namespace: 'helperCard.categories' });
/** A visitor in Mueller (inside the service area) and one in Dallas (outside it). */
const inMueller: LatLng = { lat: 30.2989, lng: -97.7064 };
const inDallas: LatLng = { lat: 32.7767, lng: -96.797 };

beforeEach(() => {
  // The visitor asked for reduced motion, so every section renders in its final state.
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function show(data: HomePageData = homePageData, options: { location?: LatLng; category?: CategorySlug } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HomeScreen data={data} now={now} mapMode="static" initialLocation={options.location} initialCategory={options.category} />
    </NextIntlClientProvider>,
  );
}

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
const section = (title: string) => {
  const heading = screen.getAllByRole('heading', { level: 2 }).find((element) => text(element) === title);
  if (!heading) throw new Error(`No section titled "${title}"`);
  return heading.closest('section') as HTMLElement;
};

describe('HomeScreen (the landing page)', () => {
  it('has one h1 that reads as words, and a titled section for each part of the page', () => {
    show();
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(text(h1[0]!)).toBe(`${t('hero.line1')} ${t('hero.line2')} ${t('hero.line3Vivid')}${t('hero.line3Rest')}`);
    const titles = screen.getAllByRole('heading', { level: 2 }).map(text);
    for (const title of [
      `${t('map.title')} ${t('map.titleAccent')}`,
      `${t('categories.title')} ${t('categories.titleAccent')}`,
      `${t('steps.title')} ${t('steps.titleAccent')}`,
      `${t('pricing.title')} ${t('pricing.titleAccent')}`,
      `${t('trust.title')} ${t('trust.titleAccent')}`,
      `${t('helpers.title')} ${t('helpers.titleAccent')}`,
      t('coverage.title', { market: homePageData.market.name }),
      t('faq.title'),
      `${t('closing.title')} ${t('closing.titleAccent')}`,
    ]) {
      expect(titles).toContain(title);
    }
  });

  it('shows the fee example exactly as supplied', () => {
    show();
    const fee = homePageData.feeExample;
    const pricing = within(section(`${t('pricing.title')} ${t('pricing.titleAccent')}`));
    expect(pricing.getByText(t('pricing.example', { price: formatMoney(fee.taskPriceCents) }))).toBeInTheDocument();
    // Shown (it runs to new amounts when another price is picked) and spoken, each final.
    expect(pricing.getAllByText(`+${formatMoney(fee.posterFeeCents)}`)).toHaveLength(2);
    expect(pricing.getAllByText(`−${formatMoney(fee.helperFeeCents)}`)).toHaveLength(2);
    // With reduced motion the totals never count: the shown value and the spoken one are both final.
    expect(pricing.getAllByText(formatMoney(fee.posterTotalCents))).toHaveLength(2);
    expect(pricing.getAllByText(formatMoney(fee.helperEarningsCents))).toHaveLength(2);
  });

  it('shows the founding helper reward only when there is one', () => {
    show();
    const reward = homePageData.welcomeReward!;
    expect(screen.getByText(t('helpers.rewardAmount', { amount: formatMoney(reward.amountCents) }))).toBeInTheDocument();
    expect(screen.getByText(t('helpers.rewardSpots', { claimed: reward.spotsClaimed, limit: reward.cohortLimit }))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('helpers.rewardTerms') })).toHaveAttribute('href', routes.legal('rewards-terms'));
    cleanup();

    show(homeNoRewardData);
    expect(screen.queryByText(t('helpers.rewardTitle'))).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: t('helpers.rewardTerms') })).not.toBeInTheDocument();
  });

  it('lists the newest open tasks beside the map, each linking to its public page', () => {
    show();
    const list = screen.getByRole('list', { name: t('map.listNewest') });
    const hrefs = within(list).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(homePageData.map.pins.slice(0, hrefs.length).map((pin) => routes.publicTask(pin.slug)));
    expect(hrefs.length).toBeGreaterThan(0);
  });

  it('sorts the list by distance once the visitor shares a location', () => {
    show(homePageData, { location: inMueller });
    const list = screen.getByRole('list', { name: t('map.listNearYou') });
    const hrefs = within(list).getAllByRole('link').map((link) => link.getAttribute('href'));
    const nearest = [...homePageData.map.pins].sort((a, b) => distanceMiles(inMueller, a.point) - distanceMiles(inMueller, b.point));
    expect(hrefs).toEqual(nearest.slice(0, hrefs.length).map((pin) => routes.publicTask(pin.slug)));
    expect(screen.queryByText(t('map.outside'))).not.toBeInTheDocument();
  });

  it('says so when the visitor is outside the service area, and offers the waitlist', () => {
    show(homePageData, { location: inDallas });
    expect(screen.getByText(t('map.outside'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('map.waitlist') })).toHaveAttribute('href', routes.waitlist());
  });

  it('filters the map and its list by category', async () => {
    show();
    const chip = screen.getByRole('button', { name: categoryName('yard-cleanup') });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    const list = screen.getByRole('list', { name: t('map.listNewest') });
    const yard = homePageData.map.pins.filter((pin) => pin.categorySlug === 'yard-cleanup');
    // Rows of other categories fade out first.
    await waitFor(() => expect(within(list).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(yard.slice(0, 7).map((pin) => routes.publicTask(pin.slug))));
    expect(screen.getByText(t('map.countCategory', { category: categoryName('yard-cleanup'), count: yard.length }))).toBeInTheDocument();
  });

  it("keeps a clicked filter while another category is only pointed at", () => {
    show();
    const filter = screen.getByRole('group', { name: t('map.filterLabel') });
    fireEvent.click(within(filter).getByRole('button', { name: categoryName('yard-cleanup') }));
    const card = screen.getAllByRole('link').find((link) => link.getAttribute('href') === routes.category('light-cleaning'))!;
    fireEvent.pointerEnter(card);
    fireEvent.pointerLeave(card);
    expect(within(filter).getByRole('button', { name: categoryName('yard-cleanup') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('invites the first post when there are no open tasks', () => {
    show(homeEmptyMapData);
    expect(screen.getByText(t('map.emptyTitle'))).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: t('map.listNewest') })).not.toBeInTheDocument();
  });

  it('never shows an address, even with the visitor located', () => {
    const { container } = show(homePageData, { location: inMueller });
    expect(container.textContent).not.toMatch(/\d+ (Example|Sample) (Lane|Street|Road)/);
  });

  it('builds every call to action with the route builders', () => {
    show();
    for (const link of screen.getAllByRole('link', { name: t('hero.primary') })) expect(link).toHaveAttribute('href', routes.app.newTask());
    expect(screen.getAllByRole('link', { name: t('hero.secondary') })[0]).toHaveAttribute('href', routes.becomeAHelper());
    expect(screen.getByRole('link', { name: t('map.browseAll') })).toHaveAttribute('href', routes.taskBoard(homePageData.market.slug));
    expect(screen.getByRole('link', { name: t('pricing.link') })).toHaveAttribute('href', routes.pricing());
  });
});
