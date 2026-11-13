import type {
  MyClientRow,
  MyClientsPageData,
  ProposalHandlers,
  ProposalPageData,
  ProposeRebookHandlers,
  ProposeRebookPageData,
  RebookProposalView,
} from '@/contracts';
import { routes } from '@/contracts';
import { mayaPaymentPanel } from './bookings';
import { jordanSetup } from './helper-work';
import { deskExactAddress } from './locations';
import { deskBreakdown, movingFundedBreakdown } from './money';
import { chris, jordan, maya, ruth } from './people';
import { DESK_TIMES } from './timeline';

/**
 * My clients and rebooking proposals (UI-032). Seen on Tue Dec 8: Jordan's past clients are Maya (the desk,
 * Sat Nov 21), Chris (the moving truck, with a proposal waiting) and Ruth (no proposal possible). Jordan
 * proposes the desk again to Maya: Sat Dec 19, 10:00 am, $60 (Maya pays $66.00; Jordan earns $54.00).
 */

const mayaRow: MyClientRow = {
  client: maya,
  completedCount: 1,
  lastBooking: { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', categorySlug: 'furniture-assembly', completedAt: DESK_TIMES.approved, pricing: { type: 'fixed', priceCents: 6000 }, earnedCents: 5400 },
  actions: ['propose_rebook'],
};

const chrisRow: MyClientRow = {
  client: chris,
  completedCount: 2,
  lastBooking: {
    id: 'bkg_moving',
    title: 'Help loading a moving truck',
    categorySlug: 'moving-help',
    completedAt: '2026-11-22T19:30:00.000Z',
    pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 },
    earnedCents: 12600,
  },
  openProposal: { id: 'prp_moving', start: '2026-12-19T15:00:00.000Z', expiresAt: '2026-12-10T15:00:00.000Z' },
  actions: [],
};

const ruthRow: MyClientRow = {
  client: ruth,
  completedCount: 1,
  lastBooking: { id: 'bkg_bookcase', title: 'Assemble a bookcase', categorySlug: 'furniture-assembly', completedAt: '2026-11-20T18:00:00.000Z', pricing: { type: 'fixed', priceCents: 7000 }, earnedCents: 6300 },
  actions: [],
};

/** `/app/clients` for Jordan: most recent booking first. */
export const myClientsData: MyClientsPageData = { clients: [chrisRow, mayaRow, ruthRow], setup: jordanSetup };
export const myClientsEmptyData: MyClientsPageData = { clients: [], setup: jordanSetup };

/** Jordan proposes the desk again (`/app/bookings/bkg_desk/rebook`). */
export const proposeDeskRebookData: ProposeRebookPageData = {
  client: maya,
  booking: { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', categorySlug: 'furniture-assembly', areaName: 'Mueller', lastPricing: { type: 'fixed', priceCents: 6000 }, lastStart: DESK_TIMES.agreedStart },
  limits: { firstDate: '2026-12-08', lastDate: '2026-12-22', leadHours: 3 },
  canRepeat: false,
};

const sentToMaya: RebookProposalView = {
  id: 'prp_desk',
  status: 'sent',
  viewerRole: 'poster',
  client: maya,
  helper: jordan,
  task: { title: 'Assemble a desk (flat-pack, 1 item)', categorySlug: 'furniture-assembly', areaName: 'Mueller' },
  exactAddress: deskExactAddress,
  start: '2026-12-19T16:00:00.000Z', // Sat Dec 19, 10:00 am
  pricing: { type: 'fixed', priceCents: 6000 },
  message: 'Happy to help again. Same desk model as last time?',
  breakdown: deskBreakdown,
  expiresAt: '2026-12-10T17:00:00.000Z', // Thu Dec 10, 11:00 am (48 h)
  sentAt: '2026-12-08T17:00:00.000Z',
  actions: ['accept_proposal', 'decline_proposal'],
};

export const deskProposalSentPoster: RebookProposalView = sentToMaya;
export const deskProposalSentHelper: RebookProposalView = { ...sentToMaya, viewerRole: 'helper', exactAddress: undefined, actions: ['withdraw_proposal'] };
export const deskProposalAcceptedPoster: RebookProposalView = { ...sentToMaya, status: 'accepted', bookingId: 'bkg_desk_again', expiresAt: undefined, actions: [] };
export const deskProposalDeclinedHelper: RebookProposalView = { ...deskProposalSentHelper, status: 'declined', expiresAt: undefined, actions: [] };
export const deskProposalExpiredPoster: RebookProposalView = { ...sentToMaya, status: 'expired', expiresAt: undefined, actions: [] };
export const deskProposalWithdrawnPoster: RebookProposalView = { ...sentToMaya, status: 'withdrawn', expiresAt: undefined, actions: [] };

/** Chris's hourly proposal (Jordan's side): $35/h, about 3.5 h, up to 4 h. */
export const movingProposalSentHelper: RebookProposalView = {
  ...deskProposalSentHelper,
  id: 'prp_moving',
  client: chris,
  task: { title: 'Help loading a moving truck', categorySlug: 'moving-help', areaName: 'Hyde Park' },
  start: '2026-12-19T15:00:00.000Z',
  pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 },
  message: undefined,
  breakdown: movingFundedBreakdown,
  expiresAt: '2026-12-10T15:00:00.000Z',
};

/** Maya's page while the proposal waits: pay to accept. */
export const proposalPosterData: ProposalPageData = { proposal: deskProposalSentPoster, payment: mayaPaymentPanel };
/** Jordan's page: withdraw while it waits. */
export const proposalHelperData: ProposalPageData = { proposal: deskProposalSentHelper };
export const proposalAcceptedData: ProposalPageData = { proposal: deskProposalAcceptedPoster };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeProposeRebookHandlers: ProposeRebookHandlers = {
  onQuote: () => wait(deskBreakdown),
  onPropose: () => wait({ ok: true as const, code: 'sent' as const, redirectTo: routes.app.clients() }),
};

export const fakeProposalHandlers: ProposalHandlers = {
  onAccept: () => wait({ ok: true as const, code: 'booked' as const, redirectTo: routes.app.booking('bkg_desk_again') }),
  onFinishVerification: () => wait({ ok: true as const, code: 'booked' as const, redirectTo: routes.app.booking('bkg_desk_again') }),
  onDecline: () => wait({ ok: true as const, code: 'updated' as const }),
  onWithdraw: () => wait({ ok: true as const, code: 'updated' as const }),
};
