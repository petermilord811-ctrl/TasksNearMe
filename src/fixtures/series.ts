import type { SeriesHandlers, SeriesPageData, SeriesVisitView, SeriesView } from '@/contracts';
import { DEV_TEST_CARDS, routes } from '@/contracts';
import { fakeHandler } from './actions';
import { mayaMastercard, mayaVisa } from './bookings';
import { deskBreakdown } from './money';
import { jordan, maya } from './people';

/**
 * Regular visits (blueprint 03 §7): Jordan rakes and bags Maya's backyard leaves every week on Tuesday at 9:00 am,
 * 3 hours, $60 a visit (Maya pays $63.00; Jordan earns $60.00). Seen on Mon Nov 30 at noon in Austin: visits 1 to 3
 * (Nov 10, 17, 24) are done, visit 4 (Tue Dec 1) is charged 48 h before, and visits 5 to 7 are on the calendar.
 */

export const SERIES_NOW = '2026-11-30T18:00:00.000Z';
const HOUR = 3_600_000;

/** 9:00 am in Austin (CST, UTC−6). */
const at = (date: string) => `${date}T15:00:00.000Z`;
const plusHours = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * HOUR).toISOString();

function visit(index: number, date: string, over: Partial<SeriesVisitView> = {}): SeriesVisitView {
  const start = at(date);
  return { id: `bkg_leaves_${index}`, index, start, end: plusHours(start, 3), state: 'scheduled', bookingId: `bkg_leaves_${index}`, actions: ['open_booking'], ...over };
}

/** On the calendar, charged 48 h before; either person can still skip it (the helper: it's 48 h or more away). */
const scheduled = (index: number, date: string): SeriesVisitView =>
  visit(index, date, { state: 'scheduled', chargeAt: plusHours(at(date), -48), actions: ['skip_visit', 'open_booking'] });

const pastVisits: SeriesVisitView[] = [visit(3, '2026-11-24', { state: 'completed' }), visit(2, '2026-11-17', { state: 'completed' }), visit(1, '2026-11-10', { state: 'completed' })];

const base: SeriesView = {
  id: 'srs_leaves',
  status: 'active',
  viewerRole: 'poster',
  client: maya,
  helper: jordan,
  task: { title: 'Rake and bag the backyard leaves', categorySlug: 'yard-cleanup', areaName: 'Mueller' },
  schedule: { cadence: 'weekly', weekday: 2, firstStart: at('2026-11-10'), durationMinutes: 180, timeZone: 'America/Chicago' },
  pricing: { type: 'fixed', priceCents: 6000 },
  breakdown: deskBreakdown,
  card: { methodId: 'pm_maya_visa', brand: 'visa', last4: '1881', expMonth: 8, expYear: 2028 },
  startedAt: '2026-11-03T20:00:00.000Z',
  completedCount: 3,
  upcoming: [
    visit(4, '2026-12-01', { state: 'booked' }),
    scheduled(5, '2026-12-08'),
    scheduled(6, '2026-12-15'),
    scheduled(7, '2026-12-22'),
  ],
  past: pastVisits,
  actions: ['pause_series', 'change_card', 'cancel_series', 'message'],
};

const clientCards = [mayaVisa, mayaMastercard];

/** Maya, active: visit 4 booked and paid, the next three on the calendar. */
export const seriesClientActiveData: SeriesPageData = { series: base, cards: clientCards, pauseLimits: { firstDate: '2026-12-01', lastDate: '2027-02-28' } };

/** Visit 4's charge failed (not enough funds): Maya pays by 12 h before, or it's skipped. */
export const seriesClientPaymentDueData: SeriesPageData = {
  ...seriesClientActiveData,
  series: {
    ...base,
    upcoming: [
      visit(4, '2026-12-01', { state: 'payment_due', payBy: plusHours(at('2026-12-01'), -12), failure: 'insufficient_funds', actions: ['pay_visit', 'skip_visit', 'open_booking'] }),
      ...base.upcoming.slice(1),
    ],
  },
};

/** The card was removed: the next visits can't be charged until Maya picks one. */
export const seriesClientNoCardData: SeriesPageData = {
  ...seriesClientActiveData,
  series: {
    ...base,
    card: null,
    upcoming: [
      visit(4, '2026-12-01', { state: 'payment_due', payBy: plusHours(at('2026-12-01'), -12), failure: 'no_card', actions: ['pay_visit', 'skip_visit', 'open_booking'] }),
      ...base.upcoming.slice(1),
    ],
  },
};

/**
 * No saved card at all (2026-11-23): Change card opens with the add-a-card form right in the sheet, collected as on the
 * payments page (development's test cards here).
 */
export const seriesClientNoSavedCardsData: SeriesPageData = { ...seriesClientNoCardData, cards: [], newCard: { kind: 'dev', testCards: DEV_TEST_CARDS } };

/** Paused until Mon Dec 21: Dec 8 and Dec 15 are skipped; Dec 1 was paid and stays; Dec 22 is on the calendar. */
export const seriesClientPausedData: SeriesPageData = {
  series: {
    ...base,
    status: 'paused',
    pausedUntil: '2026-12-21',
    upcoming: [
      visit(4, '2026-12-01', { state: 'booked' }),
      visit(5, '2026-12-08', { state: 'skipped', skippedBy: 'pause' }),
      visit(6, '2026-12-15', { state: 'skipped', skippedBy: 'pause' }),
      scheduled(7, '2026-12-22'),
    ],
    actions: ['resume_series', 'change_card', 'cancel_series', 'message'],
  },
  cards: clientCards,
};

/** Maya stopped them: the paid Dec 1 visit stays; the rest were removed. */
export const seriesClientStoppedData: SeriesPageData = {
  series: {
    ...base,
    status: 'canceled',
    stoppedBy: 'poster',
    upcoming: [
      visit(4, '2026-12-01', { state: 'booked' }),
      visit(5, '2026-12-08', { state: 'canceled' }),
      visit(6, '2026-12-15', { state: 'canceled' }),
      visit(7, '2026-12-22', { state: 'canceled' }),
    ],
    actions: ['message'],
  },
  cards: clientCards,
};

/** Monthly on the third Saturday at 10:00 am, two hours, the first one done on Nov 21. */
export const seriesClientMonthlyData: SeriesPageData = {
  series: {
    ...base,
    id: 'srs_cleaning',
    task: { title: 'Light cleaning for a 2-bedroom apartment', categorySlug: 'light-cleaning', areaName: 'Hyde Park' },
    helper: { ...jordan, reliable: true },
    schedule: { cadence: 'monthly', weekday: 6, monthWeek: 3, firstStart: '2026-11-21T16:00:00.000Z', durationMinutes: 120, timeZone: 'America/Chicago' },
    completedCount: 1,
    upcoming: [
      visit(2, '2026-12-19', { start: '2026-12-19T16:00:00.000Z', end: '2026-12-19T18:00:00.000Z', state: 'scheduled', chargeAt: '2026-12-17T16:00:00.000Z', actions: ['skip_visit', 'open_booking'] }),
      visit(3, '2027-01-16', { start: '2027-01-16T16:00:00.000Z', end: '2027-01-16T18:00:00.000Z', state: 'scheduled', chargeAt: '2027-01-14T16:00:00.000Z', actions: ['skip_visit', 'open_booking'] }),
      visit(4, '2027-02-20', { start: '2027-02-20T16:00:00.000Z', end: '2027-02-20T18:00:00.000Z', state: 'scheduled', chargeAt: '2027-02-18T16:00:00.000Z', actions: ['skip_visit', 'open_booking'] }),
      visit(5, '2027-03-20', { start: '2027-03-20T15:00:00.000Z', end: '2027-03-20T17:00:00.000Z', state: 'scheduled', chargeAt: '2027-03-18T15:00:00.000Z', actions: ['skip_visit', 'open_booking'] }),
    ],
    past: [visit(1, '2026-11-21', { start: '2026-11-21T16:00:00.000Z', end: '2026-11-21T18:00:00.000Z', state: 'completed' })],
  },
  cards: clientCards,
  pauseLimits: { firstDate: '2026-12-01', lastDate: '2027-02-28' },
};

const helperUpcoming: SeriesVisitView[] = [
  visit(4, '2026-12-01', { state: 'booked' }),
  scheduled(5, '2026-12-08'),
  scheduled(6, '2026-12-15'),
  scheduled(7, '2026-12-22'),
];

/** Jordan's view: what he earns, no card, and "End regular visits" with 7 days' notice. */
export const seriesHelperActiveData: SeriesPageData = {
  series: { ...base, viewerRole: 'helper', card: undefined, upcoming: helperUpcoming, actions: ['end_series', 'message'] },
  endsOnIfEnded: '2026-12-07',
};

/** Jordan ended them on Nov 30: Dec 1 still happens; the later visits were removed. */
export const seriesHelperEndedData: SeriesPageData = {
  series: {
    ...base,
    viewerRole: 'helper',
    card: undefined,
    status: 'ended',
    endsOn: '2026-12-07',
    stoppedBy: 'helper',
    upcoming: [visit(4, '2026-12-01', { state: 'booked' }), visit(5, '2026-12-08', { state: 'canceled' }), visit(6, '2026-12-15', { state: 'canceled' }), visit(7, '2026-12-22', { state: 'canceled' })],
    actions: ['message'],
  },
};

/** Every series handler succeeding (the conversation opens the thread). */
export const fakeSeriesHandlers: SeriesHandlers = {
  onSkipVisit: fakeHandler({ ok: true, code: 'updated' }),
  onPause: fakeHandler({ ok: true, code: 'updated' }),
  onResume: fakeHandler({ ok: true, code: 'updated' }),
  onCancel: fakeHandler({ ok: true, code: 'updated' }),
  onEnd: fakeHandler({ ok: true, code: 'updated' }),
  onChangeCard: fakeHandler({ ok: true, code: 'updated' }),
  onMessage: fakeHandler({ ok: true, code: 'updated', redirectTo: routes.app.thread('thr_leaves') }),
  onAddCard: fakeHandler({ ok: true, code: 'saved' }),
};
