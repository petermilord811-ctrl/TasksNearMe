/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes, type NeighborhoodDayCardView } from '@/contracts';
import { neighborhoodDayCanceled, neighborhoodDayFilling, neighborhoodDayFull, neighborhoodDayOpen, neighborhoodDayOwn, neighborhoodDayPast } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { NeighborhoodDayCard } from './neighborhood-day-card';

afterEach(cleanup);

const show = (day: NeighborhoodDayCardView, props: { currentSlotId?: string; replaceLinks?: boolean } = {}) =>
  render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Chicago"><NeighborhoodDayCard day={day} {...props} /></NextIntlClientProvider>);

describe('NeighborhoodDayCard', () => {
  it('shows an open day: the neighborhood, date, price, and a link to each visit', () => {
    show(neighborhoodDayOpen);
    const card = screen.getByRole('article');
    expect(within(card).getByRole('heading', { name: "Jordan T.'s neighborhood day" })).toBeInTheDocument();
    expect(card).toHaveTextContent('Hyde Park · Sat, Dec 12');
    expect(card).toHaveTextContent('$50.00 a visit');
    expect(card).toHaveTextContent('usually $65.00');
    expect(card).toHaveTextContent('6 of 6 visits open');
    const links = within(card).getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveAttribute('href', routes.app.requestHelper('jordan-t', { slotId: neighborhoodDayOpen.visits[0]!.slotId }));
    expect(links[0]).toHaveAccessibleName('Pick the 9:00 am–10:00 am visit');
    expect(card).toHaveTextContent('For tasks in Hyde Park.');
  });

  it('marks taken visits and links only the open ones while filling', () => {
    show(neighborhoodDayFilling);
    const card = screen.getByRole('article');
    expect(card).toHaveTextContent('3 of 6 visits open');
    expect(within(card).getAllByRole('link')).toHaveLength(3);
    expect(within(card).getAllByText('Taken')).toHaveLength(3);
    expect(card).not.toHaveTextContent('usually');
  });

  it.each([
    ['full', neighborhoodDayFull, 'Every visit is taken.'],
    ['past', neighborhoodDayPast, 'This day has passed.'],
    ['canceled', neighborhoodDayCanceled, 'canceled the open visits. Booked ones go ahead.'],
    ['own', neighborhoodDayOwn, 'Your day: neighbors pick a visit from this card.'],
  ] as const)('says when the day is %s, with no visit links', (_state, day, note) => {
    show(day);
    const card = screen.getByRole('article');
    expect(card).toHaveTextContent(note);
    expect(within(card).queryAllByRole('link')).toHaveLength(0);
  });

  it("marks the viewer's pick in the request dialog", () => {
    show(neighborhoodDayOpen, { currentSlotId: neighborhoodDayOpen.visits[1]!.slotId, replaceLinks: true });
    const card = screen.getByRole('article');
    expect(within(card).getAllByRole('link')).toHaveLength(5);
    expect(card.querySelector('[aria-current="true"]')).toHaveTextContent('10:30 am–11:30 am');
  });
});
