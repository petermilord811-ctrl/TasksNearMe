import type { InviteHandlers, InviteView, MyOffersPageData, RequestHelperHandlers, RequestHelperPageData, TaskOwnerView } from '@/contracts';
import { compactTaskDetails, routes } from '@/contracts';
import { mayaPaymentPanel } from './bookings';
import { myOffersPageData } from './helper-work';
import { bookshelfBreakdown, bookshelfCounterBreakdown } from './money';
import { deskOwnerNoOffersView } from './offers';
import { muellerArea } from './locations';
import { jordan, maya } from './people';

/**
 * Direct invites (UI-025; ui-contract scenarios `invite.*`): three weeks after the desk, Maya books Jordan
 * again for a bookshelf at $45 ($47.25 held on her card with the hold fee, until Thu Dec 10, 10:00 am). Jordan
 * counters at $50 (Maya would authorize $52.50).
 */

const bookshelfTask = { id: 'tsk_bookshelf', title: 'Assemble a bookshelf', categorySlug: 'furniture-assembly' as const };
const START = '2026-12-12T16:00:00.000Z'; // Sat Dec 12, 10:00 am
const BOOKSHELF_WINDOW = { windowStart: '2026-12-12T15:00:00.000Z', windowEnd: '2026-12-12T21:00:00.000Z' };
const BOOKSHELF_DESCRIPTION = 'A flat-pack bookshelf with a glass door, still in the box. 2nd floor with an elevator.';

export const requestJordanData: RequestHelperPageData = {
  helper: jordan,
  tasks: [{ ...bookshelfTask, ...BOOKSHELF_WINDOW }],
  listedPricing: { 'furniture-assembly': { type: 'fixed', priceCents: 4000 } },
  suggestion: { taskId: 'tsk_bookshelf', pricing: { type: 'fixed', priceCents: 4500 } },
  payment: mayaPaymentPanel,
};

/** No open task in Jordan's categories yet: the page points to posting one. */
export const requestNoTasksData: RequestHelperPageData = { ...requestJordanData, tasks: [], suggestion: undefined };

/**
 * Book again from the desk (J-C7): the desk again, as a request of its own, offered first beside the open bookshelf;
 * the last price ($60) suggested. The start runs from 2 hours to 14 days after the previews' now (Tue Dec 8, 10:00 am).
 */
export const requestBookAgainData: RequestHelperPageData = {
  ...requestJordanData,
  suggestion: { pricing: { type: 'fixed', priceCents: 6000 } },
  fromBooking: {
    bookingId: 'bkg_desk',
    bookedFor: '2026-11-21T16:30:00.000Z',
    title: 'Assemble a desk (flat-pack, 1 item)',
    categorySlug: 'furniture-assembly',
    location: muellerArea,
    description: 'A flat-pack desk, about 40 parts, already unboxed in the spare room. Wall anchoring not needed.',
    startWindow: { start: '2026-12-08T18:00:00.000Z', end: '2026-12-22T16:00:00.000Z' },
  },
};

/** Book again with no open task in the category: the past task is the only choice, so no "Post a task first". */
export const requestBookAgainOnlyData: RequestHelperPageData = { ...requestBookAgainData, tasks: [] };

const sent: InviteView = {
  id: 'inv_bookshelf',
  status: 'sent',
  viewerRole: 'poster',
  task: bookshelfTask,
  client: maya,
  helper: jordan,
  terms: { pricing: { type: 'fixed', priceCents: 4500 }, start: START, message: 'Same as the desk last time: a flat-pack bookshelf.' },
  breakdown: bookshelfBreakdown,
  authorizedCents: 4725,
  expiresAt: '2026-12-10T16:00:00.000Z',
  sentAt: '2026-12-08T16:00:00.000Z',
  actions: ['cancel_invite'],
};

export const bookshelfInviteSentPoster: InviteView = sent;
export const bookshelfInviteSentHelper: InviteView = { ...sent, viewerRole: 'helper', authorizedCents: undefined, actions: ['accept_invite', 'decline_invite', 'counter_invite'] };

const counter = { pricing: { type: 'fixed' as const, priceCents: 5000 }, start: START, message: 'This one has a glass door: $50 covers the extra care.', breakdown: bookshelfCounterBreakdown };

export const bookshelfInviteCounteredPoster: InviteView = { ...sent, status: 'countered', counter, actions: ['accept_counter', 'decline_counter', 'cancel_invite'] };
export const bookshelfInviteCounteredHelper: InviteView = { ...bookshelfInviteSentHelper, status: 'countered', counter, actions: [] };
export const bookshelfInviteAcceptedPoster: InviteView = { ...sent, status: 'accepted', bookingId: 'bkg_bookshelf', expiresAt: undefined, actions: [] };
export const bookshelfInviteDeclinedPoster: InviteView = { ...sent, status: 'declined', expiresAt: undefined, authorizedCents: undefined, actions: [] };
/** An earlier invite for the same task that Jordan didn't answer in time. */
export const bookshelfInviteExpiredHelper: InviteView = { ...bookshelfInviteSentHelper, id: 'inv_bookshelf_first', status: 'expired', sentAt: '2026-12-05T16:00:00.000Z', expiresAt: undefined, actions: [] };

/** Jordan's offers page on Tue Dec 8 with Maya's invite open in the sheet (his November offers are long closed). */
export const myOffersWithInviteData: MyOffersPageData = { ...myOffersPageData, active: [], invites: [bookshelfInviteSentHelper, bookshelfInviteExpiredHelper], openInviteId: 'inv_bookshelf' };

/** Maya's bookshelf task, posted for the invite (no public offers), with Jordan's counter waiting. */
export const bookshelfOwnerWithInviteView: TaskOwnerView = {
  ...deskOwnerNoOffersView,
  task: {
    ...deskOwnerNoOffersView.task,
    ...bookshelfTask,
    slug: 'assemble-a-bookshelf-mueller-5h2d',
    excerpt: BOOKSHELF_DESCRIPTION,
    schedule: { ...BOOKSHELF_WINDOW, flexible: false },
    budget: { type: 'fixed', priceCents: 4500 },
    postedAt: '2026-12-08T15:30:00.000Z',
  },
  description: BOOKSHELF_DESCRIPTION,
  details: compactTaskDetails({ itemType: 'bookshelf', itemCount: 1, floor: 2, elevator: true, toolsOnSite: false }),
  photos: [],
  invites: [bookshelfInviteCounteredPoster],
};

/** Book again's request (J-C7): the bookshelf as a private draft waiting on Jordan, the page its request, no offers. */
export const bookAgainOwnerView: TaskOwnerView = {
  ...bookshelfOwnerWithInviteView,
  task: { ...bookshelfOwnerWithInviteView.task, status: 'draft' },
  actions: [],
  privateRequest: true,
};

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeRequestHelperHandlers: RequestHelperHandlers = {
  onQuote: () => wait(bookshelfBreakdown),
  onRequest: () => wait({ ok: true, code: 'sent', redirectTo: routes.app.task('tsk_bookshelf') }),
  onFinishVerification: () => wait({ ok: true, code: 'sent', redirectTo: routes.app.task('tsk_bookshelf') }),
};

export const fakeInviteHandlers: InviteHandlers = {
  onAccept: () => wait({ ok: true, code: 'booked', redirectTo: routes.app.booking('bkg_bookshelf') }),
  onDecline: () => wait({ ok: true, code: 'updated' }),
  onCounter: () => wait({ ok: true, code: 'sent' }),
  onCancel: () => wait({ ok: true, code: 'updated' }),
  onAcceptCounter: () => wait({ ok: true, code: 'booked', redirectTo: routes.app.booking('bkg_bookshelf') }),
  onDeclineCounter: () => wait({ ok: true, code: 'updated' }),
  onFinishVerification: () => wait({ ok: true, code: 'booked', redirectTo: routes.app.booking('bkg_bookshelf') }),
};
