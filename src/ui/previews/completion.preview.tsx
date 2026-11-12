import type { ComponentProps } from 'react';
import {
  COMPLETION_UNAVAILABLE_REASONS, PROBLEM_UNAVAILABLE_REASONS, routes,
  type ActionResult, type AppShellHandlers, type BookingView, type CompletionHandlers,
  type CompletionPageData, type PreviewEntry, type ReportProblemHandlers,
  type ReportProblemPageData, type SignedInViewer,
} from '@/contracts';
import {
  completionUnavailableData, deskAllowanceCompletionPageData, deskBookingPosterCompletionWithExpenses,
  deskBookingPosterCompletionWithWork, deskCompletionPageData, deskCompletionView,
  deskReportProblemPageData, deskWithExpensesCompletionView, fakeBookingHubHandlers,
  fakeBookingSheetHandlers, fakeCompletionHandlers, fakeHandler, fakeReportProblemHandlers, jordanShell, mayaShell,
  movingBookingHelperCompletionHourly, movingBookingPosterCompletionHourly,
  movingCompletionPageData, movingCompletionView, remoteCompletionPageData,
  remoteComputerBreakdown, reportProblemUnavailableData,
} from '@/fixtures';
import { CompletionSummary } from '@/ui/components/bookings/completion-summary';
import { BookingHubScreen } from '@/ui/screens/bookings/booking-hub-screen';
import { CompletionContent, CompletionScreen } from '@/ui/screens/bookings/completion-screen';
import { ReportProblemContent, ReportProblemScreen } from '@/ui/screens/bookings/report-problem-screen';
import { AppShell } from '@/ui/shells/app-shell';
import { EvidencePhotoPickerPreview, type UploadError } from './completion-examples';
import copy from '../../../messages/en/ui/bookingComplete.json';
import feedback from '../../../messages/en/ui/feedback.json';
import reportCopy from '../../../messages/en/ui/reportProblem.json';

const now = '2026-11-21T18:10:00.000Z';
const movingNow = '2026-11-22T19:00:00.000Z';
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

type CompletionOptions = Pick<ComponentProps<typeof CompletionContent>, 'initialResult' | 'initialPending' | 'initialQuoteError'> & {
  handlers?: CompletionHandlers;
};
type ProblemOptions = Pick<ComponentProps<typeof ReportProblemContent>, 'initialResult' | 'initialPending'> & {
  handlers?: ReportProblemHandlers;
};

function completionPreview(id: string, title: string, data: CompletionPageData, options?: CompletionOptions, shellLayout: 'flow' | 'tabs' = 'flow'): PreviewEntry {
  const handlers: CompletionHandlers = {
    ...fakeCompletionHandlers,
    onSubmit: fakeHandler({ ok: true, code: 'submitted', redirectTo: routes.app.booking(data.booking.id) }),
  };
  return {
    id: `screen-booking-complete/${id}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={jordanShell} handlers={shellHandlers} currentPath={routes.app.bookingComplete(data.booking.id)} layout={shellLayout}>
      {options
        ? <CompletionContent data={data} handlers={handlers} now={now} {...options} />
        : <CompletionScreen data={data} handlers={handlers} now={now} />}
    </AppShell>,
  };
}

function problemPreview(id: string, title: string, data: ReportProblemPageData, options?: ProblemOptions, shellLayout: 'flow' | 'tabs' = 'flow'): PreviewEntry {
  const handlers: ReportProblemHandlers = {
    ...fakeReportProblemHandlers,
    onSubmit: fakeHandler({ ok: true, code: 'submitted', redirectTo: routes.app.booking(data.booking.id) }),
  };
  return {
    id: `screen-report-problem/${id}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.bookingProblem(data.booking.id)} layout={shellLayout}>
      {options
        ? <ReportProblemContent data={data} handlers={handlers} now={now} {...options} />
        : <ReportProblemScreen data={data} handlers={handlers} now={now} />}
    </AppShell>,
  };
}

function bookingPreview(id: string, title: string, data: BookingView, at = now): PreviewEntry {
  const person = data.viewerRole === 'poster' ? data.poster : data.helper;
  const viewer: SignedInViewer = {
    ...(data.viewerRole === 'poster' ? mayaShell : jordanShell),
    id: person.id, displayName: person.displayName, initials: person.initials,
  };
  return {
    id: `screen-booking/${id}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={routes.app.booking(data.id)} layout="flow">
      <BookingHubScreen data={data} handlers={fakeBookingHubHandlers} sheets={fakeBookingSheetHandlers} now={at} />
    </AppShell>,
  };
}

export const completionPreviews: PreviewEntry[] = [
  completionPreview('fixed', copy.previews.fixed, deskCompletionPageData),
  completionPreview('fixed-with-tabs', copy.previews.fixed, deskCompletionPageData, undefined, 'tabs'),
  completionPreview('with-expenses', copy.previews.withExpenses, deskAllowanceCompletionPageData),
  completionPreview('hourly', copy.previews.hourly, movingCompletionPageData),
  completionPreview('remote', copy.previews.remote, remoteCompletionPageData, {
    handlers: {
      ...fakeCompletionHandlers,
      // The shared fake returns the desk quote for any fixed task; retain the remote fixture's canonical amounts.
      onQuoteFinal: async () => { await fakeHandler()(undefined); return remoteComputerBreakdown; },
      onSubmit: fakeHandler({ ok: true, code: 'submitted', redirectTo: routes.app.booking(remoteCompletionPageData.booking.id) }),
    },
  }),
  ...COMPLETION_UNAVAILABLE_REASONS.map((reason) => completionPreview(
    `unavailable-${reason.replaceAll('_', '-')}`, copy.unavailable[reason], completionUnavailableData[reason],
  )),
  ...(['validation_failed', 'not_allowed', 'rate_limited', 'unknown'] as const).map((code) => {
    const result: ActionResult = {
      ok: false, code,
      ...(code === 'validation_failed' ? { fieldErrors: { photoIds: ['required' as const] } } : {}),
      ...(code === 'rate_limited' ? { retryAt: '2026-11-21T18:15:00.000Z' } : {}),
    };
    return completionPreview(`result-${code.replaceAll('_', '-')}`, feedback.error[code], deskCompletionPageData, {
      initialResult: result, handlers: { ...fakeCompletionHandlers, onSubmit: fakeHandler(result) },
    });
  }),
  completionPreview('quote-error', copy.previews.quoteError, deskCompletionPageData, {
    initialQuoteError: true,
    handlers: fakeCompletionHandlers,
  }),
  completionPreview('submitting', copy.previews.submitting, deskCompletionPageData, {
    initialPending: true, handlers: { ...fakeCompletionHandlers, onSubmit: () => new Promise(() => {}) },
  }),
  completionPreview('result-submitted', copy.previews.submitted, deskCompletionPageData, {
    initialResult: { ok: true, code: 'submitted' },
  }),

  problemPreview('default', reportCopy.title, deskReportProblemPageData),
  problemPreview('default-with-tabs', reportCopy.title, deskReportProblemPageData, undefined, 'tabs'),
  ...PROBLEM_UNAVAILABLE_REASONS.map((reason) => problemPreview(
    `unavailable-${reason.replaceAll('_', '-')}`, reportCopy.unavailable[reason], reportProblemUnavailableData[reason],
  )),
  ...(['validation_failed', 'expired', 'not_allowed', 'rate_limited', 'unknown'] as const).map((code) => {
    const result: ActionResult = {
      ok: false, code,
      ...(code === 'validation_failed' ? { fieldErrors: { description: ['too_short' as const] } } : {}),
      ...(code === 'rate_limited' ? { retryAt: '2026-11-21T18:15:00.000Z' } : {}),
    };
    return problemPreview(`result-${code.replaceAll('_', '-')}`, feedback.error[code], deskReportProblemPageData, {
      initialResult: result, handlers: { ...fakeReportProblemHandlers, onSubmit: fakeHandler(result) },
    });
  }),
  problemPreview('submitting', feedback.pending, deskReportProblemPageData, {
    initialPending: true, handlers: { ...fakeReportProblemHandlers, onSubmit: () => new Promise(() => {}) },
  }),
  problemPreview('result-submitted', feedback.success.submitted, deskReportProblemPageData, {
    initialResult: { ok: true, code: 'submitted' },
  }),

  bookingPreview('client-completion-with-work', copy.previews.clientWork, deskBookingPosterCompletionWithWork),
  bookingPreview('client-completion-with-expenses', copy.previews.clientExpenses, deskBookingPosterCompletionWithExpenses),
  bookingPreview('client-completion-hourly', copy.previews.clientHourly, movingBookingPosterCompletionHourly, movingNow),
  bookingPreview('helper-completion-hourly', copy.previews.helperHourly, movingBookingHelperCompletionHourly, movingNow),

  {
    id: 'component-completion-summary/fixed', title: copy.previews.summaryFixed, group: copy.previews.group,
    render: () => <CompletionSummary completion={deskCompletionView} variant="poster" leadsPage />,
  },
  {
    id: 'component-completion-summary/expenses', title: copy.previews.summaryExpenses, group: copy.previews.group,
    render: () => <CompletionSummary completion={deskWithExpensesCompletionView} variant="poster" leadsPage />,
  },
  {
    id: 'component-completion-summary/hourly', title: copy.previews.summaryHourly, group: copy.previews.group,
    render: () => <CompletionSummary completion={movingCompletionView} variant="poster" leadsPage />,
  },
  {
    id: 'component-completion-summary/helper-expenses', title: copy.previews.summaryHelperExpenses, group: copy.previews.group,
    render: () => <CompletionSummary completion={deskWithExpensesCompletionView} variant="helper" leadsPage />,
  },
  {
    id: 'component-evidence-photo-picker/populated', title: copy.previews.uploader, group: copy.previews.group,
    render: () => <EvidencePhotoPickerPreview />,
  },
  ...(['too_large', 'unsupported_type', 'too_many', 'rate_limited', 'unknown'] satisfies UploadError[]).map((code) => ({
    id: `component-evidence-photo-picker/error-${code.replaceAll('_', '-')}`,
    title: copy.previews.uploaderErrors, group: copy.previews.group,
    render: () => <EvidencePhotoPickerPreview uploadError={code} />,
  })),
];
