/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { routes } from '@/contracts/routes';
import en from '../../../../messages/en/ui';
import es from '../../../../messages/es/ui';
import { NotFoundScreen } from './not-found-screen';

afterEach(cleanup);

describe('NotFoundScreen (sweep 2026-11-18)', () => {
  it('on the public site: says so, offers the main doors, and a line for an old link to a city we have not opened', () => {
    render(<NextIntlClientProvider locale="en" messages={en}><NotFoundScreen /></NextIntlClientProvider>);
    expect(screen.getByRole('heading', { level: 1, name: 'This page could not be found' })).toBeTruthy();
    const ways = within(screen.getByRole('navigation', { name: 'Where to go next' }));
    expect(ways.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([routes.home(), routes.cities(), routes.waitlist(), routes.help()]);
    expect(ways.getByRole('link', { name: /^Home/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See where we are' }).getAttribute('href')).toBe(routes.cities());
    // Never names a city: the line is for any city we haven't opened.
    expect(document.body.textContent).not.toMatch(/Austin|Gainesville/);
  });

  it("in the app: the app's ways on, and no city line", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><NotFoundScreen place="app" /></NextIntlClientProvider>);
    const ways = within(screen.getByRole('navigation', { name: 'Where to go next' }));
    expect(ways.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([routes.app.home(), routes.app.bookings(), routes.app.support(), routes.help()]);
    expect(screen.queryByRole('link', { name: 'See where we are' })).toBeNull();
  });

  it('in Spanish, with the links kept in Spanish', () => {
    render(<NextIntlClientProvider locale="es" messages={es}><NotFoundScreen /></NextIntlClientProvider>);
    expect(screen.getByRole('heading', { level: 1, name: 'No pudimos encontrar esta página' })).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Adónde ir ahora' })).getByRole('link', { name: /^Ciudades/ }).getAttribute('href')).toBe('/es/cities');
  });
});
