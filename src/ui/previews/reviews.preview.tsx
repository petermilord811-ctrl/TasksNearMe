import {
  ACTION_ERROR_CODES, REVIEW_UNAVAILABLE_REASONS, routes,
  type ActionResult, type AppShellHandlers, type PreviewEntry, type ReviewPageData,
} from '@/contracts';
import {
  deskReviewByClientData, deskReviewByHelperData, deskReviewPublishedData,
  deskReviewSubmittedData, deskReviewTheirsMissingData, fakeHandler, jordanShell, mayaShell, reviewUnavailableData, reviewWindowClosedTheirsData,
} from '@/fixtures';
import { ReviewContent } from '@/ui/screens/reviews/review-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/review.json';
import feedback from '../../../messages/en/ui/feedback.json';

const now = '2026-11-22T15:00:00.000Z';
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

function preview(variant: string, title: string, data: ReviewPageData, initialResult?: ActionResult, initialPending?: boolean): PreviewEntry {
  return {
    id: `screen-review/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={data.direction === 'client_to_helper' ? mayaShell : jordanShell} handlers={shellHandlers} currentPath={routes.app.bookingReview(data.booking.id)} layout="flow">
      <ReviewContent data={data} now={now} handlers={{ onSubmit: fakeHandler(initialResult ?? { ok: true, code: 'submitted', redirectTo: routes.app.booking(data.booking.id) }) }} initialResult={initialResult} initialPending={initialPending} />
    </AppShell>,
  };
}

export const reviewPreviews: PreviewEntry[] = [
  preview('by-client', copy.previews.byClient, deskReviewByClientData),
  preview('by-helper', copy.previews.byHelper, deskReviewByHelperData),
  preview('submitted', copy.previews.submitted, deskReviewSubmittedData),
  preview('published', copy.previews.published, deskReviewPublishedData),
  preview('theirs-missing', copy.previews.theirsMissing, deskReviewTheirsMissingData),
  preview('window-closed-theirs', copy.previews.windowClosedTheirs, reviewWindowClosedTheirsData),
  ...REVIEW_UNAVAILABLE_REASONS.map((reason) => preview(`unavailable-${reason.replaceAll('_', '-')}`, copy.previews.unavailable[reason], reviewUnavailableData[reason])),
  ...ACTION_ERROR_CODES.map((code) => preview(`result-${code.replaceAll('_', '-')}`, feedback.error[code], deskReviewByClientData, {
    ok: false, code,
    ...(code === 'validation_failed' ? { fieldErrors: { rating: ['required' as const] } } : {}),
    ...(code === 'rate_limited' ? { retryAt: '2026-11-22T15:05:00.000Z' } : {}),
  })),
  preview('submitting', copy.previews.submitting, deskReviewByClientData, undefined, true),
  preview('result-submitted', copy.previews.success, deskReviewByClientData, { ok: true, code: 'submitted' }),
];
