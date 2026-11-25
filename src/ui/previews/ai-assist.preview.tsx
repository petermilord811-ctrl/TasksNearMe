import type { ReactNode } from 'react';
import { routes, type AppShellHandlers, type BookingView, type CommunityNewPostHandlers, type CommunityPostHandlers, type PreviewEntry, type ReviewHandlers, type TaskDraftInput } from '@/contracts';
import {
  ADMIN_NOW, adminCaseSummary, adminCaseSummaryResult, alexStaff, bookingChecklistResult, communityAnswerResult, communityNewPostPageData,
  communityPhotos, communityPolishResult, communityPostAnswerDraftData, deskBookingHelperPrepMade, deskBookingPosterPrep, deskBookingPosterPrepMade,
  deskBookingPosterPrepStale, deskDraft, deskReviewByClientData, disputeAdminCaseData, fakeAdminCaseHandlers, fakeBookingHubHandlers,
  fakeBookingSheetHandlers, fakeHandler, fakePostTaskHandlers, fakeQuery, jordanShell, mayaShell, postTaskPageData, postTaskResults,
  priceCheckAbove, priceCheckBelow, priceCheckNoBudget, priceCheckResult, priceCheckWithin, publicViewer, reviewDraftResult,
  samProfileWithSummaryData, addressSuggestions, uploadedTaskPhotos,
} from '@/fixtures';
import { AdminCaseContent } from '@/ui/screens/admin/admin-case-screen';
import { BookingHubContent } from '@/ui/screens/bookings/booking-hub-screen';
import { CommunityNewPostScreen } from '@/ui/screens/community/community-new-post-screen';
import { CommunityPostScreen } from '@/ui/screens/community/community-post-screen';
import { PostTaskScreen } from '@/ui/screens/posting/post-task-screen';
import type { PriceCheckState } from '@/ui/screens/posting/price-check';
import { HelperProfileScreen } from '@/ui/screens/public/helper-profile-screen';
import { ReviewContent } from '@/ui/screens/reviews/review-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import { AppShell } from '@/ui/shells/app-shell';
import { PublicShell } from '@/ui/shells/public-shell';
import adminCaseCopy from '../../../messages/en/ui/adminCase.json';
import bookingCopy from '../../../messages/en/ui/bookingHub.json';
import communityCopy from '../../../messages/en/ui/community.json';
import profileCopy from '../../../messages/en/ui/helperProfile.json';
import postTaskCopy from '../../../messages/en/ui/postTask.json';
import reviewCopy from '../../../messages/en/ui/review.json';

/**
 * The AI features (2026-11-24; src/contracts/ai-assist.ts), each where it lives: the review form's "Write it with AI",
 * a booking's "Get ready", the budget step's price check, Neighbors' "Make it clearer" and "Draft an answer", a helper's
 * "What neighbors say", and staff's case summary. Each state the screens show: before, while AI works, done, and failed.
 */

const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const reviewNow = '2026-11-22T15:00:00.000Z';
const bookingNow = '2026-11-20T15:00:00.000Z';
const communityNow = '2026-11-17T15:00:00.000Z';

function appScreen(viewer: typeof mayaShell, path: string, children: ReactNode, layout: 'flow' | undefined = 'flow') {
  return <AppShell viewer={viewer} handlers={shellHandlers} currentPath={path} {...(layout ? { layout } : {})}>{children}</AppShell>;
}

// ---- Reviews ----------------------------------------------------------------------------------------------------

const reviewHandlers: ReviewHandlers = {
  onSubmit: fakeHandler({ ok: true, code: 'submitted', redirectTo: routes.app.booking(deskReviewByClientData.booking.id) }),
  onDraftReview: fakeQuery(reviewDraftResult),
};

function reviewPreview(variant: string, title: string, seeds: Parameters<typeof ReviewContent>[0]['aiPreview'] = undefined): PreviewEntry {
  return {
    id: `screen-review/${variant}`, group: reviewCopy.previews.group, title, layout: 'fullscreen',
    render: () => appScreen(mayaShell, routes.app.bookingReview(deskReviewByClientData.booking.id),
      <ReviewContent data={deskReviewByClientData} now={reviewNow} handlers={reviewHandlers} {...(seeds ? { aiPreview: seeds } : {})} />),
  };
}

// ---- Bookings: Get ready ------------------------------------------------------------------------------------------

function prepPreview(variant: string, title: string, data: BookingView): PreviewEntry {
  return {
    id: `screen-booking/${variant}`, group: bookingCopy.previews.group, title, layout: 'fullscreen',
    render: () => appScreen(data.viewerRole === 'poster' ? mayaShell : jordanShell, routes.app.booking(data.id),
      <BookingHubContent data={data} handlers={fakeBookingHubHandlers} sheets={fakeBookingSheetHandlers} now={bookingNow} prep={{ onPrepare: fakeQuery(bookingChecklistResult) }} />),
  };
}

// ---- Posting: Check my price with AI -------------------------------------------------------------------------------

const postHandlers = { ...fakePostTaskHandlers, onPost: fakeHandler<TaskDraftInput>(postTaskResults.posted), onCheckPrice: fakeQuery(priceCheckResult(priceCheckWithin)) };
/** The desk with the price the check compared (the form and the card agree). */
const deskWithPrice = (priceCents = 12000) => ({ initialValues: { ...deskDraft, budget: { type: 'fixed' as const, priceCents } }, initialAddress: addressSuggestions[0], initialPhotos: uploadedTaskPhotos });

function pricePreview(variant: keyof typeof postTaskCopy.previews, state: PriceCheckState, priceCents?: number): PreviewEntry {
  return {
    id: `screen-post-task/${variant}`, group: postTaskCopy.previews.group, title: postTaskCopy.previews[variant], layout: 'fullscreen',
    render: () => appScreen(mayaShell, routes.app.newTask(),
      <PostTaskScreen data={postTaskPageData} handlers={postHandlers} persistDraft={false} initialStep="budget" {...deskWithPrice(priceCents)} priceCheckPreview={state} />),
  };
}

// ---- Neighbors ----------------------------------------------------------------------------------------------------

const postHandlersWithDraft: CommunityPostHandlers = {
  onReact: fakeHandler({ ok: true, code: 'updated' }),
  onReply: fakeHandler({ ok: true, code: 'sent' }),
  onPin: fakeHandler({ ok: true, code: 'updated' }),
  onDelete: fakeHandler({ ok: true, code: 'updated' }),
  onUploadPhoto: async () => ({ ok: true, photo: communityPhotos.shelf }),
  onDraftAnswer: fakeQuery(communityAnswerResult),
};
const newPostHandlers: CommunityNewPostHandlers = { onPost: fakeHandler({ ok: true, code: 'sent' }), onUploadPhoto: async () => ({ ok: true, photo: communityPhotos.boxes }), onPolish: fakeQuery(communityPolishResult) };
// Each its own device draft key: a draft one leaves behind never shows up in another composer preview.
const aiComposerData = (variant: string) => ({ ...communityNewPostPageData, kind: 'recommendation' as const, draftKey: `community-draft:austin:preview-ai-${variant}` });
const roughPost = { title: 'who can build ikea desk n bookshelf', body: 'got a desk and bookshelf from ikea need someone this weekend whos careful' };

// ---- Staff ----------------------------------------------------------------------------------------------------------

function staffCase(state: Parameters<typeof AdminCaseContent>[0]['summaryState']) {
  return <AdminShell viewer={alexStaff} handlers={{ onSignOut: fakeHandler({ ok: true, code: 'updated' }) }} currentPath={routes.admin.case(disputeAdminCaseData.case.id)}>
    <AdminCaseContent data={disputeAdminCaseData} handlers={{ ...fakeAdminCaseHandlers, onSummarize: fakeQuery(adminCaseSummaryResult) }} now={ADMIN_NOW} {...(state ? { summaryState: state } : {})} />
  </AdminShell>;
}

export const aiAssistPreviews: PreviewEntry[] = [
  reviewPreview('ai-draft', reviewCopy.previews.aiDraft),
  reviewPreview('ai-drafted', reviewCopy.previews.aiDrafted, { outcome: { kind: 'drafted' }, values: { rating: 5, tags: ['on_time', 'careful'], body: reviewDraftResult.ok ? reviewDraftResult.value.body : '' } }),
  reviewPreview('ai-failed', reviewCopy.previews.aiFailed, { outcome: { kind: 'failed', code: 'unavailable' }, values: { rating: 4 } }),

  prepPreview('prep-empty', bookingCopy.previews.prepEmpty, deskBookingPosterPrep),
  prepPreview('prep-made', bookingCopy.previews.prepMade, deskBookingPosterPrepMade),
  prepPreview('prep-stale', bookingCopy.previews.prepStale, deskBookingPosterPrepStale),
  prepPreview('prep-helper', bookingCopy.previews.prepHelper, deskBookingHelperPrepMade),

  pricePreview('price-idle', { kind: 'idle' }),
  pricePreview('price-pending', { kind: 'pending' }),
  pricePreview('price-within', { kind: 'checked', check: priceCheckWithin }),
  pricePreview('price-below', { kind: 'checked', check: priceCheckBelow }, priceCheckBelow.budgetCents),
  pricePreview('price-above', { kind: 'checked', check: priceCheckAbove }, priceCheckAbove.budgetCents),
  pricePreview('price-no-budget', { kind: 'checked', check: priceCheckNoBudget }, 0),
  pricePreview('price-unavailable', { kind: 'failed', outcome: 'unavailable' }),

  {
    id: 'screen-community/new-post-polish', group: communityCopy.previews.group, title: communityCopy.previews.newPostPolish, layout: 'fullscreen',
    render: () => appScreen(mayaShell, routes.app.newCommunityPost(), <CommunityNewPostScreen data={aiComposerData('polish')} handlers={newPostHandlers} polishPreview={{ values: roughPost }} />, undefined),
  },
  {
    id: 'screen-community/new-post-polished', group: communityCopy.previews.group, title: communityCopy.previews.newPostPolished, layout: 'fullscreen',
    render: () => appScreen(mayaShell, routes.app.newCommunityPost(), <CommunityNewPostScreen data={aiComposerData('polished')} handlers={newPostHandlers} polishPreview={{ outcome: { kind: 'drafted' }, values: communityPolishResult.ok ? communityPolishResult.value : roughPost }} />, undefined),
  },
  {
    id: 'screen-community/post-answer-draft', group: communityCopy.previews.group, title: communityCopy.previews.postAnswerDraft, layout: 'fullscreen',
    render: () => appScreen(jordanShell, routes.app.communityPost(communityPostAnswerDraftData.post.id), <CommunityPostScreen data={communityPostAnswerDraftData} handlers={postHandlersWithDraft} now={communityNow} />, undefined),
  },
  {
    id: 'screen-community/post-answer-drafted', group: communityCopy.previews.group, title: communityCopy.previews.postAnswerDrafted, layout: 'fullscreen',
    render: () => appScreen(jordanShell, routes.app.communityPost(communityPostAnswerDraftData.post.id), <CommunityPostScreen data={communityPostAnswerDraftData} handlers={postHandlersWithDraft} now={communityNow} answerPreview={{ outcome: { kind: 'drafted' }, body: communityAnswerResult.ok ? communityAnswerResult.value.body : '' }} />, undefined),
  },

  {
    id: 'screen-helper-profile/review-summary', group: profileCopy.preview.group, title: profileCopy.preview.reviewSummary, layout: 'fullscreen',
    render: () => <PublicShell viewer={publicViewer} currentPath={routes.helperProfile(samProfileWithSummaryData.helper.handle)}><HelperProfileScreen data={samProfileWithSummaryData} /></PublicShell>,
  },

  {
    id: 'screen-admin-case/summary', group: adminCaseCopy.previews.group, title: adminCaseCopy.previews.summary, layout: 'fullscreen',
    render: () => staffCase({ kind: 'done', summary: adminCaseSummary }),
  },
];
