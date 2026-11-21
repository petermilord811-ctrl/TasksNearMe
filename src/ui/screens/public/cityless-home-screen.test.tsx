/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type WaitlistInput } from '@/contracts';
import { citylessHomeData, fakeHandler } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CitylessHomeScreen } from './cityless-home-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));

const t = createTranslator({ locale: 'en', messages, namespace: 'landing.cityless' });
const waitlist = createTranslator({ locale: 'en', messages, namespace: 'waitlist' });

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('reduce'), media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CitylessHomeScreen data={citylessHomeData} handlers={{ onJoin: fakeHandler<WaitlistInput>({ ok: true, code: 'submitted' }) }} />
    </NextIntlClientProvider>,
  );
}

describe('the home page while its city isn’t open', () => {
  it('keeps the promise, with no city’s counts or map', () => {
    show();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Everyday tasks, done by people nearby.');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.getElementById('tasks-near-you')).toBeNull();
    const hero = screen.getByRole('region', { name: 'Everyday tasks, done by people nearby.' });
    expect(within(hero).getByRole('link', { name: t('joinCta') }).getAttribute('href')).toBe('#waitlist');
    expect(within(hero).getByRole('link', { name: t('helperCta') }).getAttribute('href')).toBe(routes.becomeAHelper());
    expect(document.getElementById('waitlist')).not.toBeNull();
  });

  it('lists every city with its status, open ones first; paused ones have no page to link to', () => {
    show();
    const cities = within(screen.getByRole('region', { name: t('citiesTitle') })).getAllByRole('listitem');
    expect(cities.map((city) => city.textContent)).toEqual(['Austin, TXOpen now', 'Tampa, FLOpening soon', 'Gainesville, FLPaused for now']);
    expect(within(cities[0]!).getByRole('link', { name: 'See Austin, TX' }).getAttribute('href')).toBe(routes.market('austin'));
    expect(within(cities[1]!).getByRole('link', { name: 'See Tampa, FL' }).getAttribute('href')).toBe(routes.market('tampa'));
    expect(within(cities[2]!).queryByRole('link')).toBeNull();
  });

  it('takes the waitlist sign-up here, under its own heading, without repeating the open cities', async () => {
    show();
    const section = screen.getByRole('region', { name: t('waitlistTitle') });
    expect(within(section).getByRole('heading', { level: 2, name: t('waitlistTitle') })).toBeTruthy();
    expect(within(section).queryByRole('heading', { name: waitlist('marketsTitle') })).toBeNull();
    // The cities people ask for most, and the helpers' gift card, as on the waitlist page.
    expect(within(section).getByRole('heading', { name: waitlist('comingNext.title') })).toBeTruthy();
    expect(within(section).getByRole('button', { name: waitlist('join') })).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: waitlist('join') }));
    expect((await within(section).findAllByRole('status')).length).toBeGreaterThan(0);
  });
});
