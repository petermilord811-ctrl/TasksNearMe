import type {
  ActionDescriptor,
  MyTasksPageData,
  OfferActionId,
  OfferDetailPageData,
  OfferView,
  PriceBreakdown,
  TaskActionId,
  TaskOwnerHandlers,
  TaskOwnerView,
} from '@/contracts';
import { compactTaskDetails, routes } from '@/contracts';
import { deskExactAddress } from './locations';
import { cleaningPublicTask, deskPublicTask, remoteComputerPublicTask, yardPublicTask } from './marketing';
import { deskBreakdown, bookshelfCounterBreakdown } from './money';
import { jordan, lee, sam } from './people';
import { deskDraft, uploadedTaskPhotos } from './posting';

/**
 * Offers on Maya's desk and her task list, as the poster sees them. "Now" is Tue, Nov 17, 2026,
 * 9:00 am in Austin; the desk is Saturday 10:00 am–1:00 pm.
 */

/** Sam offers $55: poster pays $60.50 (fee $5.50), Sam earns $49.50. Checked against the fee engine. */
export const deskOfferSamBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 5500,
  posterFeeCents: 550,
  helperFeeCents: 550,
  expenseAllowanceCents: 0,
  posterTotalCents: 6050,
  helperEarningsCents: 4950,
  platformRevenueCents: 1100,
};

/** Lee offers $50 (same lines as the bookshelf counter). */
export const deskOfferLeeBreakdown: PriceBreakdown = { ...bookshelfCounterBreakdown };

const pendingOfferActions: ActionDescriptor<OfferActionId>[] = [
  { id: 'book_offer', kind: 'primary', enabled: true },
  { id: 'message_helper', kind: 'secondary', enabled: true },
  { id: 'decline_offer', kind: 'destructive', enabled: true, confirm: true },
];

export const deskOfferJordan: OfferView = {
  id: 'off_jordan',
  taskId: 'tsk_desk',
  helper: jordan,
  status: 'pending',
  pricing: { type: 'fixed', priceCents: 6000 },
  proposedStart: '2026-11-21T16:00:00.000Z',
  message: [{ kind: 'text', text: 'Happy to help! I bring my own drill and a level, and I take the packaging with me.' }],
  brings: ['Drill', 'Level'],
  expiresAt: '2026-11-20T15:00:00.000Z',
  revision: 1,
  submittedAt: '2026-11-17T13:20:00.000Z',
  isNew: true,
  breakdown: deskBreakdown,
  actions: pendingOfferActions,
};

export const deskOfferSam: OfferView = {
  id: 'off_sam',
  taskId: 'tsk_desk',
  helper: sam,
  status: 'pending',
  pricing: { type: 'fixed', priceCents: 5500 },
  proposedStart: '2026-11-21T16:30:00.000Z',
  message: [{ kind: 'text', text: 'I have built this exact desk twice. About an hour of work.' }],
  brings: ['Drill', 'Hex keys'],
  expiresAt: '2026-11-20T15:00:00.000Z',
  revision: 2,
  submittedAt: '2026-11-16T22:05:00.000Z',
  isNew: false,
  breakdown: deskOfferSamBreakdown,
  actions: pendingOfferActions,
};

/** Lee's message tried to share a phone number: it arrives masked. */
export const deskOfferLee: OfferView = {
  id: 'off_lee',
  taskId: 'tsk_desk',
  helper: lee,
  status: 'pending',
  pricing: { type: 'fixed', priceCents: 5000 },
  proposedStart: '2026-11-21T17:00:00.000Z',
  message: [
    { kind: 'text', text: 'Can do Saturday late morning. Text me at ' },
    { kind: 'masked', detail: 'phone', hint: '0134' },
    { kind: 'text', text: ' if anything changes.' },
  ],
  brings: [],
  expiresAt: '2026-11-20T15:00:00.000Z',
  revision: 1,
  submittedAt: '2026-11-16T18:40:00.000Z',
  isNew: false,
  breakdown: deskOfferLeeBreakdown,
  actions: pendingOfferActions,
};

/** After Maya changed the time: Sam must re-confirm before it can be booked. */
export const deskOfferSamStale: OfferView = {
  ...deskOfferSam,
  status: 'stale',
  actions: [
    { id: 'book_offer', kind: 'primary', enabled: false, disabledReason: { code: 'awaiting_other_party' } },
    { id: 'message_helper', kind: 'secondary', enabled: true },
    { id: 'decline_offer', kind: 'destructive', enabled: true, confirm: true },
  ],
};

const openTaskActions: ActionDescriptor<TaskActionId>[] = [
  { id: 'invite_helpers', kind: 'secondary', enabled: true },
  { id: 'edit_task', kind: 'secondary', enabled: true },
  { id: 'cancel_task', kind: 'destructive', enabled: true, confirm: true },
];

export const deskOwnerView: TaskOwnerView = {
  task: deskPublicTask,
  description: deskDraft.description,
  details: compactTaskDetails(deskDraft.details),
  photos: uploadedTaskPhotos,
  exactAddress: deskExactAddress,
  offers: [deskOfferJordan, deskOfferSam, deskOfferLee],
  actions: openTaskActions,
};

export const deskOwnerNoOffersView: TaskOwnerView = {
  ...deskOwnerView,
  task: { ...deskPublicTask, offerCount: 0 },
  offers: [],
};

export const deskOwnerStaleView: TaskOwnerView = {
  ...deskOwnerView,
  offers: [deskOfferJordan, deskOfferSamStale, deskOfferLee],
};

/** Booked with Jordan: the other offers were declined automatically. */
export const deskOwnerBookedView: TaskOwnerView = {
  ...deskOwnerView,
  task: { ...deskPublicTask, status: 'assigned' },
  offers: [
    { ...deskOfferJordan, status: 'accepted', isNew: false, actions: [] },
    { ...deskOfferSam, status: 'declined', actions: [] },
    { ...deskOfferLee, status: 'declined', actions: [] },
  ],
  actions: [],
  bookingId: 'bkg_desk',
};

/** Remote help on a different task, nothing to show for the address. */
export const remoteOwnerView: TaskOwnerView = {
  task: remoteComputerPublicTask,
  description: remoteComputerPublicTask.excerpt,
  details: { device: 'laptop', need: 'setup' },
  photos: [],
  offers: [],
  actions: openTaskActions,
};

export const myTasksPageData: MyTasksPageData = {
  open: [
    { id: deskPublicTask.id, slug: deskPublicTask.slug, title: deskPublicTask.title, categorySlug: deskPublicTask.categorySlug, status: 'open', schedule: deskPublicTask.schedule, budget: deskPublicTask.budget, offerCount: 3, newOfferCount: 1, postedAt: deskPublicTask.postedAt },
    { id: remoteComputerPublicTask.id, slug: remoteComputerPublicTask.slug, title: remoteComputerPublicTask.title, categorySlug: remoteComputerPublicTask.categorySlug, status: 'open', schedule: remoteComputerPublicTask.schedule, budget: remoteComputerPublicTask.budget, offerCount: 2, newOfferCount: 0, postedAt: remoteComputerPublicTask.postedAt },
  ],
  booked: [
    { id: yardPublicTask.id, slug: yardPublicTask.slug, title: yardPublicTask.title, categorySlug: yardPublicTask.categorySlug, status: 'assigned', schedule: yardPublicTask.schedule, budget: yardPublicTask.budget, offerCount: 1, newOfferCount: 0, postedAt: yardPublicTask.postedAt, bookingId: 'bkg_yard' },
  ],
  past: [
    { id: cleaningPublicTask.id, slug: cleaningPublicTask.slug, title: cleaningPublicTask.title, categorySlug: cleaningPublicTask.categorySlug, status: 'completed', schedule: cleaningPublicTask.schedule, budget: cleaningPublicTask.budget, offerCount: 4, newOfferCount: 0, postedAt: cleaningPublicTask.postedAt, bookingId: 'bkg_cleaning' },
  ],
};

export const myTasksEmptyData: MyTasksPageData = { open: [], booked: [], past: [] };

export const deskOfferDetailData: OfferDetailPageData = {
  task: {
    id: deskPublicTask.id,
    title: deskPublicTask.title,
    categorySlug: deskPublicTask.categorySlug,
    schedule: deskPublicTask.schedule,
    location: deskPublicTask.location,
    budget: deskPublicTask.budget,
  },
  offer: deskOfferJordan,
  otherPendingOffers: 2,
};

const wait = <T,>(value: T, ms = 500) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeTaskOwnerHandlers: TaskOwnerHandlers = {
  onOfferAction: ({ offerId, action }) =>
    wait(
      action === 'book_offer'
        ? { ok: true, code: 'updated', redirectTo: routes.app.confirmOffer('tsk_desk', offerId) }
        : action === 'message_helper'
          ? { ok: true, code: 'updated', redirectTo: routes.app.thread(`thr_${offerId}`) }
          : { ok: true, code: 'updated' },
    ),
  onTaskAction: ({ action }) =>
    wait({ ok: true, code: 'updated', redirectTo: action === 'post_again' ? routes.app.newTask() : routes.app.task('tsk_desk') }),
  onCancelTask: () => wait({ ok: true, code: 'canceled' }),
};
