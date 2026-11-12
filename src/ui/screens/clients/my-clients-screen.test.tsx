/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CLIENT_ACTION_IDS, routes, type MyClientsPageData } from '@/contracts';
import { findWorkNotBookableData, myClientsData, myClientsEmptyData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { MyClientsScreen } from './my-clients-screen';

afterEach(cleanup);
const now = '2026-12-08T17:00:00.000Z';
function renderClients(data: MyClientsPageData = myClientsData) {
  return render(<NextIntlClientProvider locale="en" messages={messages}><MyClientsScreen data={data} now={now} /></NextIntlClientProvider>);
}

describe('MyClientsScreen', () => {
  it('preserves the supplied row order, prices, earnings, and booking counts', () => {
    renderClients();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(myClientsData.clients.map((row) => row.client.displayName));
    const chris = within(screen.getByRole('article', { name: 'Chris D.' }));
    expect(chris.getByText('2 bookings together')).toBeVisible();
    expect(chris.getByText('$35.00/h · about 3.5 h · 4 h cap')).toBeVisible();
    expect(chris.getByText('$126.00')).toBeVisible();
    const maya = within(screen.getByRole('article', { name: 'Maya R.' }));
    expect(maya.getByText('1 booking together')).toBeVisible();
    expect(maya.getByText('$60.00')).toBeVisible();
    expect(maya.getByText('$54.00')).toBeVisible();
  });

  it('renders only supplied proposal actions and links to the supplied booking', () => {
    renderClients();
    expect(screen.getAllByRole('link', { name: 'Propose a booking' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Propose a booking' })).toHaveAttribute('href', routes.app.bookingRebook('bkg_desk'));
    expect(within(screen.getByRole('article', { name: 'Ruth A.' })).queryByRole('link')).not.toBeInTheDocument();
    for (const id of CLIENT_ACTION_IDS) expect(messages.actions[id]).toBeTruthy();
  });

  it('shows an existing proposal with its market-time start, expiry, and destination', () => {
    renderClients();
    expect(screen.getByText('Starts Sat, Dec 19 · 9:00 am')).toBeVisible();
    expect(screen.getByText('Expires Thu, Dec 10 · 9:00 am')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View proposal' })).toHaveAttribute('href', routes.app.proposal('prp_moving'));
  });

  it('keeps past clients visible with the supplied finish-setup step', () => {
    renderClients({ ...myClientsData, setup: findWorkNotBookableData.setup, clients: myClientsData.clients.map((row) => ({ ...row, actions: [] })) });
    expect(screen.getAllByRole('article')).toHaveLength(myClientsData.clients.length);
    expect(screen.getByRole('link', { name: 'Finish setup' })).toHaveAttribute('href', routes.app.helperOnboarding('identity'));
    expect(screen.queryByRole('link', { name: 'Propose a booking' })).not.toBeInTheDocument();
  });

  it('explains how the empty list fills up and links to Find work', () => {
    renderClients(myClientsEmptyData);
    expect(screen.getByText(messages.clients.list.emptyBody)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find work' })).toHaveAttribute('href', routes.app.findWork());
  });
});
