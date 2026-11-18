import { routes, type AiSearchResult, type AppShellHandlers, type AttentionItem, type DashboardData, type DashboardHandlers, type ISODateTime, type PreviewEntry, type SignedInViewer } from '@/contracts';
import {
  aiAnswerClientResult,
  aiAnswerHelperResult,
  aiAnswerProhibitedResult,
  aiAnswerUnavailableResult,
  DASHBOARD_CLIENT_NOW,
  DASHBOARD_HELPER_NOW,
  deskBookingPosterCantAccessReported,
  deskBookingPosterPendingFunding,
  fakeHandler,
  jordanBothDashboardData,
  jordanDashboardData,
  jordanDashboardDoneData,
  jordanDashboardNearbyMapData,
  jordanDashboardOffersData,
  jordanDashboardPayoutData,
  jordanShell,
  mayaDashboardBookingsCardsData,
  mayaDashboardCountedData,
  mayaDashboardData,
  mayaDashboardFilteredData,
  mayaDashboardMapData,
  mayaDashboardMonthlyLimitData,
  mayaDashboardNeedsPlanData,
  mayaDashboardOffersData,
  mayaDashboardSearchData,
  mayaShell,
  priyaDashboardData,
  priyaDashboardWaitingData,
  priyaShell,
  ruth,
  ruthDashboardData,
} from '@/fixtures';
import { DashboardScreen } from '@/ui/screens/home';
import { AiAnswer, type AiAnswerState } from '@/ui/screens/home/ai-answer';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/home.json';

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};
const ruthShell: SignedInViewer = { ...mayaShell, id: ruth.id, displayName: ruth.displayName, initials: ruth.initials, unreadMessages: 0, unreadNotifications: 0 };

/** Ask AI answers after a moment with the fixture's answer. */
const answering = (result: AiSearchResult): DashboardHandlers => ({ onAiSearch: () => new Promise((resolve) => setTimeout(() => resolve(result), 600)) });

function screen(variant: string, title: string, data: DashboardData, viewer: SignedInViewer, now: ISODateTime, options: { answer?: AiAnswerState; ai?: AiSearchResult } = {}): PreviewEntry {
  return {
    id: `screen-home/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={routes.app.home()}>
      <DashboardScreen data={data} now={now} liveMap={false} handlers={answering(options.ai ?? aiAnswerClientResult)} {...(options.answer ? { initialAiAnswer: options.answer } : {})} />
    </AppShell>,
  };
}

/** One more item first in "Needs your attention". */
const withAttention = (data: DashboardData, item: AttentionItem): DashboardData => ({ ...data, attention: [item, ...data.attention], summary: { ...data.summary, needsYou: data.summary.needsYou + 1 } });

function answer(variant: string, title: string, state: AiAnswerState): PreviewEntry {
  return { id: `home-ai-answer/${variant}`, title, group: copy.previews.group, render: () => <AiAnswer state={state} onClose={() => undefined} /> };
}

export const homePreviews: PreviewEntry[] = [
  screen('client', copy.previews.client, mayaDashboardCountedData, mayaShell, DASHBOARD_CLIENT_NOW, { answer: { status: 'done', text: 'My new IKEA desk needs assembling this weekend near Mueller', result: aiAnswerClientResult } }),
  screen('client-offers', copy.previews.clientOffers, mayaDashboardOffersData, mayaShell, DASHBOARD_CLIENT_NOW),
  screen('client-bookings-cards', copy.previews.clientBookingsCards, mayaDashboardBookingsCardsData, mayaShell, DASHBOARD_CLIENT_NOW),
  screen('client-map', copy.previews.clientMap, mayaDashboardMapData, mayaShell, DASHBOARD_CLIENT_NOW),
  screen('client-empty', copy.previews.clientEmpty, ruthDashboardData, ruthShell, DASHBOARD_CLIENT_NOW),
  screen('client-filtered', copy.previews.clientFiltered, mayaDashboardFilteredData, mayaShell, DASHBOARD_CLIENT_NOW),
  screen('client-search', copy.previews.clientSearch, mayaDashboardSearchData, mayaShell, DASHBOARD_CLIENT_NOW),
  screen('client-ai-needs-plan', copy.previews.clientAiNeedsPlan, mayaDashboardNeedsPlanData, mayaShell, DASHBOARD_CLIENT_NOW),
  screen('client-ai-monthly-limit', copy.previews.clientAiMonthlyLimit, mayaDashboardMonthlyLimitData, mayaShell, DASHBOARD_CLIENT_NOW),
  screen('client-payment-access', copy.previews.clientPaymentAccess, {
    ...mayaDashboardData,
    attention: [
      { id: 'payment', kind: 'finish_payment', title: deskBookingPosterPendingFunding.task.title, dueAt: deskBookingPosterPendingFunding.deadlines.pendingFundingExpiresAt, target: { kind: 'booking', bookingId: deskBookingPosterPendingFunding.id } },
      { id: 'access', kind: 'answer_cant_access', title: deskBookingPosterCantAccessReported.task.title, dueAt: deskBookingPosterCantAccessReported.deadlines.posterResponseDueAt, target: { kind: 'booking', bookingId: deskBookingPosterCantAccessReported.id } },
    ],
  }, mayaShell, DASHBOARD_CLIENT_NOW),
  screen('helper', copy.previews.helper, jordanDashboardData, jordanShell, DASHBOARD_HELPER_NOW, { ai: aiAnswerHelperResult }),
  screen('helper-nearby-map', copy.previews.helperNearbyMap, jordanDashboardNearbyMapData, jordanShell, DASHBOARD_HELPER_NOW),
  screen('helper-offers', copy.previews.helperOffers, jordanDashboardOffersData, jordanShell, DASHBOARD_HELPER_NOW),
  screen('helper-done', copy.previews.helperDone, jordanDashboardDoneData, jordanShell, DASHBOARD_HELPER_NOW),
  screen('helper-payout-action', copy.previews.helperPayoutAction, jordanDashboardPayoutData, jordanShell, DASHBOARD_HELPER_NOW),
  screen('helper-ai-answer', copy.previews.helperAiAnswer, jordanDashboardData, jordanShell, DASHBOARD_HELPER_NOW, { ai: aiAnswerHelperResult, answer: { status: 'done', text: 'Moving or furniture work this weekend', result: aiAnswerHelperResult } }),
  // The same morning 15 minutes after the desk's 10:30 start, not checked in yet (audit M51): the past tense.
  screen('helper-late', copy.previews.helperLate, jordanDashboardData, jordanShell, '2026-11-21T16:45:00.000Z'),
  screen('helper-not-set-up', copy.previews.helperNotSetUp, priyaDashboardData, priyaShell, DASHBOARD_HELPER_NOW),
  screen('helper-waiting', copy.previews.helperWaiting, priyaDashboardWaitingData, priyaShell, DASHBOARD_HELPER_NOW),
  screen('both', copy.previews.both, jordanBothDashboardData, jordanShell, DASHBOARD_HELPER_NOW),
  // Someone is waiting on an answer (UI-025, UI-032): the request, the counter-offer, the proposal.
  screen('helper-invite', copy.previews.helperInvite, withAttention(jordanDashboardData, { id: 'att_invite_inv_bookshelf', kind: 'answer_invite', title: 'Assemble a bookshelf', dueAt: '2026-12-10T16:00:00.000Z', actorName: 'Maya R.', target: { kind: 'invite', inviteId: 'inv_bookshelf' } }), jordanShell, '2026-12-08T17:00:00.000Z'),
  screen('client-counter', copy.previews.clientCounter, withAttention(mayaDashboardData, { id: 'att_counter_inv_bookshelf', kind: 'answer_counter', title: 'Assemble a bookshelf', dueAt: '2026-12-09T16:00:00.000Z', actorName: 'Jordan T.', target: { kind: 'task', taskId: 'tsk_bookshelf' } }), mayaShell, '2026-12-08T17:00:00.000Z'),
  screen('client-proposal', copy.previews.clientProposal, withAttention(mayaDashboardData, { id: 'att_proposal_prp_desk', kind: 'answer_proposal', title: 'Assemble a desk (flat-pack, 1 item)', dueAt: '2026-12-10T17:00:00.000Z', actorName: 'Jordan T.', target: { kind: 'proposal', proposalId: 'prp_desk' } }), mayaShell, '2026-12-08T17:00:00.000Z'),
  answer('client', copy.previews.aiAnswerClient, { status: 'done', text: 'My new IKEA desk needs assembling this weekend', result: aiAnswerClientResult }),
  answer('helper', copy.previews.aiAnswerHelper, { status: 'done', text: 'Moving work this weekend', result: aiAnswerHelperResult }),
  answer('pending', copy.previews.aiAnswerPending, { status: 'pending', text: 'My new IKEA desk' }),
  answer('unavailable', copy.previews.aiAnswerError, { status: 'done', text: 'A desk', result: aiAnswerUnavailableResult }),
  answer('prohibited', copy.previews.aiAnswerProhibited, { status: 'done', text: 'Something not allowed', result: aiAnswerProhibitedResult }),
];
