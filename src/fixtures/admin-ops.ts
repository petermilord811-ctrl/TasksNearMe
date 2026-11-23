import type {
  AdminAuditPageData,
  AdminBookingRow,
  AdminBookingsPageData,
  AdminCaseRow,
  AdminTaskHandlers,
  AdminTaskPageData,
  PersonSummary,
  StaffSummary,
} from '@/contracts';
import { routes } from '@/contracts';
import { alexStaffSummary, morganStaffSummary } from './admin';
import { deskPublicTask } from './marketing';
import { chris, jordan, maya, ruth, sam } from './people';
import { deskDraft, uploadedTaskPhotos } from './posting';

/**
 * Staff tools, part 4 (UI-033): the bookings list, task moderation and the audit log. Around Monday Nov 23,
 * 2026, 10:00 am in Austin (`ADMIN_NOW`), like the other admin fixtures.
 */

const person = (p: PersonSummary): PersonSummary => ({ id: p.id, displayName: p.displayName, initials: p.initials, memberSince: p.memberSince, phoneVerified: p.phoneVerified });
const taylorStaffSummary: StaffSummary = { id: 'usr_taylor', displayName: 'Taylor B.', initials: 'TB', roles: ['trust_safety'] };
const ana: PersonSummary = { id: 'usr_ana', displayName: 'Ana P.', initials: 'AP', memberSince: '2026-09-20T15:00:00.000Z', phoneVerified: true };
const ben: PersonSummary = { id: 'usr_ben', displayName: 'Ben W.', initials: 'BW', memberSince: '2026-10-01T15:00:00.000Z', phoneVerified: true };

// ---- Bookings ----

const row = (values: Omit<AdminBookingRow, 'client' | 'helper'> & { client: PersonSummary; helper: PersonSummary }): AdminBookingRow => ({ ...values, client: person(values.client), helper: person(values.helper) });

export const adminBookingRows: AdminBookingRow[] = [
  row({ id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', categorySlug: 'furniture-assembly', status: 'disputed', start: '2026-11-21T16:30:00.000Z', client: maya, helper: jordan, totalCents: 6300, flags: ['disputed', 'open_case'] }),
  row({ id: 'bkg_bookcase', title: 'Assemble a bookcase', categorySlug: 'furniture-assembly', status: 'completion_submitted', start: '2026-11-19T15:00:00.000Z', client: ruth, helper: jordan, totalCents: 7350, flags: ['approval_overdue'] }),
  row({ id: 'bkg_yard', title: 'Rake and bag front-yard leaves', categorySlug: 'yard-cleanup', status: 'pending_funding', start: '2026-11-28T15:00:00.000Z', client: ben, helper: sam, totalCents: 12600, flags: ['payment_failed'] }),
  row({ id: 'bkg_shelf_oct', title: 'Mount a shelf', categorySlug: 'furniture-assembly', status: 'completed', start: '2026-10-30T15:00:00.000Z', client: ana, helper: jordan, totalCents: 4725, flags: ['funds_held'] }),
];

const upcomingRows: AdminBookingRow[] = [
  row({ id: 'bkg_tv', title: 'Anchor a tall bookshelf to the wall', categorySlug: 'furniture-assembly', status: 'confirmed', start: '2026-11-25T20:00:00.000Z', client: ben, helper: jordan, totalCents: 8400, flags: [] }),
  row({ id: 'bkg_moving', title: 'Help loading a moving truck', categorySlug: 'moving-help', status: 'in_progress', start: '2026-11-22T15:00:00.000Z', client: chris, helper: jordan, totalCents: 14700, flags: [] }),
];

/** `/admin/bookings`: what needs attention first. */
export const adminBookingsAttentionData: AdminBookingsPageData = {
  filter: 'attention',
  query: '',
  rows: adminBookingRows,
  counts: { attention: 4, upcoming: 3, finished: 12, all: 19 },
};

export const adminBookingsUpcomingData: AdminBookingsPageData = { ...adminBookingsAttentionData, filter: 'upcoming', rows: [adminBookingRows[2]!, ...upcomingRows] };

/** Searching for "maya". */
export const adminBookingsSearchData: AdminBookingsPageData = { ...adminBookingsAttentionData, filter: 'all', query: 'maya', rows: [adminBookingRows[0]!], counts: { attention: 1, upcoming: 0, finished: 1, all: 2 } };

export const adminBookingsEmptyData: AdminBookingsPageData = { filter: 'attention', query: '', rows: [], counts: { attention: 0, upcoming: 0, finished: 0, all: 0 } };

// ---- Task moderation ----

const taskReport: AdminCaseRow = {
  id: 'case_task_report',
  type: 'report_content',
  queue: 'reports',
  status: 'open',
  priority: 'normal',
  subject: 'Assemble a desk (flat-pack, 1 item)',
  openedBy: person(sam),
  openedAt: '2026-11-23T08:10:00.000Z',
  updatedAt: '2026-11-23T08:10:00.000Z',
  slaDueAt: '2026-11-24T08:10:00.000Z',
  slaBreached: false,
  awaitingReply: true,
};

/** Maya's open desk task, reported by Sam; Morgan (a lead) can moderate it. */
export const adminTaskOpenData: AdminTaskPageData = {
  task: {
    id: deskPublicTask.id,
    slug: deskPublicTask.slug,
    title: deskPublicTask.title,
    categorySlug: deskPublicTask.categorySlug,
    status: 'open',
    description: deskDraft.description,
    details: { itemType: 'desk', itemCount: 1, brand: 'IKEA', floor: 2, elevator: true, toolsOnSite: false },
    areaName: 'Mueller',
    windowStart: deskPublicTask.schedule.windowStart,
    windowEnd: deskPublicTask.schedule.windowEnd,
    budget: { type: 'fixed', priceCents: 6000 },
    offerCount: 3,
    postedAt: deskPublicTask.postedAt,
  },
  poster: { ...person(maya), email: 'maya@example.test' },
  photos: uploadedTaskPhotos,
  cases: [taskReport],
  categories: ['moving-help', 'yard-cleanup', 'light-cleaning', 'computer-help'],
  actions: ['hide_task', 'close_task', 'remove_photo', 'recategorize'],
};

/** Hidden by Taylor: restore is offered instead of hide. */
export const adminTaskHiddenData: AdminTaskPageData = {
  ...adminTaskOpenData,
  task: { ...adminTaskOpenData.task, hidden: { reason: 'Asks helpers to bring their own cash for parts; checking with the poster.', at: '2026-11-23T15:20:00.000Z', by: taylorStaffSummary } },
  actions: ['restore_task', 'close_task', 'remove_photo', 'recategorize'],
};

/** Booked: no closing; the booking is linked. */
export const adminTaskBookedData: AdminTaskPageData = {
  ...adminTaskOpenData,
  task: { ...adminTaskOpenData.task, status: 'assigned', offerCount: 0 },
  bookingId: 'bkg_desk',
  actions: ['hide_task', 'remove_photo', 'recategorize'],
};

/** An agent can read, not moderate. */
export const adminTaskReadOnlyData: AdminTaskPageData = { ...adminTaskOpenData, actions: [] };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminTaskHandlers: AdminTaskHandlers = {
  onModerate: () => wait({ ok: true as const, code: 'updated' as const }),
};

// ---- Audit log ----

/** Newest first. */
export const adminAuditData: AdminAuditPageData = {
  filters: {},
  entries: [
    {
      id: 'aud_task_hide',
      at: '2026-11-23T15:20:00.000Z',
      actor: { kind: 'staff', staff: taylorStaffSummary, role: 'trust_safety' },
      action: 'task.hide',
      target: { type: 'task', id: 'tsk_desk', href: routes.admin.task('tsk_desk') },
      reason: 'Asks helpers to bring their own cash for parts; checking with the poster.',
      details: [],
    },
    {
      id: 'aud_reveal',
      at: '2026-11-23T15:05:00.000Z',
      actor: { kind: 'staff', staff: alexStaffSummary, role: 'support_agent' },
      action: 'booking.reveal_address',
      target: { type: 'booking', id: 'bkg_desk', href: routes.admin.booking('bkg_desk') },
      reason: 'The helper says the building has two entrances; checking which one.',
      details: [{ key: 'caseId', value: 'case_dispute' }],
    },
    {
      id: 'aud_resolve',
      at: '2026-11-23T14:40:00.000Z',
      actor: { kind: 'staff', staff: morganStaffSummary, role: 'support_lead' },
      action: 'case.resolve',
      target: { type: 'support_case', id: 'case_dispute', href: routes.admin.case('case_dispute') },
      reason: 'Settled at $45 because two drawers still stick.',
      details: [
        { key: 'resolution', value: 'settle' },
        { key: 'refundCents', value: '1575' },
      ],
    },
    {
      id: 'aud_reward',
      at: '2026-11-23T13:00:00.000Z',
      actor: { kind: 'staff', staff: morganStaffSummary, role: 'support_lead' },
      action: 'reward.approve_review',
      target: { type: 'reward_grant', id: 'rwd_sam_welcome' },
      reason: 'No links between the two accounts.',
      details: [{ key: 'from', value: 'in_review' }],
    },
    {
      id: 'aud_suspend',
      at: '2026-11-22T21:15:00.000Z',
      actor: { kind: 'staff', staff: taylorStaffSummary, role: 'trust_safety' },
      action: 'helper.suspend',
      target: { type: 'user', id: 'usr_priya', href: routes.admin.user('usr_priya') },
      reason: 'Linked to the client on every booking.',
      details: [],
    },
    {
      id: 'aud_system',
      at: '2026-11-22T18:00:00.000Z',
      actor: { kind: 'system' },
      action: 'booking.auto_approve',
      target: { type: 'booking', id: 'bkg_moving', href: routes.admin.booking('bkg_moving') },
      details: [],
    },
  ],
  nextCursor: 'aud_system',
  actionFamilies: ['booking', 'case', 'helper', 'reward', 'task'],
  targetTypes: ['booking', 'reward_grant', 'support_case', 'task', 'user'],
};

/** Filtered to one task. */
export const adminAuditFilteredData: AdminAuditPageData = { ...adminAuditData, filters: { targetType: 'task', targetId: 'tsk_desk' }, entries: [adminAuditData.entries[0]!], nextCursor: undefined };

export const adminAuditEmptyData: AdminAuditPageData = { ...adminAuditData, filters: { action: 'staff' }, entries: [], nextCursor: undefined };
