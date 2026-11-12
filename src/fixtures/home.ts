import type { HelperHomeData, PosterHomeData } from '@/contracts';
import { jordanBookingsPageData, mayaBookingsPageData } from './bookings';
import { findWorkNotBookableData, findWorkPageData, jordanSetup, myOffersPageData } from './helper-work';
import { myTasksPageData } from './offers';
import { DESK_TIMES } from './timeline';

/**
 * The signed-in home (UI-023). Maya's client home on Tue, Nov 24 (Jordan submitted the desk work); Jordan's
 * helper home on Sat, Nov 21 (the desk is today); Priya hasn't finished setting up.
 */

export const mayaHomeData: PosterHomeData = {
  mode: 'poster',
  firstName: 'Maya',
  attention: [
    { id: 'att_approve', kind: 'approve_work', title: 'Assemble a desk (flat-pack, 1 item)', dueAt: DESK_TIMES.approvalDue, target: { kind: 'booking', bookingId: 'bkg_desk' } },
    { id: 'att_offers', kind: 'review_offers', title: 'Mount two floating shelves', count: 2, target: { kind: 'task', taskId: 'tsk_shelves' } },
    { id: 'att_messages', kind: 'unread_messages', count: 3, target: { kind: 'messages' } },
  ],
  upcoming: mayaBookingsPageData.upcoming,
  openTasks: myTasksPageData.open.slice(0, 3),
};

/** A new client: nothing yet. */
export const posterHomeEmptyData: PosterHomeData = { mode: 'poster', firstName: 'Ruth', attention: [], upcoming: [], openTasks: [] };

export const jordanHomeData: HelperHomeData = {
  mode: 'helper',
  firstName: 'Jordan',
  attention: [
    { id: 'att_checkin', kind: 'check_in_today', title: 'Assemble a desk (flat-pack, 1 item)', dueAt: DESK_TIMES.agreedStart, target: { kind: 'booking', bookingId: 'bkg_desk' } },
    { id: 'att_reconfirm', kind: 'reconfirm_offer', title: 'Help loading a moving truck', target: { kind: 'find_work_task', taskId: 'tsk_moving' } },
    { id: 'att_thread', kind: 'unread_messages', count: 1, target: { kind: 'thread', threadId: 'thr_bkg_desk' } },
  ],
  upcoming: jordanBookingsPageData.upcoming,
  activeOffers: myOffersPageData.active.slice(0, 3),
  suggestions: findWorkPageData.cards.filter((card) => !card.blockedReason && !card.myOffer).slice(0, 3),
  earnings: { upcomingCents: 7500, onTheWayCents: 11025 },
  setup: jordanSetup,
};

/** A payout failed: updating the bank comes first. */
export const jordanHomePayoutActionData: HelperHomeData = {
  ...jordanHomeData,
  attention: [{ id: 'att_payout', kind: 'payout_action_needed', target: { kind: 'earnings' } }, ...jordanHomeData.attention],
};

/** Priya hasn't finished setting up: the next step first; nearby tasks to browse. */
export const priyaHomeData: HelperHomeData = {
  mode: 'helper',
  firstName: 'Priya',
  attention: [{ id: 'att_setup', kind: 'finish_setup', target: { kind: 'onboarding', step: 'identity' } }],
  upcoming: [],
  activeOffers: [],
  suggestions: findWorkNotBookableData.cards.slice(0, 3),
  earnings: { upcomingCents: 0, onTheWayCents: 0 },
  setup: findWorkNotBookableData.setup,
};

/** Maya invited Jordan to the bookshelf (UI-025): his answer is due Thu Dec 10, 10:00 am. */
export const jordanHomeInviteData: HelperHomeData = {
  ...jordanHomeData,
  attention: [{ id: 'att_invite_inv_bookshelf', kind: 'answer_invite', title: 'Assemble a bookshelf', dueAt: '2026-12-10T16:00:00.000Z', target: { kind: 'invite', inviteId: 'inv_bookshelf' } }, ...jordanHomeData.attention],
};

/** Jordan countered Maya's invite: her answer is due within 24 h. */
export const mayaHomeCounterData: PosterHomeData = {
  ...mayaHomeData,
  attention: [{ id: 'att_counter_inv_bookshelf', kind: 'answer_counter', title: 'Assemble a bookshelf', dueAt: '2026-12-09T16:00:00.000Z', target: { kind: 'task', taskId: 'tsk_bookshelf' } }, ...mayaHomeData.attention],
};

/** Jordan proposed the desk again (UI-032): Maya pays to accept, or declines. */
export const mayaHomeProposalData: PosterHomeData = {
  ...mayaHomeData,
  attention: [{ id: 'att_proposal_prp_desk', kind: 'answer_proposal', title: 'Assemble a desk (flat-pack, 1 item)', dueAt: '2026-12-10T17:00:00.000Z', target: { kind: 'proposal', proposalId: 'prp_desk' } }, ...mayaHomeData.attention],
};
