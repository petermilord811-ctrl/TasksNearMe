import type {
  AvailabilityHandlers,
  AvailabilityPostView,
  AvailabilitySlotView,
  HelperProfilePageData,
  InviteView,
  MyAvailabilityPageData,
  RequestHelperPageData,
} from '@/contracts';
import { jordanSetup } from './helper-work';
import { bookshelfInviteSentHelper, requestJordanData } from './invites';
import { chris, maya } from './people';
import { jordanProfilePageData } from './profiles';

/**
 * Availability posts (UI-029; ui-contract scenarios `availability.active` / `availability.held`). Seen on
 * Tue Dec 8: Jordan's open Saturday yard slot (Sat Dec 12, 9 am–1 pm, $30/h, East Austin + 5 mi), a Tuesday
 * evening furniture slot, a Sunday furniture slot Maya requested (held), a Friday moving slot Chris booked,
 * and two past posts.
 */

const area = { areaName: 'East Austin', radiusMiles: 5 };

/** Sat Dec 12, 9:00 am–1:00 pm · Yard cleanup · $30/h (about 3 h, at most 4). */
export const jordanYardSlot: AvailabilitySlotView = {
  id: 'avl_yard_sat',
  categorySlug: 'yard-cleanup',
  start: '2026-12-12T15:00:00.000Z',
  end: '2026-12-12T19:00:00.000Z',
  pricing: { type: 'hourly', rateCents: 3000, estimatedHours: 3, hoursCap: 4 },
};

/** Tue Dec 15, 5:00–8:00 pm · Furniture assembly · $45. */
export const jordanEveningSlot: AvailabilitySlotView = {
  id: 'avl_furniture_tue',
  categorySlug: 'furniture-assembly',
  start: '2026-12-15T23:00:00.000Z',
  end: '2026-12-16T02:00:00.000Z',
  pricing: { type: 'fixed', priceCents: 4500 },
};

/** Sun Dec 13, 1:00–5:00 pm · Furniture assembly · $45 (Maya requested it). */
export const jordanSundaySlot: AvailabilitySlotView = {
  id: 'avl_furniture_sun',
  categorySlug: 'furniture-assembly',
  start: '2026-12-13T19:00:00.000Z',
  end: '2026-12-13T23:00:00.000Z',
  pricing: { type: 'fixed', priceCents: 4500 },
};

const post = (slot: AvailabilitySlotView, status: AvailabilityPostView['status'], extra: Partial<AvailabilityPostView> = {}): AvailabilityPostView => ({
  ...slot,
  ...area,
  status,
  actions: status === 'active' || status === 'held' ? ['cancel_post'] : [],
  ...extra,
});

export const yardPostActive = post(jordanYardSlot, 'active');
export const eveningPostActive = post(jordanEveningSlot, 'active');
export const sundayPostHeld = post(jordanSundaySlot, 'held', { request: { inviteId: 'inv_slot_sunday', client: maya, status: 'sent' } });
/** Fri Dec 11, 9:00 am–12:00 pm · Moving help · $35/h: Chris booked it. */
export const movingPostBooked = post(
  { id: 'avl_moving_fri', categorySlug: 'moving-help', start: '2026-12-11T15:00:00.000Z', end: '2026-12-11T18:00:00.000Z', pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3, hoursCap: 3 } },
  'booked',
  { request: { inviteId: 'inv_slot_moving', client: chris, status: 'accepted' }, bookingId: 'bkg_slot_moving' },
);
export const yardPostCanceled = post({ ...jordanYardSlot, id: 'avl_yard_canceled', start: '2026-12-06T15:00:00.000Z', end: '2026-12-06T19:00:00.000Z' }, 'canceled');
export const yardPostExpired = post({ ...jordanYardSlot, id: 'avl_yard_past', start: '2026-12-05T15:00:00.000Z', end: '2026-12-05T19:00:00.000Z' }, 'expired');

const limits: MyAvailabilityPageData['limits'] = { firstDate: '2026-12-08', lastDate: '2026-12-22', leadHours: 3, maxHours: 12, maxActive: 10, activeCount: 3 };

/** `/app/availability` for Jordan: upcoming posts soonest first, then past ones. */
export const myAvailabilityData: MyAvailabilityPageData = {
  posts: [movingPostBooked, yardPostActive, sundayPostHeld, eveningPostActive, yardPostCanceled, yardPostExpired],
  setup: jordanSetup,
  ...area,
  listedPricing: {
    'furniture-assembly': { type: 'fixed', priceCents: 4500 },
    'moving-help': { type: 'hourly', rateCents: 3500, estimatedHours: 2, hoursCap: 2 },
    'yard-cleanup': { type: 'hourly', rateCents: 3000, estimatedHours: 2, hoursCap: 2 },
  },
  limits,
};

/** No posts yet. */
export const myAvailabilityEmptyData: MyAvailabilityPageData = { ...myAvailabilityData, posts: [], limits: { ...limits, activeCount: 0 } };

/** Ten active or held posts: the form explains the limit. */
export const myAvailabilityAtLimitData: MyAvailabilityPageData = { ...myAvailabilityData, limits: { ...limits, activeCount: 10 } };

/** Priya hasn't finished onboarding: she sees what's missing instead of the form. */
export const myAvailabilityNotBookableData: MyAvailabilityPageData = {
  ...myAvailabilityEmptyData,
  setup: { bookable: false, bookableCategories: [], nextOnboardingStep: 'identity' },
  listedPricing: {},
};

/** Jordan's public profile with his open slots (active ones only, soonest first). */
export const jordanProfileWithSlotsData: HelperProfilePageData = { ...jordanProfilePageData, slots: [jordanYardSlot, jordanEveningSlot] };

/** Maya requests the Saturday yard slot: only her yard task whose window overlaps it; the slot's price. */
export const requestJordanSlotData: RequestHelperPageData = {
  ...requestJordanData,
  tasks: [{ id: 'tsk_leaves', title: 'Rake and bag backyard leaves', categorySlug: 'yard-cleanup', windowStart: '2026-12-12T15:00:00.000Z', windowEnd: '2026-12-12T21:00:00.000Z' }],
  listedPricing: { 'yard-cleanup': { type: 'hourly', rateCents: 3000, estimatedHours: 2, hoursCap: 2 } },
  suggestion: undefined,
  slot: jordanYardSlot,
};

/** The slot was taken (or canceled) before Maya got there: she can still send a regular request. */
export const requestJordanSlotTakenData: RequestHelperPageData = { ...requestJordanData, slotUnavailable: true };

/** Maya's request for the Sunday slot, on Jordan's side. */
export const slotInviteSentHelper: InviteView = {
  ...bookshelfInviteSentHelper,
  id: 'inv_slot_sunday',
  terms: { ...bookshelfInviteSentHelper.terms, start: jordanSundaySlot.start },
  slot: { id: jordanSundaySlot.id, start: jordanSundaySlot.start, end: jordanSundaySlot.end },
};

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAvailabilityHandlers: AvailabilityHandlers = {
  onCreate: () => wait({ ok: true as const, code: 'saved' as const }),
  onCancel: () => wait({ ok: true as const, code: 'canceled' as const }),
};
