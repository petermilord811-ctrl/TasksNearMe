import type { AdminLiveChatRow, AdminLiveChatView, AdminLiveHandlers, AdminLivePageData, PersonSummary } from '@/contracts';
import { alexStaffSummary, morganStaffSummary } from './admin';
import { maya, priya, ruth } from './people';

/**
 * The staff live chat console (2026-11-22): who waits for a person, the viewer's chats and everyone else's, and the
 * open chat in each state. Times are around the admin "now", 2026-11-23 16:00 UTC.
 */

const person = (p: PersonSummary, username: string): PersonSummary => ({ id: p.id, displayName: p.displayName, initials: p.initials, memberSince: p.memberSince, phoneVerified: p.phoneVerified, username });

const mayaMember = person(maya, 'maya');
const priyaMember = person(priya, 'priya');
const ruthMember = person(ruth, 'ruth');

const mayaWaiting: AdminLiveChatRow = {
  caseId: 'case_live_maya',
  member: mayaMember,
  topic: 'booking',
  requestedAt: '2026-11-23T15:56:00.000Z',
  last: { from: 'member', body: 'Jordan never came for the desk on Saturday. I waited two hours.', at: '2026-11-23T15:56:00.000Z' },
  waitingOnSupport: true,
};

const priyaWaiting: AdminLiveChatRow = {
  caseId: 'case_live_priya',
  member: priyaMember,
  topic: 'payment',
  requestedAt: '2026-11-23T15:58:00.000Z',
  last: { from: 'assistant', body: 'A refund goes back to the card you paid with, usually in 5 to 10 business days.', at: '2026-11-23T15:57:40.000Z' },
  waitingOnSupport: true,
};

const ruthWithMorgan: AdminLiveChatRow = {
  caseId: 'case_live_ruth',
  member: ruthMember,
  topic: 'account',
  requestedAt: '2026-11-23T15:40:00.000Z',
  joinedAt: '2026-11-23T15:42:00.000Z',
  agent: morganStaffSummary,
  last: { from: 'support', body: "I've sent a new sign-in code to your email. Can you check your spam folder too?", at: '2026-11-23T15:50:00.000Z' },
  waitingOnSupport: false,
};

const mayaChatEvents: AdminLiveChatView['events'] = [
  { id: 'aev_live_q', kind: 'message', actor: { kind: 'member', person: mayaMember }, partyId: maya.id, body: 'My helper never showed up. Can I get my money back?', at: '2026-11-23T15:55:00.000Z' },
  { id: 'aev_live_a', kind: 'message', actor: { kind: 'assistant' }, partyId: maya.id, body: "I'm sorry that happened. If your helper didn't come, report it from the booking within 48 hours and we'll pause the payment.", at: '2026-11-23T15:55:01.000Z' },
  { id: 'aev_live_m', kind: 'message', actor: { kind: 'member', person: mayaMember }, partyId: maya.id, body: 'Jordan never came for the desk on Saturday. I waited two hours.', at: '2026-11-23T15:56:00.000Z' },
];

const waitingChat: AdminLiveChatView = {
  caseId: mayaWaiting.caseId,
  member: mayaMember,
  topic: 'booking',
  status: 'open',
  state: 'waiting',
  isMine: false,
  events: mayaChatEvents,
  canJoin: true,
  canEnd: false,
  canReply: false,
  requestedAt: mayaWaiting.requestedAt,
};

const joinedChat: AdminLiveChatView = {
  ...waitingChat,
  status: 'awaiting_poster',
  state: 'joined',
  agent: alexStaffSummary,
  isMine: true,
  canJoin: false,
  canEnd: true,
  canReply: true,
  events: [
    ...mayaChatEvents,
    { id: 'aev_live_join', kind: 'live', actor: { kind: 'staff', staff: alexStaffSummary }, live: 'joined', at: '2026-11-23T15:58:00.000Z' },
    { id: 'aev_live_r1', kind: 'message', actor: { kind: 'staff', staff: alexStaffSummary }, partyId: maya.id, body: "Hi Maya, I'm Alex from support. I'm sorry Jordan didn't come. I've paused the payment. Did Jordan message you that day?", at: '2026-11-23T15:58:30.000Z' },
    { id: 'aev_live_r2', kind: 'message', actor: { kind: 'member', person: mayaMember }, partyId: maya.id, body: 'No, nothing since Friday.', at: '2026-11-23T15:59:10.000Z' },
  ],
};

/** Two people wait, Morgan is on Ruth's chat, nothing open. */
export const adminLiveQueueData: AdminLivePageData = {
  waiting: [mayaWaiting, priyaWaiting],
  mine: [],
  others: [ruthWithMorgan],
  agentsOnline: 2,
  canWork: true,
};

/** Maya's chat open before anyone joined: Join. */
export const adminLiveWaitingChatData: AdminLivePageData = { ...adminLiveQueueData, selected: waitingChat };

/** Alex joined Maya's chat and they're talking. */
export const adminLiveJoinedChatData: AdminLivePageData = {
  waiting: [priyaWaiting],
  mine: [{ ...mayaWaiting, joinedAt: '2026-11-23T15:58:00.000Z', agent: alexStaffSummary, last: { from: 'member', body: 'No, nothing since Friday.', at: '2026-11-23T15:59:10.000Z' } }],
  others: [ruthWithMorgan],
  selected: joinedChat,
  agentsOnline: 2,
  canWork: true,
};

/** Morgan's chat with Ruth, opened by Alex: read only. */
export const adminLiveOthersChatData: AdminLivePageData = {
  ...adminLiveQueueData,
  selected: {
    caseId: ruthWithMorgan.caseId,
    member: ruthMember,
    topic: 'account',
    status: 'awaiting_poster',
    state: 'joined',
    agent: morganStaffSummary,
    isMine: false,
    canJoin: false,
    canEnd: false,
    canReply: false,
    requestedAt: ruthWithMorgan.requestedAt,
    events: [
      { id: 'aev_ruth_1', kind: 'message', actor: { kind: 'member', person: ruthMember }, partyId: ruth.id, body: "The sign-in code never arrives and I can't get into my account.", at: '2026-11-23T15:40:00.000Z' },
      { id: 'aev_ruth_join', kind: 'live', actor: { kind: 'staff', staff: morganStaffSummary }, live: 'joined', at: '2026-11-23T15:42:00.000Z' },
      { id: 'aev_ruth_2', kind: 'message', actor: { kind: 'staff', staff: morganStaffSummary }, partyId: ruth.id, body: "I've sent a new sign-in code to your email. Can you check your spam folder too?", at: '2026-11-23T15:50:00.000Z' },
    ],
  },
};

/** The chat Alex ended: the case goes on in its queue. */
export const adminLiveEndedChatData: AdminLivePageData = {
  waiting: [priyaWaiting],
  mine: [],
  others: [ruthWithMorgan],
  selected: {
    ...joinedChat,
    state: 'ended',
    canEnd: false,
    canReply: false,
    events: [...joinedChat.events, { id: 'aev_live_end', kind: 'live', actor: { kind: 'staff', staff: alexStaffSummary }, live: 'ended', at: '2026-11-23T16:00:00.000Z' }],
  },
  agentsOnline: 2,
  canWork: true,
};

/** The member rated the chat after it ended (2026-11-23): staff see it in the conversation. */
export const adminLiveRatedChatData: AdminLivePageData = {
  ...adminLiveEndedChatData,
  selected: {
    ...adminLiveEndedChatData.selected!,
    events: [
      ...adminLiveEndedChatData.selected!.events,
      { id: 'aev_rating', kind: 'rating', actor: { kind: 'member', person: adminLiveEndedChatData.selected!.member }, rating: 'good', body: 'Alex paused the payment right away. Thank you!', at: '2026-11-23T16:01:00.000Z' },
    ],
  },
};

/** Nobody waiting and no chats. */
export const adminLiveEmptyData: AdminLivePageData = { waiting: [], mine: [], others: [], agentsOnline: 1, canWork: true };

const wait = <T,>(value: T, ms = 300) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminLiveHandlers: AdminLiveHandlers = {
  onJoin: () => wait({ ok: true, code: 'updated' }),
  onEnd: () => wait({ ok: true, code: 'updated' }),
  onReply: () => wait({ ok: true, code: 'sent' }),
  onTyping: async () => undefined,
};
