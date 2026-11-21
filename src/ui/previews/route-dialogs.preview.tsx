import type { ReactNode } from 'react';
import { routes, type AppShellHandlers, type PreviewEntry, type SignedInViewer } from '@/contracts';
import {
  deskChairChangeCounterpartyData, deskCompletionPageData, deskConfirmData, deskProposeChangeData, deskReportProblemPageData,
  deskReviewByClientData, editSavedSearchPageData, fakeBookingConfirmHandlers, fakeChangeReviewHandlers, fakeCompletionHandlers,
  fakeHandler, fakeProposeChangeHandlers, fakeProposeRebookHandlers, fakeReportProblemHandlers, fakeRequestHelperHandlers,
  jordanShell, mayaShell, newSavedSearchPageData, proposeDeskRebookData, reportHelperData, requestJordanData,
} from '@/fixtures';
import { RouteDialogFrame } from '@/ui/components/layout/route-dialog-frame';
import { BookingConfirmDialogScreen, ChangeReviewDialogScreen, CompletionDialogScreen, ProposeChangeDialogScreen, ReportProblemDialogScreen } from '@/ui/screens/bookings';
import { RequestHelperDialogScreen } from '@/ui/screens/invites';
import { ProposeRebookDialogScreen } from '@/ui/screens/clients';
import { ReviewDialogScreen } from '@/ui/screens/reviews';
import { EditSavedSearchDialog } from '@/ui/screens/searches/edit-saved-search-screen';
import { NewSavedSearchDialog } from '@/ui/screens/searches/new-saved-search-screen';
import { ReportDialogScreen } from '@/ui/screens/support';
import { AppShell } from '@/ui/shells/app-shell';
import bookingComplete from '../../../messages/en/ui/bookingComplete.json';
import bookingConfirm from '../../../messages/en/ui/bookingConfirm.json';
import changes from '../../../messages/en/ui/changes.json';
import clients from '../../../messages/en/ui/clients.json';
import common from '../../../messages/en/ui/common.json';
import invites from '../../../messages/en/ui/invites.json';
import report from '../../../messages/en/ui/report.json';
import reportProblem from '../../../messages/en/ui/reportProblem.json';
import review from '../../../messages/en/ui/review.json';
import savedSearches from '../../../messages/en/ui/savedSearches.json';

/**
 * Pages that open as a dialog over the page they're reached from (src/app/[locale]/@modal), in the one frame they
 * share: a sheet from the bottom at 360, a centered dialog at 1280. Their states are the full pages' (the same forms).
 */
const now = '2026-11-21T15:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function dialog(id: string, name: string, viewer: SignedInViewer, under: string, screen: () => ReactNode): PreviewEntry {
  return {
    id: `route-dialog/${id}`, group: common.dialogPreviewsGroup, title: common.dialogPreviewTitle.replace('{name}', name), layout: 'fullscreen',
    render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={under} layout="flow"><RouteDialogFrame>{screen()}</RouteDialogFrame></AppShell>,
  };
}

export const routeDialogPreviews: PreviewEntry[] = [
  dialog('report', report.title.helper, mayaShell, routes.app.home(), () => <ReportDialogScreen data={reportHelperData} handlers={{ onReport: fakeHandler({ ok: true, code: 'submitted' }) }} />),
  dialog('save-search', savedSearches.new.title, mayaShell, routes.app.home(), () => <NewSavedSearchDialog data={newSavedSearchPageData} handlers={{ onSave: fakeHandler({ ok: true, code: 'saved' }) }} />),
  dialog('edit-saved-search', savedSearches.edit.title, jordanShell, routes.app.savedSearches(), () => <EditSavedSearchDialog data={editSavedSearchPageData} handlers={{ onSave: fakeHandler({ ok: true, code: 'saved' }) }} />),
  dialog('review', review.previews.byClient, mayaShell, routes.app.booking(deskReviewByClientData.booking.id), () => <ReviewDialogScreen data={deskReviewByClientData} now={now} handlers={{ onSubmit: fakeHandler({ ok: true, code: 'submitted', redirectTo: routes.app.booking(deskReviewByClientData.booking.id) }) }} />),
  dialog('report-problem', reportProblem.title, mayaShell, routes.app.booking(deskReportProblemPageData.booking.id), () => <ReportProblemDialogScreen data={deskReportProblemPageData} now={now} handlers={fakeReportProblemHandlers} />),
  dialog('propose-change', changes.propose.title, mayaShell, routes.app.booking(deskProposeChangeData.booking.id), () => <ProposeChangeDialogScreen data={deskProposeChangeData} now={now} handlers={{ ...fakeProposeChangeHandlers, onPropose: fakeHandler({ ok: true, code: 'sent' }) }} />),
  dialog('propose-rebook', clients.form.title, jordanShell, routes.app.clients(), () => <ProposeRebookDialogScreen data={proposeDeskRebookData} now={now} handlers={{ ...fakeProposeRebookHandlers, onPropose: fakeHandler({ ok: true, code: 'sent' }) }} />),
  dialog('change-review', changes.review.title.replace('{title}', deskChairChangeCounterpartyData.booking.title), jordanShell, routes.app.booking(deskChairChangeCounterpartyData.booking.id), () => <ChangeReviewDialogScreen data={deskChairChangeCounterpartyData} now={now} handlers={fakeChangeReviewHandlers} />),
  dialog('send-for-approval', bookingComplete.title, jordanShell, routes.app.booking(deskCompletionPageData.booking.id), () => <CompletionDialogScreen data={deskCompletionPageData} now={now} handlers={fakeCompletionHandlers} />),
  dialog('checkout', bookingConfirm.title, mayaShell, routes.app.offer(deskConfirmData.task.id, deskConfirmData.offer.id), () => <BookingConfirmDialogScreen data={deskConfirmData} now={now} handlers={fakeBookingConfirmHandlers} />),
  dialog('request-helper', invites.title.replace('{helper}', requestJordanData.helper.displayName), mayaShell, routes.helperProfile(requestJordanData.helper.handle), () => <RequestHelperDialogScreen data={requestJordanData} now={now} handlers={fakeRequestHelperHandlers} />),
];
