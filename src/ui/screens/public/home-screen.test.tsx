/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type CategorySlug, type HomePageData } from '@/contracts';
import { austinMapAreas, austinMapPins, cleaningPublicTask, homeEmptyMapData, homeNoRewardData, homePageData, homePrelaunchData } from '@/fixtures';
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

  it('reads a request in the assistant: the kind of help, a title, the typical price, then on to posting with those words', () => {
    show();
    const input = screen.getByRole('textbox', { name: t('hero.askPrompt') });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'I need help to assemble an IKEA desk' } });
    const panel = screen.getByRole('region', { name: t('assistant.panelLabel') });
    expect(within(panel).getByRole('button', { name: t('assistant.changeCategory', { category: categoryName('furniture-assembly') }) })).toBeInTheDocument();
    expect(within(panel).getByText('“Assemble an IKEA desk”')).toBeInTheDocument();
    const furniture = homePageData.categories.find((category) => category.slug === 'furniture-assembly')!;
    expect(within(panel).getByText(t('categories.range', { low: formatMoney(furniture.priceGuidance.lowCents), high: formatMoney(furniture.priceGuidance.highCents) }), { exact: false })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: t('assistant.continue') })).toHaveAttribute('href', routes.app.newTask({ category: 'furniture-assembly', describe: 'I need help to assemble an IKEA desk' }));
  });

  it('lets the visitor pick another kind of help when the assistant guesses wrong, or when nothing matches', () => {
    show();
    const input = screen.getByRole('textbox', { name: t('hero.askPrompt') });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'something for my grandmother' } });
    const panel = screen.getByRole('region', { name: t('assistant.panelLabel') });
    expect(within(panel).getByText(t('assistant.pick'))).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: categoryName('computer-help') }));
    expect(within(panel).getByRole('link', { name: t('assistant.continue') })).toHaveAttribute('href', routes.app.newTask({ category: 'computer-help', describe: 'something for my grandmother' }));
  });

  it('finds tasks in your own words on the map: "I have a truck" shows moving help', async () => {
    show();
    const map = section(`${t('map.title')} ${t('map.titleAccent')}`);
    fireEvent.change(within(map).getByPlaceholderText(t('map.smartPlaceholder')), { target: { value: 'I have a truck' } });
    const filter = within(map).getByRole('group', { name: t('map.filterLabel') });
    await waitFor(() => expect(within(filter).getByRole('button', { name: categoryName('moving-help') })).toHaveAttribute('aria-pressed', 'true'));
    expect(within(map).getByText(t('map.smartShowing', { category: categoryName('moving-help') }), { exact: false })).toBeInTheDocument();
  });

  it('builds every call to action with the route builders', () => {
    show();
    for (const link of screen.getAllByRole('link', { name: t('hero.primary') })) expect(link).toHaveAttribute('href', routes.app.newTask());
    // The hero's main call to action is the assistant's own button: it posts with whatever's typed.
    const assistant = screen.getByRole('search', { name: t('assistant.label') });
    expect(assistant).toHaveAttribute('action', routes.app.newTask());
    expect(within(assistant).getByRole('button', { name: t('hero.primary') })).toHaveAttribute('type', 'submit');
    expect(screen.getAllByRole('link', { name: t('hero.secondary') })[0]).toHaveAttribute('href', routes.becomeAHelper());
    expect(screen.getByRole('link', { name: t('map.browseAll') })).toHaveAttribute('href', routes.taskBoard(homePageData.market.slug));
    expect(screen.getByRole('link', { name: t('pricing.link') })).toHaveAttribute('href', routes.pricing());
  });

  const hero = () => document.querySelector<HTMLElement>('section[aria-labelledby="hero-title"]')!;

  it('shows the newest open task in the hero, linking to its page, and narrows it to a picked neighborhood', async () => {
    show();
    const newest = austinMapPins[0]!;
    const newestName = new RegExp(newest.title.replace(/[()]/g, '\\$&'));
    expect(within(hero()).getByRole('link', { name: newestName })).toHaveAttribute('href', routes.publicTask(newest.slug));

    // The market line is the neighborhood picker; a pick names the neighborhood and narrows the line.
    const everywhere = t('hero.area.everywhere', { market: homePageData.market.name });
    fireEvent.click(within(hero()).getByRole('button', { name: new RegExp(t('hero.area.button', { area: everywhere })) }));
    fireEvent.click(screen.getByRole('button', { name: 'Hyde Park' }));
    expect(within(hero()).getByRole('button', { name: new RegExp(t('hero.area.button', { area: 'Hyde Park' })) })).toBeInTheDocument();
    expect(within(hero()).getByRole('link', { name: new RegExp(cleaningPublicTask.title) })).toHaveAttribute('href', routes.publicTask(cleaningPublicTask.slug));
    // The line that leaves slides out first.
    await waitFor(() => expect(within(hero()).queryByRole('link', { name: newestName })).not.toBeInTheDocument());
    expect(austinMapAreas.some((area) => area.name === 'Hyde Park')).toBe(true);
  });

  it('switches to helpers: their headline, "I can…", matching open tasks, the reward, and See these tasks', () => {
    show();
    fireEvent.click(within(hero()).getByRole('button', { name: new RegExp(`^${t('hero.audience.helper')}`) }));
    expect(text(screen.getByRole('heading', { level: 1 }))).toBe(`${t('hero.helperMode.line1')} ${t('hero.helperMode.line2')} ${t('hero.helperMode.line3Vivid')}${t('hero.helperMode.line3Rest')}`);
    const input = within(hero()).getByRole('textbox', { name: new RegExp(t('assistant.helperPrompt')) });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'I have a truck' } });
    const panel = screen.getByRole('region', { name: t('assistant.helperPanelLabel') });
    const moving = austinMapPins.filter((pin) => pin.categorySlug === 'moving-help').length;
    // Shown in the panel, and said once for screen readers (the status stays mounted beside the panel).
    const open = t('assistant.helperOpen', { count: moving, place: homePageData.market.name });
    expect(within(panel).getByText(open)).toBeInTheDocument();
    expect(within(hero()).getAllByText(open)).toHaveLength(2);
    const reward = homePageData.welcomeReward!;
    expect(within(panel).getByText(t('hero.reward.badge', { amount: formatMoney(reward.amountCents), limit: reward.cohortLimit }))).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: t('assistant.helperBecome') })).toHaveAttribute('href', routes.becomeAHelper());
    fireEvent.click(within(panel).getByRole('button', { name: t('assistant.helperSee') }));
    const filter = screen.getByRole('group', { name: t('map.filterLabel') });
    expect(within(filter).getByRole('button', { name: categoryName('moving-help') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains each promise, and counts the verified helpers when there are some', () => {
    show();
    const chips = within(hero()).getByRole('list', { name: t('hero.trustChips.label') });
    fireEvent.click(within(chips).getByRole('button', { name: t('hero.trustChips.verifiedCount', { count: homePageData.helpers.verified }) }));
    // The same promise is spelled out further down the page; this is the chip's own explanation.
    const popover = screen.getByRole('dialog');
    expect(within(popover).getByText(t('hero.trustChips.verifiedBody'))).toBeInTheDocument();
    expect(within(popover).getByText(t('hero.trustChips.openThisWeek', { count: homePageData.helpers.openThisWeek }))).toBeInTheDocument();
    expect(within(popover).getByRole('link', { name: t('hero.trustChips.learnTrust') })).toHaveAttribute('href', routes.trustAndSafety());
    cleanup();

    show(homePrelaunchData);
    expect(within(hero()).getByRole('button', { name: t('hero.trustChips.verified') })).toBeInTheDocument();
  });

  it('offers "Draft it with AI" only when the market allows it, carrying the words and the kind of help', () => {
    show();
    const ask = () => {
      const input = screen.getByRole('textbox', { name: t('hero.askPrompt') });
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'I need help to assemble an IKEA desk' } });
      return screen.getByRole('region', { name: t('assistant.panelLabel') });
    };
    expect(within(ask()).getByRole('link', { name: t('assistant.aiDraft') })).toHaveAttribute(
      'href',
      routes.app.newTask({ category: 'furniture-assembly', describe: 'I need help to assemble an IKEA desk', ai: true }),
    );
    cleanup();

    show(homePrelaunchData);
    expect(within(ask()).queryByRole('link', { name: t('assistant.aiDraft') })).not.toBeInTheDocument();
  });

  it("suggests examples for the season (it's fall in the fixture)", () => {
    show();
    const input = screen.getByRole('textbox', { name: t('hero.askPrompt') });
    expect(input).toHaveAttribute('placeholder', expect.stringMatching(new RegExp(Object.values(messages.landing.hero.seasons.fall).join('|'))));
  });
});
