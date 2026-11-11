import type { ComponentProps } from 'react';
import {
  ACTION_ERROR_CODES, CANCEL_REASONS, COMPLETED_VIA, routes,
  type ActionResult, type AppShellHandlers, type BookingsPageData,
  type BookingView, type PreviewEntry, type SignedInViewer,
} from '@/contracts';
import {
  bookingsEmptyData, deskBookingHelperCompleted, deskBookingHelperCompletedAddressHidden,
  deskBookingHelperConfirmed, deskBookingHelperDayOf, deskBookingHelperInProgress,
  deskBookingHelperPendingFunding, deskBookingPosterCanceledByHelper, deskBookingPosterCanceledLate,
  deskBookingPosterCompleted, deskBookingPosterCompletionSubmitted, deskBookingPosterConfirmed,
  deskBookingPosterPendingFunding, fakeBookingHubHandlers, fakeHandler, jordanBookingsPageData,
  jordanShell, mayaBookingsNeedsActionData, mayaBookingsPageData, mayaShell,
  movingBookingPosterConfirmed, remoteBookingHelperConfirmed,
} from '@/fixtures';
import { BookingHubContent } from '@/ui/screens/bookings/booking-hub-screen';
import { BookingsScreen } from '@/ui/screens/bookings/bookings-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/bookingHub.json';

const beforeTask = '2026-11-20T15:00:00.000Z';
const dayOf = '2026-11-21T16:00:00.000Z';
const afterSubmission = '2026-11-21T18:00:00.000Z';
const afterApproval = '2026-11-21T19:10:00.000Z';
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

type PreviewOptions = Pick<ComponentProps<typeof BookingHubContent>, 'initialResult' | 'initialPending' | 'handlers' | 'now'>;

function hubPreview(id: string, title: string, data: BookingView, options: Partial<PreviewOptions> = {}): PreviewEntry {
  const person = data.viewerRole === 'poster' ? data.poster : data.helper;
  const viewer: SignedInViewer = {
    ...(data.viewerRole === 'poster' ? mayaShell : jordanShell),
    id: person.id, displayName: person.displayName, initials: person.initials,
  };
  return {
    id: `screen-booking/${id}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={routes.app.booking(data.id)} layout="flow">
      <BookingHubContent data={data} handlers={fakeBookingHubHandlers} now={beforeTask} {...options} />
    </AppShell>,
  };
}

function listPreview(id: string, title: string, data: BookingsPageData, viewer = mayaShell, now = beforeTask): PreviewEntry {
  return {
    id: `screen-bookings/${id}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={routes.app.bookings()}>
      <BookingsScreen data={data} now={now} />
    </AppShell>,
  };
}

export const bookingsPreviews: PreviewEntry[] = [
  listPreview('client', copy.previews.listClient, mayaBookingsPageData),
  listPreview('client-needs-action', copy.previews.listNeedsAction, mayaBookingsNeedsActionData, mayaShell, afterSubmission),
  listPreview('helper', copy.previews.listHelper, jordanBookingsPageData, jordanShell),
  listPreview('empty', copy.previews.listEmpty, bookingsEmptyData),
  hubPreview('client-confirmed', copy.previews.clientConfirmed, deskBookingPosterConfirmed),
  hubPreview('helper-confirmed', copy.previews.helperConfirmed, deskBookingHelperConfirmed),
  hubPreview('helper-day-of', copy.previews.helperDayOf, deskBookingHelperDayOf, { now: dayOf }),
  hubPreview('helper-in-progress', copy.previews.helperInProgress, deskBookingHelperInProgress, { now: '2026-11-21T16:30:00.000Z' }),
  hubPreview('client-pending-funding', copy.previews.clientPendingFunding, deskBookingPosterPendingFunding, { now: '2026-11-17T15:02:00.000Z' }),
  hubPreview('helper-pending-funding', copy.previews.helperPendingFunding, deskBookingHelperPendingFunding, { now: '2026-11-17T15:02:00.000Z' }),
  hubPreview('client-completion-submitted', copy.previews.clientCompletionSubmitted, deskBookingPosterCompletionSubmitted, { now: afterSubmission }),
  hubPreview('client-completed', copy.previews.clientCompleted, deskBookingPosterCompleted, { now: afterApproval }),
  hubPreview('helper-completed', copy.previews.helperCompleted, deskBookingHelperCompleted, { now: afterApproval }),
  hubPreview('helper-completed-address-hidden', copy.previews.helperAddressHidden, deskBookingHelperCompletedAddressHidden, { now: '2026-11-24T19:10:00.000Z' }),
  hubPreview('client-canceled-late', copy.previews.clientCanceledLate, deskBookingPosterCanceledLate, { now: '2026-11-20T23:00:00.000Z' }),
  hubPreview('client-canceled-by-helper', copy.previews.clientCanceledByHelper, deskBookingPosterCanceledByHelper),
  hubPreview('helper-canceled', copy.previews.helperCanceled, {
    ...deskBookingPosterCanceledByHelper, viewerRole: 'helper', exactAddress: undefined, payments: undefined, actions: [],
  }),
  hubPreview('client-hourly', copy.previews.clientHourly, movingBookingPosterConfirmed),
  hubPreview('helper-remote', copy.previews.helperRemote, remoteBookingHelperConfirmed),
  hubPreview('client-in-progress', copy.previews.clientInProgress, {
    ...deskBookingHelperInProgress, viewerRole: 'poster', payments: deskBookingPosterConfirmed.payments,
    actions: deskBookingPosterConfirmed.actions,
  }, { now: '2026-11-21T16:30:00.000Z' }),
  hubPreview('helper-completion-submitted', copy.previews.helperCompletionSubmitted, {
    ...deskBookingPosterCompletionSubmitted, viewerRole: 'helper', payments: undefined,
    actions: [{ id: 'message', kind: 'primary', enabled: true }],
  }, { now: afterSubmission }),
  hubPreview('client-disputed', copy.previews.clientDisputed, {
    ...deskBookingPosterCompletionSubmitted, status: 'disputed', deadlines: {},
    actions: [{ id: 'contact_support', kind: 'primary', enabled: true }],
  }, { now: afterSubmission }),
  hubPreview('helper-disputed', copy.previews.helperDisputed, {
    ...deskBookingHelperInProgress, status: 'disputed', deadlines: {},
    actions: [{ id: 'contact_support', kind: 'primary', enabled: true }],
  }, { now: afterSubmission }),
  hubPreview('helper-running-late', copy.previews.runningLate, {
    ...deskBookingHelperDayOf, checkIn: { ...deskBookingHelperDayOf.checkIn, lateByMinutes: 20 },
  }, { now: dayOf }),
  // Dedicated reason variants omit payment/event histories whose amounts or actors would imply a different cancellation.
  ...CANCEL_REASONS.filter((reason) => reason !== 'poster_late' && reason !== 'helper').map((reason) => hubPreview(
    `client-canceled-${reason.replaceAll('_', '-')}`,
    copy.previews.cancelReasons[reason as keyof typeof copy.previews.cancelReasons],
    { ...deskBookingPosterCanceledLate, cancelReason: reason, payments: undefined, timeline: [] },
    { now: afterApproval },
  )),
  ...COMPLETED_VIA.filter((via) => via !== 'poster').map((via) => hubPreview(
    `helper-completed-${via}`,
    copy.previews.completedVia[via as keyof typeof copy.previews.completedVia],
    { ...deskBookingHelperCompleted, completedVia: via, timeline: [] },
    { now: afterApproval },
  )),
  ...ACTION_ERROR_CODES.map((code) => {
    const result: ActionResult = { ok: false, code, ...(code === 'rate_limited' ? { retryAt: '2026-11-21T16:05:00.000Z' } : {}) };
    return hubPreview(`result-${code.replaceAll('_', '-')}`, copy.previews.results[code], deskBookingHelperDayOf, {
      now: dayOf, initialResult: result, handlers: { onAction: fakeHandler(result) },
    });
  }),
  hubPreview('submitting', copy.previews.submitting, deskBookingHelperDayOf, {
    now: dayOf, initialPending: 'arrived', handlers: { onAction: () => new Promise(() => {}) },
  }),
  hubPreview('result-updated', copy.previews.updated, deskBookingHelperInProgress, {
    now: '2026-11-21T16:30:00.000Z', initialResult: { ok: true, code: 'updated' },
    handlers: { onAction: fakeHandler({ ok: true, code: 'updated' }) },
  }),
];
