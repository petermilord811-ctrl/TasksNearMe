import type { ReportHandlers, ReportSubject, SupportCaseHandlers, SupportCasePageData, SupportHandlers, SupportPageData } from '@/contracts';
import { routes } from '@/contracts';
import { uploadedTaskPhotos } from './posting';
import { DESK_TIMES } from './timeline';

/** Support for members (UI-031): Maya's cases and requests, a conversation with support, reporting and blocking. */

export const mayaSupportPageData: SupportPageData = {
  cases: [
    {
      id: 'case_dispute',
      kind: 'dispute',
      status: 'awaiting_poster',
      subject: 'Assemble a desk (flat-pack, 1 item)',
      bookingId: 'bkg_desk',
      viewerRole: 'poster',
      openedAt: '2026-11-22T15:00:00.000Z',
      updatedAt: '2026-11-23T16:30:00.000Z',
      unread: true,
    },
    {
      id: 'case_request',
      kind: 'request',
      status: 'awaiting_support',
      subject: 'Payment',
      topic: 'payment',
      openedAt: '2026-11-18T14:00:00.000Z',
      updatedAt: '2026-11-18T14:00:00.000Z',
      unread: false,
    },
    {
      id: 'case_old',
      kind: 'request',
      status: 'closed',
      subject: 'Account',
      topic: 'account',
      openedAt: '2026-10-02T14:00:00.000Z',
      updatedAt: '2026-10-03T10:00:00.000Z',
      unread: false,
    },
  ],
  bookings: [{ id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', start: DESK_TIMES.agreedStart }],
  maxPhotoMegabytes: 10,
};

export const supportEmptyData: SupportPageData = { cases: [], bookings: [], maxPhotoMegabytes: 10 };

/** Maya reported a problem with the desk; support asked a question. */
export const disputeCasePageData: SupportCasePageData = {
  case: {
    id: 'case_dispute',
    kind: 'dispute',
    status: 'awaiting_poster',
    subject: 'Assemble a desk (flat-pack, 1 item)',
    bookingId: 'bkg_desk',
    viewerRole: 'poster',
    openedAt: '2026-11-22T15:00:00.000Z',
    updatedAt: '2026-11-23T16:30:00.000Z',
    description: 'The drawers were left in the box and one side panel is scratched.',
  },
  events: [
    { id: 'ev_1', kind: 'message', from: 'me', body: 'The drawers were left in the box and one side panel is scratched.', photos: [uploadedTaskPhotos[0]!], at: '2026-11-22T15:00:00.000Z' },
    { id: 'ev_2', kind: 'status', from: 'system', status: 'awaiting_support', at: '2026-11-22T15:00:00.000Z' },
    { id: 'ev_3', kind: 'message', from: 'support', body: 'Thanks, Maya. Jordan offered to come back on Sunday to finish the drawers. Would that work?', at: '2026-11-23T16:30:00.000Z' },
    { id: 'ev_4', kind: 'status', from: 'system', status: 'awaiting_poster', at: '2026-11-23T16:30:00.000Z' },
  ],
  canReply: true,
};

/** A closed request: readable, no reply. */
export const closedCasePageData: SupportCasePageData = {
  case: {
    id: 'case_old',
    kind: 'request',
    status: 'closed',
    subject: 'Account',
    topic: 'account',
    openedAt: '2026-10-02T14:00:00.000Z',
    updatedAt: '2026-10-03T10:00:00.000Z',
    description: 'How do I change my email address?',
  },
  events: [
    { id: 'ev_a', kind: 'message', from: 'me', body: 'How do I change my email address?', at: '2026-10-02T14:00:00.000Z' },
    { id: 'ev_b', kind: 'message', from: 'support', body: 'Done! Your account now uses the new address.', at: '2026-10-03T09:55:00.000Z' },
    { id: 'ev_c', kind: 'status', from: 'system', status: 'closed', at: '2026-10-03T10:00:00.000Z' },
  ],
  canReply: false,
};

export const jordanReportSubject: ReportSubject = { userId: 'usr_jordan', displayName: 'Jordan T.', blocked: false };
export const blockedReportSubject: ReportSubject = { ...jordanReportSubject, blocked: true };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeSupportHandlers: SupportHandlers = {
  onCreate: () => wait({ ok: true, code: 'submitted', redirectTo: routes.app.supportCase('case_new') }),
  onUploadPhoto: () => wait({ ok: true, photo: { id: 'ph_support_1', src: '/samples/work-desk.svg', alt: 'Attached photo', width: 800, height: 600 } }),
};

export const fakeSupportCaseHandlers: SupportCaseHandlers = {
  onReply: () => wait({ ok: true, code: 'sent' }),
};

export const fakeReportHandlers: ReportHandlers = {
  onReport: () => wait({ ok: true, code: 'submitted' }),
  onBlock: () => wait({ ok: true, code: 'updated' }),
};
