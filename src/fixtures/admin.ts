import { adminHomeVerifications } from './admin-verification';
import type {
  AdminBookingHandlers,
  AdminBookingPageData,
  AdminCaseHandlers,
  AdminCasePageData,
  AdminCaseRow,
  AdminCasesPageData,
  AdminConversationView,
  AdminHomeData,
  PersonSummary,
  ResolutionPreview,
  StaffSummary,
  StaffViewer,
} from '@/contracts';
import { deskExactAddress } from './locations';
import { deskBreakdown, deskSettledBreakdown } from './money';
import { jordan, maya, priya, ruth, sam } from './people';
import { uploadedTaskPhotos } from './posting';
import { alexStaff, morganStaff } from './shell';
import { DESK_TIMES } from './timeline';

/**
 * Staff tools (UI-018): the queues, the case list, and a case being worked. The viewer is Alex P.
 * (support agent). Times sit around Monday Nov 23, 2026, 10:00 am in Austin (16:00 UTC).
 */

const person = (p: PersonSummary): PersonSummary => ({ id: p.id, displayName: p.displayName, initials: p.initials, memberSince: p.memberSince, phoneVerified: p.phoneVerified });

export const ADMIN_NOW = '2026-11-23T16:00:00.000Z';

const summaryOf = (viewer: StaffViewer): StaffSummary => ({ id: viewer.id, displayName: viewer.displayName, initials: viewer.initials, roles: viewer.roles });

/** Alex (the viewer in every admin preview) and Morgan, as cases show them. */
export const alexStaffSummary = summaryOf(alexStaff);
export const morganStaffSummary = summaryOf(morganStaff);
const ben: PersonSummary = { id: 'usr_ben', displayName: 'Ben W.', initials: 'BW', memberSince: '2026-10-01T15:00:00.000Z', phoneVerified: true };

export const adminHomeData: AdminHomeData = {
  staff: alexStaffSummary,
  queues: [
    { queue: 'disputes', openCount: 1, slaBreaches: 1, oldestOpenedAt: '2026-11-22T15:00:00.000Z' },
    { queue: 'safety', openCount: 1, slaBreaches: 0, oldestOpenedAt: '2026-11-23T14:10:00.000Z' },
    { queue: 'reports', openCount: 1, slaBreaches: 0, oldestOpenedAt: '2026-11-23T09:30:00.000Z' },
    { queue: 'requests', openCount: 2, slaBreaches: 0, oldestOpenedAt: '2026-11-20T18:00:00.000Z' },
  ],
  myOpenCount: 1,
  verifications: adminHomeVerifications,
};

export const adminHomeQuietData: AdminHomeData = {
  staff: alexStaffSummary,
  queues: [
    { queue: 'disputes', openCount: 0, slaBreaches: 0 },
    { queue: 'safety', openCount: 0, slaBreaches: 0 },
    { queue: 'reports', openCount: 0, slaBreaches: 0 },
    { queue: 'requests', openCount: 0, slaBreaches: 0 },
  ],
  myOpenCount: 0,
  verifications: { counts: { address: 0, identity: 0, background: 0 } },
};

const disputeRow: AdminCaseRow = {
  id: 'case_dispute',
  type: 'dispute',
  queue: 'disputes',
  status: 'awaiting_support',
  priority: 'high',
  subject: 'Assemble a desk (flat-pack, 1 item)',
  openedBy: person(maya),
  openedAt: '2026-11-22T15:00:00.000Z',
  updatedAt: '2026-11-23T15:20:00.000Z',
  slaDueAt: '2026-11-23T15:00:00.000Z',
  slaBreached: true,
  assignee: alexStaffSummary,
  awaitingReply: true,
};

const safetyRow: AdminCaseRow = {
  id: 'case_safety',
  type: 'safety',
  queue: 'safety',
  status: 'open',
  priority: 'urgent',
  subject: 'Assemble a bookcase',
  openedBy: person(ruth),
  openedAt: '2026-11-23T14:10:00.000Z',
  updatedAt: '2026-11-23T14:10:00.000Z',
  slaDueAt: '2026-11-23T18:10:00.000Z',
  slaBreached: false,
  awaitingReply: true,
};

const reportRow: AdminCaseRow = {
  id: 'case_report',
  type: 'report_user',
  queue: 'reports',
  status: 'open',
  priority: 'high',
  subject: 'Sam K.',
  openedBy: person(priya),
  openedAt: '2026-11-23T09:30:00.000Z',
  updatedAt: '2026-11-23T09:30:00.000Z',
  slaDueAt: '2026-11-23T19:30:00.000Z',
  slaBreached: false,
  awaitingReply: true,
};

const requestRow: AdminCaseRow = {
  id: 'case_request',
  type: 'payment_issue',
  queue: 'requests',
  status: 'awaiting_poster',
  priority: 'normal',
  subject: 'Payment',
  openedBy: ben,
  openedAt: '2026-11-20T18:00:00.000Z',
  updatedAt: '2026-11-21T10:00:00.000Z',
  slaBreached: false,
  assignee: morganStaffSummary,
  awaitingReply: false,
};

const closedRow: AdminCaseRow = {
  id: 'case_old',
  type: 'account',
  queue: 'requests',
  status: 'closed',
  priority: 'low',
  subject: 'Account',
  openedBy: person(maya),
  openedAt: '2026-10-02T14:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
  slaBreached: false,
  awaitingReply: false,
};

export const adminCasesPageData: AdminCasesPageData = {
  filters: { status: 'all', mine: false },
  cases: [disputeRow, safetyRow, reportRow, requestRow, closedRow],
  totalCount: 5,
};

export const adminCasesFilteredData: AdminCasesPageData = {
  filters: { queue: 'disputes', status: 'active', mine: true },
  cases: [disputeRow],
  totalCount: 1,
};

export const adminCasesEmptyData: AdminCasesPageData = { filters: { queue: 'safety', status: 'active', mine: false }, cases: [], totalCount: 0 };

/** Maya's problem report on the desk: support talks to Maya and to Jordan separately, with a note. */
export const disputeAdminCaseData: AdminCasePageData = {
  case: {
    ...disputeRow,
    description: 'The drawers were left in the box and one side panel is scratched.',
    photos: [uploadedTaskPhotos[0]!],
    reason: 'incomplete',
  },
  parties: [
    { person: person(maya), role: 'poster', canMessage: true },
    { person: person(jordan), role: 'helper', canMessage: true },
  ],
  booking: { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', status: 'disputed', start: DESK_TIMES.agreedStart, priceCents: 6000 },
  events: [
    { id: 'aev_1', kind: 'status', actor: { kind: 'system' }, status: 'open', at: '2026-11-22T15:00:00.000Z' },
    { id: 'aev_2', kind: 'assignment', actor: { kind: 'staff', staff: alexStaffSummary }, assignee: alexStaffSummary, at: '2026-11-22T16:05:00.000Z' },
    { id: 'aev_3', kind: 'message', actor: { kind: 'staff', staff: alexStaffSummary }, partyId: 'usr_jordan', body: 'Hi Jordan, Maya says the drawers were left in the box. Can you tell us what happened?', at: '2026-11-22T16:10:00.000Z' },
    { id: 'aev_4', kind: 'status', actor: { kind: 'staff', staff: alexStaffSummary }, status: 'awaiting_helper', at: '2026-11-22T16:10:00.000Z' },
    { id: 'aev_5', kind: 'message', actor: { kind: 'member', person: person(jordan) }, partyId: 'usr_jordan', body: 'The drawer rails were missing from the box. I can come back on Sunday to finish them.', at: '2026-11-23T15:20:00.000Z' },
    { id: 'aev_6', kind: 'status', actor: { kind: 'system' }, status: 'awaiting_support', at: '2026-11-23T15:20:00.000Z' },
    { id: 'aev_7', kind: 'note', actor: { kind: 'staff', staff: alexStaffSummary }, body: 'Rework looks fair. Check with Maya before resolving.', at: '2026-11-23T15:40:00.000Z' },
  ],
  actions: ['unassign', 'set_status', 'reply', 'add_note', 'resolve'],
  nextStatuses: ['awaiting_poster', 'awaiting_helper', 'escalated'],
  resolutions: ['no_action', 'rework', 'account_action'],
};

/** Priya reported Sam from their conversation; unassigned, nobody has opened the conversation yet. */
export const reportAdminCaseData: AdminCasePageData = {
  case: { ...reportRow, description: 'Asked me to pay in cash and to text them instead.', photos: [], reason: 'off_platform_payment' },
  parties: [
    { person: person(priya), role: 'opener', canMessage: true },
    { person: person(sam), role: 'reported', canMessage: false },
  ],
  events: [{ id: 'aev_r1', kind: 'status', actor: { kind: 'system' }, status: 'open', at: '2026-11-23T09:30:00.000Z' }],
  context: { kind: 'conversation', title: 'Assemble a desk (flat-pack, 1 item)' },
  actions: ['assign_to_me', 'set_status', 'reply', 'add_note', 'resolve'],
  nextStatuses: ['awaiting_poster', 'awaiting_support', 'escalated'],
  resolutions: ['no_action', 'account_action'],
};

/** Sam reported a review on his profile as abusive (B-059). Morgan (support lead) can hide it. */
export const reviewReportAdminCaseData: AdminCasePageData = {
  case: {
    ...reportRow,
    id: 'case_review_report',
    type: 'report_content',
    subject: 'A review of Sam K.',
    description: 'This review is about my accent, not the work. It breaks the community guidelines.',
    photos: [],
    reason: 'harassment',
  },
  parties: [{ person: person(sam), role: 'opener', canMessage: true }],
  events: [{ id: 'aev_rr1', kind: 'status', actor: { kind: 'system' }, status: 'open', at: '2026-11-23T09:30:00.000Z' }],
  review: {
    review: {
      id: 'rev_reported',
      rating: 1,
      tags: [],
      body: "Couldn't understand a word he said. Find someone local.",
      author: { displayName: 'Ruth A.', initials: 'RA' },
      categorySlug: 'furniture-assembly',
      publishedAt: '2026-11-21T18:00:00.000Z',
    },
    subject: { displayName: 'Sam K.' },
    status: 'published',
    canModerate: true,
  },
  actions: ['assign_to_me', 'set_status', 'reply', 'add_note', 'resolve'],
  nextStatuses: ['awaiting_poster', 'awaiting_support', 'escalated'],
  resolutions: ['no_action', 'account_action'],
};

/** After Morgan hid it: the reason shows, and the case timeline has the step. */
export const reviewHiddenAdminCaseData: AdminCasePageData = {
  ...reviewReportAdminCaseData,
  review: { ...reviewReportAdminCaseData.review!, status: 'hidden', hiddenReason: 'Comments on accent, not the work: community guidelines §2.' },
  events: [
    ...reviewReportAdminCaseData.events,
    { id: 'aev_rr2', kind: 'review', reviewAction: 'hidden', actor: { kind: 'staff', staff: morganStaffSummary }, body: 'Comments on accent, not the work: community guidelines §2.', at: '2026-11-23T10:05:00.000Z' },
  ],
};

/** An agent sees the review but can't hide it. */
export const reviewReportAgentCaseData: AdminCasePageData = { ...reviewReportAdminCaseData, review: { ...reviewReportAdminCaseData.review!, canModerate: false } };

/** A resolved request: it can be closed or reopened; notes still work. */
export const resolvedAdminCaseData: AdminCasePageData = {
  case: {
    ...requestRow,
    status: 'resolved',
    description: 'I see two charges for the TV mounting booking.',
    photos: [],
    resolution: { type: 'no_action', summary: 'The second line was a card check that dropped off; nothing was charged twice.', at: '2026-11-21T10:00:00.000Z' },
  },
  parties: [{ person: ben, role: 'opener', canMessage: true }],
  events: [
    { id: 'aev_q1', kind: 'status', actor: { kind: 'system' }, status: 'open', at: '2026-11-20T18:00:00.000Z' },
    { id: 'aev_q2', kind: 'message', actor: { kind: 'staff', staff: morganStaffSummary }, partyId: 'usr_ben', body: 'Thanks, Ben. That second line was a card check and has already dropped off.', at: '2026-11-21T10:00:00.000Z' },
    { id: 'aev_q3', kind: 'resolution', actor: { kind: 'staff', staff: morganStaffSummary }, resolution: 'no_action', at: '2026-11-21T10:00:00.000Z' },
    { id: 'aev_q4', kind: 'status', actor: { kind: 'staff', staff: morganStaffSummary }, status: 'resolved', at: '2026-11-21T10:00:00.000Z' },
  ],
  actions: ['add_note', 'close', 'reopen'],
  nextStatuses: [],
  resolutions: [],
};

/** What Alex sees after giving a reason: the messages as written. */
export const reportedConversation: AdminConversationView = {
  title: 'Assemble a desk (flat-pack, 1 item)',
  people: [person(priya), person(sam)],
  messages: [
    { id: 'amsg_1', sender: person(sam), kind: 'text', body: 'Hi! I can do this Saturday morning.', at: '2026-11-22T20:00:00.000Z' },
    { id: 'amsg_2', sender: person(sam), kind: 'text', body: 'Cheaper if you pay cash. Text me at 512-555-0199.', at: '2026-11-22T20:02:00.000Z' },
    { id: 'amsg_3', sender: person(priya), kind: 'text', body: "I'd rather book through the app.", at: '2026-11-22T21:15:00.000Z' },
  ],
};

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminCaseHandlers: AdminCaseHandlers = {
  onAssign: () => wait({ ok: true, code: 'updated' }),
  onSetStatus: () => wait({ ok: true, code: 'updated' }),
  onReply: () => wait({ ok: true, code: 'sent' }),
  onAddNote: () => wait({ ok: true, code: 'saved' }),
  onResolve: () => wait({ ok: true, code: 'saved' }),
  onClose: () => wait({ ok: true, code: 'updated' }),
  onReopen: () => wait({ ok: true, code: 'updated' }),
  onRevealConversation: () => wait({ ok: true, conversation: reportedConversation }),
  onPreviewResolution: () => wait({ ok: true, preview: settleAt45Preview }),
  onModerateReview: () => wait({ ok: true, code: 'updated' }),
};

// ---- Money resolutions and the staff booking page (UI-019) --------------------------------------------

/** Maya's problem report with the money resolutions open to Alex (refunds up to $100 a booking). */
export const disputeMoneyCaseData: AdminCasePageData = {
  ...disputeAdminCaseData,
  resolutions: ['release_full', 'settle', 'refund_full', 'rework', 'account_action'],
  money: { priceCents: 6000, chargedCents: 6600, refundedCents: 0 },
};

/** Settling the $60 desk at $45 (blueprint 04 §6). */
export const settleAt45Preview: ResolutionPreview = { posterRefundCents: 1650, helperReceivesCents: 4050, platformKeepsCents: 900, withinLimit: true };
export const releaseFullPreview: ResolutionPreview = { posterRefundCents: 0, helperReceivesCents: 5400, platformKeepsCents: 1200, withinLimit: true };
/** A refund above Alex's $100 limit: a lead or finance records it. */
export const overLimitPreview: ResolutionPreview = { posterRefundCents: 15400, helperReceivesCents: 0, platformKeepsCents: 0, withinLimit: false };

const deskBookingSummary: AdminBookingPageData['booking'] = {
  id: 'bkg_desk',
  title: 'Assemble a desk (flat-pack, 1 item)',
  taskId: 'tsk_desk',
  status: 'disputed',
  start: '2026-11-21T16:30:00.000Z',
  areaName: 'Mueller',
  pricingType: 'fixed',
};

/** The disputed desk: charged $66.00, nothing refunded, earnings on hold. */
export const adminBookingDisputedData: AdminBookingPageData = {
  booking: deskBookingSummary,
  poster: person(maya),
  helper: person(jordan),
  money: { breakdown: deskBreakdown, chargedCents: 6600, refundedCents: 0, refunds: [], earnings: [{ kind: 'earnings', amountCents: 5400, status: 'on_hold' }] },
  cases: [disputeRow],
  refund: { maxCents: 6600, limitCents: 10000, leftCents: 6600 },
  refundRequests: [],
  actions: ['refund', 'reveal_address', 'reveal_conversation'],
};

/** After settling at $45: $16.50 back to Maya, $40.50 to Jordan. */
export const adminBookingSettledData: AdminBookingPageData = {
  booking: { ...deskBookingSummary, status: 'completed' },
  poster: person(maya),
  helper: person(jordan),
  money: {
    breakdown: deskBreakdown,
    finalBreakdown: deskSettledBreakdown,
    chargedCents: 6600,
    refundedCents: 1650,
    refunds: [{ id: 'ref_settle', amountCents: 1650, reason: 'dispute_settlement', status: 'succeeded', createdAt: '2026-11-24T17:00:00.000Z' }],
    earnings: [{ kind: 'earnings', amountCents: 4050, status: 'transferred', transferredAt: '2026-11-24T17:00:00.000Z' }],
  },
  cases: [{ ...disputeRow, status: 'resolved', slaBreached: false, awaitingReply: false }],
  refund: { maxCents: 4950, limitCents: 10000, leftCents: 4950 },
  refundRequests: [],
  actions: ['refund', 'reveal_address', 'reveal_conversation'],
};

/** A $154 move: an agent (limit $100) asked a lead to approve a $120 refund; Morgan can decide. */
export const adminBookingRefundRequestData: AdminBookingPageData = {
  ...adminBookingDisputedData,
  money: { ...adminBookingDisputedData.money, chargedCents: 15400 },
  refund: { maxCents: 10000, limitCents: 10000, leftCents: 15400 },
  refundRequests: [
    { id: 'rrq_moving', amountCents: 12000, reason: 'goodwill', note: 'The helper left two hours early; the client asked for most of it back.', requestedBy: 'Alex P.', requestedAt: '2026-11-22T18:00:00.000Z', status: 'pending', canDecide: true },
    { id: 'rrq_old', amountCents: 2000, reason: 'goodwill', note: 'A smaller refund asked for before the limits changed.', requestedBy: 'Alex P.', requestedAt: '2026-11-21T15:00:00.000Z', status: 'declined', decidedBy: 'Morgan L.', decidedAt: '2026-11-21T16:00:00.000Z', canDecide: false },
  ],
};

/** A viewer without refund or restricted-data rights (for example, an admin): read-only. */
export const adminBookingReadOnlyData: AdminBookingPageData = { ...adminBookingDisputedData, refund: undefined, actions: [] };

export const fakeAdminBookingHandlers: AdminBookingHandlers = {
  onRefund: () => wait({ ok: true, code: 'submitted' }),
  onDecideRefund: () => wait({ ok: true, code: 'updated' }),
  onRevealAddress: () => wait({ ok: true, address: deskExactAddress }),
  onRevealConversation: () => wait({ ok: true, conversation: reportedConversation }),
};
