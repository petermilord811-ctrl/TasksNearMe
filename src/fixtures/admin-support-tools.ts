import type { AdminResponseTimesData, AdminSavedRepliesHandlers, AdminSavedRepliesPageData, AdminCasePageData, SavedReplyView } from '@/contracts';
import { fakeHandler } from './actions';
import { adminCasesPageData, alexStaffSummary, disputeAdminCaseData, morganStaffSummary } from './admin';

/**
 * Staff support tools (completion plan P2) at `ADMIN_NOW` (Nov 23, 10:00 am in Austin): response times on
 * a busy day and a calm one, saved replies for a lead and an agent, and a case starting from one.
 */

const [dispute, safety] = adminCasesPageData.cases;

export const adminResponseTimesData: AdminResponseTimesData = {
  resolutionHours: 72,
  queues: [
    { queue: 'disputes', firstReplyHours: 4, waitingOnStaff: 3, pastDue: 1, dueSoon: 1, week: { opened: 9, due: 8, onTime: 7, medianFirstReplyMinutes: 104 } },
    { queue: 'safety', firstReplyHours: 4, waitingOnStaff: 1, pastDue: 0, dueSoon: 1, week: { opened: 2, due: 2, onTime: 2, medianFirstReplyMinutes: 38 } },
    { queue: 'reports', firstReplyHours: 24, waitingOnStaff: 1, pastDue: 0, dueSoon: 0, week: { opened: 4, due: 3, onTime: 2, medianFirstReplyMinutes: 1210 } },
    { queue: 'requests', firstReplyHours: 24, waitingOnStaff: 0, pastDue: 0, dueSoon: 0, week: { opened: 1, due: 0, onTime: 0 } },
  ],
  pastDue: [dispute!],
  dueSoon: [{ ...safety!, id: 'case_safety_soon', slaDueAt: '2026-11-23T16:40:00.000Z' }],
  byAssignee: [
    { waiting: 3, pastDue: 0 },
    { staff: alexStaffSummary, waiting: 1, pastDue: 1 },
    { staff: morganStaffSummary, waiting: 1, pastDue: 0 },
  ],
};

export const adminResponseTimesCalmData: AdminResponseTimesData = {
  resolutionHours: 72,
  queues: adminResponseTimesData.queues.map((queue) => ({ ...queue, waitingOnStaff: 0, pastDue: 0, dueSoon: 0, week: { opened: 0, due: 0, onTime: 0 } })),
  pastDue: [],
  dueSoon: [],
  byAssignee: [],
};

const replies: SavedReplyView[] = [
  {
    id: 'mac_welcome',
    title: 'We’re on it',
    body: 'Hi {first_name},\n\nThanks for writing in. I’m looking into this now and will reply here by the end of the day.\n\n{staff_name}, TasksNearMe support',
    updatedAt: '2026-11-20T15:00:00.000Z',
    updatedBy: morganStaffSummary,
  },
  {
    id: 'mac_photos',
    title: 'Ask for photos',
    body: 'Hi {first_name},\n\nCould you add a few photos of the finished work? You can attach them right here. They help us settle this fairly for both of you.\n\n{staff_name}',
    queue: 'disputes',
    updatedAt: '2026-11-21T17:30:00.000Z',
    updatedBy: morganStaffSummary,
  },
  {
    id: 'mac_safety',
    title: 'Safety first',
    body: 'Hi {first_name},\n\nIf you are in danger right now, call 911. We’ve paused anything booked between you while we look into this, and we’ll write again within 4 hours.\n\n{staff_name}',
    queue: 'safety',
    updatedAt: '2026-11-18T12:00:00.000Z',
    updatedBy: morganStaffSummary,
  },
];

export const savedRepliesLeadData: AdminSavedRepliesPageData = { canManage: true, replies };
export const savedRepliesAgentData: AdminSavedRepliesPageData = { canManage: false, replies };
export const savedRepliesEmptyData: AdminSavedRepliesPageData = { canManage: true, replies: [] };

export const fakeSavedRepliesHandlers: AdminSavedRepliesHandlers = {
  onCreate: fakeHandler({ ok: true, code: 'saved' }),
  onUpdate: fakeHandler({ ok: true, code: 'updated' }),
  onArchive: fakeHandler({ ok: true, code: 'updated' }),
};

/** The dispute, with the replies a dispute can start from. */
export const disputeCaseWithSavedReplies: AdminCasePageData = {
  ...disputeAdminCaseData,
  savedReplies: replies.filter((reply) => !reply.queue || reply.queue === 'disputes').map(({ id, title, body }) => ({ id, title, body })),
};
