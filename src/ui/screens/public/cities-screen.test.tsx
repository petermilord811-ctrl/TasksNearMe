/** @vitest-environment jsdom */
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { citiesEmptyPageData, citiesLivePageData, citiesPageData, floridaCitiesPageData, wyomingCitiesPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CitiesScreen, StateCitiesScreen } from './cities-screen';

afterEach(cleanup);
const renderScreen = (element: ReactElement) => render(<NextIntlClientProvider locale="en" messages={messages}>{element}</NextIntlClientProvider>);

describe('CitiesScreen', () => {
  it('lists where we are, where we go next with real counts, and every state', () => {
    renderScreen(<CitiesScreen data={citiesPageData} />);
    expect(screen.getByRole('heading', { level: 1, name: 'TasksNearMe, city by city' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tasks and helpers in Gainesville/ }).getAttribute('href')).toBe('/gainesville');
    expect(screen.getByText('Opening soon')).toBeTruthy();
    expect(screen.getAllByText('21 people waiting').length).toBeGreaterThan(0);
    expect(screen.getByText('4 helpers ready')).toBeTruthy();
    const states = screen.getByRole('region', { name: 'Every state' });
    // One vocabulary (audit H8): a pre-launch city is "opening soon", never "open".
    expect(within(states).getByRole('link', { name: /Florida\s*1 city opening soon/ }).getAttribute('href')).toBe('/cities/florida');
    expect(within(states).queryByText(/city open$/)).toBeNull();
    expect(within(states).getByRole('link', { name: /Texas\s*21 people waiting/ }).getAttribute('href')).toBe('/cities/texas');
    // States with nothing yet are folded into one list of names (audit M49).
    expect(within(states).getByText('All other states (4)')).toBeTruthy();
    expect(within(states).getByRole('link', { name: 'Wyoming' }).getAttribute('href')).toBe('/cities/wyoming');
    expect(screen.getByRole('link', { name: 'Join the waitlist' }).getAttribute('href')).toBe('/waitlist');
  });

  it('calls a live city open', () => {
    renderScreen(<CitiesScreen data={citiesLivePageData} />);
    expect(screen.getByText('Open')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Every state' })).getByRole('link', { name: /Florida\s*1 city open/ })).toBeTruthy();
  });

  it('says so when nothing is open and nobody has asked yet', () => {
    renderScreen(<CitiesScreen data={citiesEmptyPageData} />);
    expect(screen.getByText('No city is open yet. The first one opens soon.')).toBeTruthy();
    expect(screen.getByText(/No one has asked for a city here yet/)).toBeTruthy();
  });
});

describe('StateCitiesScreen', () => {
  it("shows the state's cities, the ones people asked for, and links back and on to its neighbors", () => {
    renderScreen(<StateCitiesScreen data={floridaCitiesPageData} />);
    expect(screen.getByRole('heading', { level: 1, name: 'TasksNearMe in Florida' })).toBeTruthy();
    // Worded by status: Gainesville is opening soon, so the intro never says "where we're open" (audit L26).
    expect(screen.getByText(/We're opening soon in Florida/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tasks and helpers in Gainesville/ })).toBeTruthy();
    expect(screen.getByText('Tampa, FL')).toBeTruthy();
    expect(screen.getByRole('link', { name: /All states/ }).getAttribute('href')).toBe('/cities');
    expect(within(screen.getByRole('region', { name: 'Other states' })).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/cities/alabama', '/cities/georgia', '/cities/texas']);
  });

  it('works for a state with nothing yet', () => {
    renderScreen(<StateCitiesScreen data={wyomingCitiesPageData} />);
    expect(screen.getByRole('heading', { level: 1, name: 'TasksNearMe in Wyoming' })).toBeTruthy();
    expect(screen.getByText(/We're not in Wyoming yet/)).toBeTruthy();
    expect(screen.getByText('No city in Wyoming yet.')).toBeTruthy();
    expect(screen.getByText(/No one has asked for a city here yet/)).toBeTruthy();
  });
});
