import type { ComponentType } from 'react';
import type { BookingView, PreviewEntry } from '@/contracts';
import {
  deskBookingHelperCantAccessAvailable, deskBookingHelperWithSheets,
  deskBookingPosterCantAccessReported, deskBookingPosterNoShowNotYet, deskBookingPosterNoShowReportable,
  deskBookingPosterWithSheets, deskCancelPreviewHelperEarly, deskCancelPreviewHelperLate,
  deskCancelPreviewPosterEarly, deskCancelPreviewPosterLate,
} from '@/fixtures';
import { CancelBookingSheet, CantAccessSheet, ReportNoShowSheet, RunningLateSheet, SafetyReportSheet } from '@/ui/screens/bookings/sheets';
import { BookingHubSheetExample, SheetExample, type SheetOptions, type SheetProps } from './booking-sheets-examples';
import copy from '../../../messages/en/ui/bookingSheets.json';
import feedback from '../../../messages/en/ui/feedback.json';

const now = '2026-11-21T17:00:00.000Z';

function hubPreview(id: string, title: string, data: BookingView, at = now): PreviewEntry {
  return {
    id: `screen-booking/${id}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <BookingHubSheetExample data={data} at={at} />,
  };
}

function sheetPreview(id: string, title: string, SheetComponent: ComponentType<SheetProps>, data: BookingView, options: SheetOptions = {}): PreviewEntry {
  return {
    id, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <SheetExample SheetComponent={SheetComponent} data={data} options={options} />,
  };
}

export const bookingSheetsPreviews: PreviewEntry[] = [
  {
    id: 'screen-booking/sheet-handlers-unavailable', title: copy.previews.previewError, group: copy.previews.group, layout: 'fullscreen',
    render: () => <BookingHubSheetExample data={deskBookingPosterWithSheets} unavailable />,
  },
  hubPreview('client-with-sheets', copy.previews.clientWithSheets, deskBookingPosterWithSheets),
  hubPreview('helper-with-sheets', copy.previews.helperWithSheets, deskBookingHelperWithSheets),
  // helper-running-late is registered by bookings.preview.tsx with the canonical sheet fixture.
  hubPreview('client-no-show-reportable', copy.previews.clientNoShowReportable, deskBookingPosterNoShowReportable),
  hubPreview('client-no-show-not-yet', copy.previews.clientNoShowNotYet, deskBookingPosterNoShowNotYet, '2026-11-21T16:50:00.000Z'),
  hubPreview('helper-cant-access-available', copy.previews.helperCantAccessAvailable, deskBookingHelperCantAccessAvailable),
  hubPreview('client-cant-access-reported', copy.previews.clientCantAccessReported, deskBookingPosterCantAccessReported),
  sheetPreview('sheet-cancel/client-early', copy.previews.clientEarly, CancelBookingSheet, deskBookingPosterWithSheets, { initialPreview: deskCancelPreviewPosterEarly }),
  sheetPreview('sheet-cancel/client-late', copy.previews.clientLate, CancelBookingSheet, deskBookingPosterWithSheets, { initialPreview: deskCancelPreviewPosterLate }),
  sheetPreview('sheet-cancel/helper-early', copy.previews.helperEarly, CancelBookingSheet, deskBookingHelperWithSheets, { initialPreview: deskCancelPreviewHelperEarly }),
  sheetPreview('sheet-cancel/helper-late', copy.previews.helperLate, CancelBookingSheet, deskBookingHelperWithSheets, { initialPreview: deskCancelPreviewHelperLate }),
  sheetPreview('sheet-cancel/loading', copy.previews.loading, CancelBookingSheet, deskBookingPosterWithSheets, { initialPreviewState: 'loading' }),
  sheetPreview('sheet-cancel/preview-error', copy.previews.previewError, CancelBookingSheet, deskBookingPosterWithSheets, { initialPreviewState: 'error' }),
  sheetPreview('sheet-cancel/result-not-allowed', copy.previews.resultNotAllowed, CancelBookingSheet, deskBookingPosterWithSheets, {
    initialPreview: deskCancelPreviewPosterLate,
    initialResult: { ok: false, code: 'not_allowed' }, initialValues: { reason: 'plans_changed' },
  }),
  sheetPreview('sheet-running-late/default', copy.previews.runningLate, RunningLateSheet, deskBookingHelperWithSheets),
  sheetPreview('sheet-no-show/default', copy.previews.noShow, ReportNoShowSheet, deskBookingPosterNoShowReportable),
  sheetPreview('sheet-cant-access/default', copy.previews.cantAccess, CantAccessSheet, deskBookingHelperCantAccessAvailable),
  sheetPreview('sheet-safety/default', copy.previews.safety, SafetyReportSheet, deskBookingPosterWithSheets),
  sheetPreview('sheet-safety/sending', copy.previews.sending, SafetyReportSheet, deskBookingPosterWithSheets, {
    initialPending: true, initialValues: { kind: 'unsafe_now', description: copy.previews.safetyDescription },
  }),
  sheetPreview('sheet-safety/sent', copy.previews.sent, SafetyReportSheet, deskBookingPosterWithSheets, {
    initialResult: { ok: true, code: 'submitted' },
  }),
  sheetPreview('sheet-safety/validation-failed', copy.previews.validationFailed, SafetyReportSheet, deskBookingPosterWithSheets, {
    initialResult: { ok: false, code: 'validation_failed', fieldErrors: { kind: ['required'], description: ['too_short'] } },
  }),
  ...(['rate_limited', 'unknown'] as const).map((code) => sheetPreview(
    `sheet-safety/result-${code.replaceAll('_', '-')}`, feedback.error[code], SafetyReportSheet, deskBookingPosterWithSheets,
    { initialResult: { ok: false, code, ...(code === 'rate_limited' ? { retryAt: '2026-11-21T17:05:00.000Z' } : {}) } },
  )),
];
