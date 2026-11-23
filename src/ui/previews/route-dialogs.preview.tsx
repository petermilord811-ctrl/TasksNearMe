import type { ReactNode } from 'react';
import { routes, type AppShellHandlers, type CommunityNewPostHandlers, type PreviewEntry, type SignedInViewer } from '@/contracts';
import {
  communityNewPostPageData, communityPhotos, deskChairChangeCounterpartyData, deskCompletionPageData, deskConfirmData, deskOfferDetailData, deskProposeChangeData, deskReceiptPageData,
  deskReportProblemPageData, deskReviewByClientData, editSavedSearchPageData, fakeBookingConfirmHandlers, fakeChangeReviewHandlers, fakeCompletionHandlers,
  fakeHandler, fakeHelperWorkHandlers, fakeNotificationHandlers, fakeProposalHandlers, fakeProposeChangeHandlers, fakeProposeRebookHandlers, fakeReportProblemHandlers,
  fakeRequestHelperHandlers, helperYardNoOffer, inviteHelpersBookshelfData, inviteHelpersEmptyData, jordanShell, mayaNotificationsData, mayaShell, newSavedSearchPageData,
  notificationsEmptyData, proposalPosterData, proposeDeskRebookData, reportHelperData, requestJordanData,
} from '@/fixtures';
import { RouteDialogFrame } from '@/ui/components/layout/route-dialog-frame';
import { BookingConfirmDialogScreen, ChangeReviewDialogScreen, CompletionDialogScreen, ProposeChangeDialogScreen, ReportProblemDialogScreen } from '@/ui/screens/bookings';
import { InviteHelpersDialogScreen, RequestHelperDialogScreen } from '@/ui/screens/invites';
import { ProposalDialogScreen, ProposeRebookDialogScreen } from '@/ui/screens/clients';
import { NotificationsDialogScreen } from '@/ui/screens/account';
import { ReceiptDialogScreen } from '@/ui/screens/money';
import { OfferDetailDialogScreen } from '@/ui/screens/tasks';
import { HelperTaskDialogScreen } from '@/ui/screens/work';
import { ReviewDialogScreen } from '@/ui/screens/reviews';
import { CommunityNewPostDialog } from '@/ui/screens/community/community-new-post-screen';
import { EditSavedSearchDialog } from '@/ui/screens/searches/edit-saved-search-screen';
import { NewSavedSearchDialog } from '@/ui/screens/searches/new-saved-search-screen';
import { ReportDialogScreen } from '@/ui/screens/support';
import { AppShell } from '@/ui/shells/app-shell';
import bookingComplete from '../../../messages/en/ui/bookingComplete.json';
import bookingConfirm from '../../../messages/en/ui/bookingConfirm.json';
import changes from '../../../messages/en/ui/changes.json';
import clients from '../../../messages/en/ui/clients.json';
import common from '../../../messages/en/ui/common.json';
import community from '../../../messages/en/ui/community.json';
import helperTask from '../../../messages/en/ui/helperTask.json';
import invites from '../../../messages/en/ui/invites.json';
import notifications from '../../../messages/en/ui/notifications.json';
import offers from '../../../messages/en/ui/offers.json';
import proposal from '../../../messages/en/ui/proposal.json';
import receipt from '../../../messages/en/ui/receipt.json';
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

const newPostHandlers: CommunityNewPostHandlers = { onPost: fakeHandler({ ok: true, code: 'sent' }), onUploadPhoto: async () => ({ ok: true, photo: communityPhotos.lake }) };

export const routeDialogPreviews: PreviewEntry[] = [
  // A new post (2026-11-22): a general post by default, an ask with its title and the season's starters.
  dialog('new-post', community.previews.newDialog, mayaShell, routes.app.community(), () => <CommunityNewPostDialog data={communityNewPostPageData} handlers={newPostHandlers} />),
  dialog('new-post-recommendation', community.previews.newDialogRecommendation, mayaShell, routes.app.community(), () => <CommunityNewPostDialog data={{ ...communityNewPostPageData, kind: 'recommendation' }} handlers={newPostHandlers} />),
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
  // 2026-11-23 (owner: "I hate to redirect to new pages continually"): the bell, an offer, a receipt, a proposal,
  // Invite helpers and a task from the helper's side open over the page too.
  dialog('notifications', notifications.title, mayaShell, routes.app.home(), () => <NotificationsDialogScreen data={mayaNotificationsData} now="2026-11-21T18:00:00.000Z" handlers={fakeNotificationHandlers} />),
  dialog('notifications-empty', `${notifications.title}: ${notifications.empty.title}`, mayaShell, routes.app.home(), () => <NotificationsDialogScreen data={notificationsEmptyData} now="2026-11-21T18:00:00.000Z" handlers={fakeNotificationHandlers} />),
  dialog('offer', offers.offerFrom.replace('{helper}', deskOfferDetailData.offer.helper.displayName), mayaShell, routes.app.task(deskOfferDetailData.task.id), () => <OfferDetailDialogScreen data={deskOfferDetailData} now="2026-11-17T15:00:00.000Z" handlers={{ onOfferAction: fakeHandler({ ok: true, code: 'updated' }) }} />),
  dialog('receipt', receipt.title, mayaShell, routes.app.payments(), () => <ReceiptDialogScreen data={deskReceiptPageData} />),
  dialog('proposal', proposal.title.poster.replace('{helper}', proposalPosterData.proposal.helper.displayName), mayaShell, routes.app.home(), () => <ProposalDialogScreen data={proposalPosterData} now="2026-12-08T17:00:00.000Z" handlers={fakeProposalHandlers} />),
  dialog('invite-helpers', invites.inviteHelpers.title, mayaShell, routes.app.task(inviteHelpersBookshelfData.task.id), () => <InviteHelpersDialogScreen data={inviteHelpersBookshelfData} />),
  dialog('invite-helpers-empty', `${invites.inviteHelpers.title}: ${invites.inviteHelpers.empty.title}`, mayaShell, routes.app.task(inviteHelpersEmptyData.task.id), () => <InviteHelpersDialogScreen data={inviteHelpersEmptyData} />),
  dialog('helper-task', helperTask.previews['offer-form'], jordanShell, routes.app.findWork(), () => <HelperTaskDialogScreen data={helperYardNoOffer} now="2026-11-17T15:00:00.000Z" handlers={{ ...fakeHelperWorkHandlers, onSubmitOffer: fakeHandler({ ok: true, code: 'sent' }) }} />),
];
