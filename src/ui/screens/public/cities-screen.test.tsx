/** @vitest-environment jsdom */
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { citiesEmptyPageData, citiesPageData, floridaCitiesPageData, wyomingCitiesPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CitiesScreen, StateCitiesScreen } from './cities-screen';

afterEach(cleanup);
const renderScreen = (element: ReactElement) => render(<NextIntlClientProvider locale="en" messages={messages}>{element}</NextIntlClientProvider>);

describe('CitiesScreen', () => {
  it('lists where we are, where we go next with real counts, and every state', () => {
    renderScreen(<CitiesScreen data={citiesPageData} />);
    expect(screen.getByRole('heading', { level: 1, name: 'TasksNearMe, city by city' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tasks and helpers in Austin/ }).getAttribute('href')).toBe('/austin');
    expect(screen.getByText('Opening soon')).toBeTruthy();
    expect(screen.getByText('21 people waiting')).toBeTruthy();
    expect(screen.getByText('4 helpers ready')).toBeTruthy();
    const states = screen.getByRole('region', { name: 'Every state' });
    expect(within(states).getByRole('link', { name: /Texas\s*1 city open/ }).getAttribute('href')).toBe('/cities/texas');
    expect(within(states).getByRole('link', { name: /Florida\s*14 people waiting/ }).getAttribute('href')).toBe('/cities/florida');
    expect(within(states).getByRole('link', { name: /Wyoming\s*Not yet/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Join the waitlist' }).getAttribute('href')).toBe('/waitlist');
  });

  it('says so when nothing is open and nobody has asked yet', () => {
    renderScreen(<CitiesScreen data={citiesEmptyPageData} />);
    expect(screen.getByText('No city is open yet. The first one opens soon.')).toBeTruthy();
    expect(screen.getByText(/No one has asked for a city here yet/)).toBeTruthy();
  });
});

describe('StateCitiesScreen', () => {
  it("shows the state's cities people asked for and links back and on", () => {
    renderScreen(<StateCitiesScreen data={floridaCitiesPageData} />);
    expect(screen.getByRole('heading', { level: 1, name: 'TasksNearMe in Florida' })).toBeTruthy();
    expect(screen.getByText('Gainesville, FL')).toBeTruthy();
    expect(screen.getByRole('link', { name: /All states/ }).getAttribute('href')).toBe('/cities');
    expect(within(screen.getByRole('region', { name: 'Other states' })).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/cities/texas', '/cities/california']);
  });

  it('works for a state with nothing yet', () => {
    renderScreen(<StateCitiesScreen data={wyomingCitiesPageData} />);
    expect(screen.getByRole('heading', { level: 1, name: 'TasksNearMe in Wyoming' })).toBeTruthy();
    expect(screen.getByText(/No one has asked for a city here yet/)).toBeTruthy();
  });
});
