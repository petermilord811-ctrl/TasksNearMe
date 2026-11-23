import type { TimelineEvent } from '@/contracts';

/**
 * The $60 desk booking from posting to approval (docs/blueprint/02 §3). All times are UTC;
 * Austin is UTC−6 in November (CST).
 */
export const DESK_TIMES = {
  posted: '2026-11-17T01:40:00.000Z', // Mon Nov 16, 7:40 pm
  jordanOffered: '2026-11-17T02:15:00.000Z', // Mon 8:15 pm
  booked: '2026-11-17T15:02:00.000Z', // Tue Nov 17, 9:02 am
  windowStart: '2026-11-21T16:00:00.000Z', // Sat Nov 21, 10:00 am
  agreedStart: '2026-11-21T16:30:00.000Z', // Sat 10:30 am
  windowEnd: '2026-11-21T19:00:00.000Z', // Sat 1:00 pm
  noShowReportable: '2026-11-21T17:00:00.000Z', // Sat 11:00 am
  arrived: '2026-11-21T16:24:00.000Z', // Sat 10:24 am
  completionSubmitted: '2026-11-21T17:48:00.000Z', // Sat 11:48 am
  approved: '2026-11-21T19:05:00.000Z', // Sat 1:05 pm
  approvalDue: '2026-11-24T17:48:00.000Z', // Tue Nov 24, 11:48 am
  addressHidden: '2026-11-23T19:05:00.000Z', // Mon Nov 23, 1:05 pm (48 h after approval)
  rewardUnlocks: '2026-11-28T19:05:00.000Z', // Sat Nov 28, 1:05 pm
  reviewsPublishBy: '2026-12-05T19:05:00.000Z', // Sat Dec 5
} as const;

export const deskTimelineCompleted: TimelineEvent[] = [
  { id: 'evt_1', at: DESK_TIMES.posted, actor: 'poster', actorName: 'Maya R.', type: 'task_posted' },
  { id: 'evt_2', at: DESK_TIMES.jordanOffered, actor: 'helper', actorName: 'Jordan T.', type: 'offer_received', params: { amountCents: 6000 } },
  { id: 'evt_3', at: DESK_TIMES.booked, actor: 'poster', actorName: 'Maya R.', type: 'booked' },
  { id: 'evt_4', at: DESK_TIMES.booked, actor: 'system', type: 'payment_succeeded', params: { amountCents: 6300 } },
  { id: 'evt_5', at: '2026-11-21T15:58:00.000Z', actor: 'helper', actorName: 'Jordan T.', type: 'on_my_way' },
  { id: 'evt_6', at: DESK_TIMES.arrived, actor: 'helper', actorName: 'Jordan T.', type: 'arrived' },
  { id: 'evt_7', at: DESK_TIMES.completionSubmitted, actor: 'helper', actorName: 'Jordan T.', type: 'completion_submitted' },
  { id: 'evt_8', at: DESK_TIMES.approved, actor: 'poster', actorName: 'Maya R.', type: 'approved' },
  { id: 'evt_9', at: DESK_TIMES.approved, actor: 'system', type: 'earnings_transferred', params: { amountCents: 6000 } },
];

/**
 * The same desk timeline as Jordan (the helper) sees it (audit M26): the client paid, and his own $60.00 is held until
 * approval, never the client's $63.00 total.
 */
export const deskTimelineHelper: TimelineEvent[] = deskTimelineCompleted.map((event) =>
  event.type === 'payment_succeeded' ? { ...event, type: 'payment_held', params: { amountCents: 6000 } } : event,
);
