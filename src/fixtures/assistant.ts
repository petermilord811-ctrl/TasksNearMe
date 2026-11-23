import type {
  ActionResult,
  AssistantTranscript,
  AssistantTurn,
  ChatInboxData,
  ChatThreadData,
  ChatThreadHandlers,
  HelpChatData,
  HelpChatHandlers,
  HelpSummary,
  LiveChatHours,
  SupportAgentView,
} from '@/contracts';
import { conversationSearchData, deskBookingThreadPageData, inboxEmptyData, mayaFoldersInboxData, mayaInboxWithDirectData, requestCardThreadPageData, requestThreadPageData } from './messaging';
import { jordanSparks } from './sparks';

/**
 * The chat window and TasksNearMe Help (2026-11-22): every state the window, the pinned Help row and the Help
 * conversation show, for previews and tests. Times are around the canonical "now", 2026-11-17 16:00 UTC.
 */

const turn = (id: string, question: string, answer: AssistantTurn['answer'], at: string): AssistantTurn => ({ id, question, answer, at, token: 'preview-token-0000000000000000000000000000000' });

export const chargedTurn = turn(
  'atn_preview_1',
  'When am I charged for a booking?',
  {
    text: 'Your card is charged when you book a helper, for the price you agreed. The money is held until you approve the work.\n\n- If you cancel early enough, you get a full refund.\n- After the task, you have 72 hours to approve it or report a problem.',
    sources: [
      { slug: 'when-am-i-charged', title: 'When am I charged?' },
      { slug: 'cancel-a-booking', title: 'Canceling a booking' },
    ],
    handoff: 'none',
    topic: 'payment',
    summary: 'Asked when a booking is charged.',
  },
  '2026-11-17T15:52:00.000Z',
);

export const refundTurn = turn(
  'atn_preview_2',
  'My helper never showed up. Can I get my money back?',
  {
    text: "I'm sorry that happened. A no-show is reported from the booking, and the payment stays paused while our team looks. Only our support team can decide on a refund, so let's get you a person.",
    sources: [{ slug: 'report-a-problem', title: 'Reporting a problem with a task' }],
    handoff: 'suggest',
    topic: 'booking',
    summary: 'Helper did not show up for a booking; asks for a refund.',
  },
  '2026-11-17T15:55:00.000Z',
);

export const urgentTurn = turn(
  'atn_preview_3',
  'The person at my door is threatening me',
  {
    text: 'If anyone is in danger right now, call 911. Then a person from our team can help, and safety reports go to the front of the line.',
    sources: [{ slug: 'staying-safe', title: 'Staying safe' }],
    handoff: 'urgent',
    topic: 'safety',
    summary: 'Says someone at their door is threatening them.',
  },
  '2026-11-17T15:58:00.000Z',
);

export const emptyTranscript: AssistantTranscript = { turns: [] };
export const answeredTranscript: AssistantTranscript = { turns: [chargedTurn] };
export const suggestTranscript: AssistantTranscript = { turns: [chargedTurn, refundTurn] };
export const urgentTranscript: AssistantTranscript = { turns: [urgentTurn] };
export const pendingTranscript: AssistantTranscript = { turns: [chargedTurn], pending: 'Can I change the time of my booking?' };
export const failedTranscript: AssistantTranscript = { turns: [chargedTurn], error: { code: 'unavailable', question: 'Can I change the time of my booking?' } };

const replyHours = { booking: 24, payment: 24, account: 24, safety: 4, other: 24 } as const;

/**
 * Live chat hours (2026-11-23): Monday to Friday 9–18, Saturday 10–14, Gainesville time. At the canonical "now" (Tuesday
 * 11:00 Eastern) it's open until 18:00; `liveHoursClosed` is the same week seen on Saturday evening (opens Monday 9:00).
 */
const liveSchedule: LiveChatHours['schedule'] = [
  { fromDay: 1, toDay: 5, opens: '09:00', closes: '18:00' },
  { fromDay: 6, toDay: 6, opens: '10:00', closes: '14:00' },
];
export const liveHoursOpen: LiveChatHours = { open: true, nextChange: '2026-11-17T23:00:00.000Z', schedule: liveSchedule, timeZone: 'America/New_York' };
export const liveHoursClosed: LiveChatHours = { open: false, nextChange: '2026-11-23T14:00:00.000Z', schedule: liveSchedule, timeZone: 'America/New_York' };

/** Riley from support, as members see them on a live chat: first name and photo (2026-11-23). Never a last name. */
export const rileyAgent: SupportAgentView = {
  name: 'Riley',
  initials: 'R',
  photo: { id: 'fil_avatar_riley', src: '/samples/avatar-sam.svg', alt: 'Riley', width: 512, height: 512 },
};
/** The same without a photo: the first name's initial. */
export const rileyAgentNoPhoto: SupportAgentView = { name: 'Riley', initials: 'R' };

export const helpChatAssistantData: HelpChatData = {
  viewer: { firstName: 'Maya', mode: 'poster' },
  assistantAvailable: true,
  handoff: { bookings: [{ id: 'bkg_desk', title: 'Assemble an IKEA desk', start: '2026-11-15T15:00:00.000Z' }], replyHours },
  liveHours: liveHoursOpen,
};

export const helpChatUnavailableData: HelpChatData = { ...helpChatAssistantData, assistantAvailable: false };

export const helpChatCaseWaitingData: HelpChatData = {
  ...helpChatAssistantData,
  case: {
    id: 'case_help_1',
    status: 'open',
    topic: 'booking',
    canReply: true,
    unread: false,
    openedAt: '2026-11-17T15:56:00.000Z',
    replyHours: 24,
    canRequestLive: true,
    events: [
      { id: 'cev_q1', kind: 'message', from: 'me', body: refundTurn.question, at: refundTurn.at },
      { id: 'cev_a1', kind: 'message', from: 'assistant', body: `${refundTurn.answer.text}\n\n· Reporting a problem with a task`, at: '2026-11-17T15:55:00.001Z' },
      { id: 'case_help_1_opened', kind: 'message', from: 'me', body: 'Jordan never came for the desk on Saturday. I waited two hours.', at: '2026-11-17T15:56:00.000Z' },
    ],
  },
};

export const helpChatCaseRepliedData: HelpChatData = {
  ...helpChatCaseWaitingData,
  case: {
    ...helpChatCaseWaitingData.case!,
    status: 'awaiting_poster',
    events: [
      ...helpChatCaseWaitingData.case!.events,
      { id: 'cev_s1', kind: 'message', from: 'support', body: "Hi Maya, I'm Riley from support. I'm sorry Jordan didn't come. I've paused the payment. Can you tell me if Jordan messaged you that day?", at: '2026-11-17T15:59:00.000Z' },
      { id: 'cev_st1', kind: 'status', from: 'system', status: 'awaiting_poster', at: '2026-11-17T15:59:00.001Z' },
    ],
  },
};

/** Live chat (2026-11-22): they asked for a person; second in line, and someone from support is online. */
export const helpChatLiveWaitingData: HelpChatData = {
  ...helpChatCaseWaitingData,
  case: {
    ...helpChatCaseWaitingData.case!,
    canRequestLive: false,
    live: { state: 'waiting', position: 2, agentsOnline: true, requestedAt: '2026-11-17T15:56:00.000Z' },
  },
};

/** Live chat asked for while no one from support is online: the case waits for a reply as messages. */
export const helpChatLiveOfflineData: HelpChatData = {
  ...helpChatLiveWaitingData,
  case: { ...helpChatLiveWaitingData.case!, live: { state: 'waiting', position: 1, agentsOnline: false, requestedAt: '2026-11-17T15:56:00.000Z' } },
};

/** Riley from support joined the live chat and wrote first. */
export const helpChatLiveJoinedData: HelpChatData = {
  ...helpChatCaseWaitingData,
  case: {
    ...helpChatCaseWaitingData.case!,
    status: 'awaiting_poster',
    canRequestLive: false,
    live: { state: 'joined', agentsOnline: true, agentName: 'Riley', requestedAt: '2026-11-17T15:56:00.000Z' },
    events: [
      ...helpChatCaseWaitingData.case!.events,
      { id: 'cev_live1', kind: 'live', from: 'system', live: 'joined', agentName: 'Riley', at: '2026-11-17T15:58:00.000Z' },
      { id: 'cev_s1', kind: 'message', from: 'support', body: "Hi Maya, I'm Riley from support. I'm sorry Jordan didn't come. I've paused the payment. Did Jordan message you that day?", at: '2026-11-17T15:58:30.000Z' },
    ],
  },
};

/** The live chat ended; the case goes on as messages. */
export const helpChatLiveEndedData: HelpChatData = {
  ...helpChatLiveJoinedData,
  case: {
    ...helpChatLiveJoinedData.case!,
    live: { state: 'ended', agentsOnline: true, agentName: 'Riley', requestedAt: '2026-11-17T15:56:00.000Z' },
    events: [
      ...helpChatLiveJoinedData.case!.events,
      { id: 'cev_m2', kind: 'message', from: 'me', body: 'No, nothing since Friday.', at: '2026-11-17T15:59:00.000Z' },
      { id: 'cev_live2', kind: 'live', from: 'system', live: 'ended', agentName: 'Riley', at: '2026-11-17T15:59:30.000Z' },
    ],
  },
};

export const helpChatRecentData: HelpChatData = { ...helpChatAssistantData, recent: { id: 'case_help_0', status: 'resolved', topic: 'payment' } };

// ---- After a live chat (2026-11-23, owner: "Live support: rate the chat afterwards, see the agent's name and photo, and
// get a transcript by email") ------------------------------------------------------------------------------------------

/** Riley joined with their photo: the header, the joined line and their messages show it. */
export const helpChatLiveAgentData: HelpChatData = {
  ...helpChatLiveJoinedData,
  case: {
    ...helpChatLiveJoinedData.case!,
    live: { state: 'joined', agentsOnline: true, agentName: 'Riley', agent: rileyAgent, requestedAt: '2026-11-17T15:56:00.000Z' },
    events: helpChatLiveJoinedData.case!.events.map((event) => (event.id === 'cev_live1' || event.id === 'cev_s1' ? { ...event, agent: rileyAgent } : event)),
  },
};

/** Asked for a person on Saturday evening: live chat is closed until Monday 9:00, and support replies here and by email. */
export const helpChatLiveClosedData: HelpChatData = { ...helpChatLiveOfflineData, liveHours: liveHoursClosed };

/** The member's own address, partly hidden, for "Email me this conversation". */
export const helpTranscript = { to: 'm•••@example.test' };

/** The live chat ended: "How was your chat with Riley?", and a copy by email. */
export const helpChatRateData: HelpChatData = {
  ...helpChatLiveEndedData,
  case: {
    ...helpChatLiveEndedData.case!,
    events: helpChatLiveEndedData.case!.events.map((event) => (event.id === 'cev_live1' || event.id === 'cev_s1' ? { ...event, agent: rileyAgentNoPhoto } : event)),
    rating: { canRate: true },
    transcript: helpTranscript,
  },
};

/** Rated good with a comment; it can still be changed until a week after. */
export const helpChatRatedData: HelpChatData = {
  ...helpChatRateData,
  case: {
    ...helpChatRateData.case!,
    rating: { given: { rating: 'good', comment: 'Riley paused the payment right away. Thank you!', at: '2026-11-17T15:59:50.000Z' }, canRate: true, changeUntil: '2026-11-24T15:59:50.000Z' },
  },
};

/** A case solved yesterday: the Help conversation asks how the help was. */
export const helpChatRecentRateData: HelpChatData = { ...helpChatRecentData, recent: { ...helpChatRecentData.recent!, rating: { canRate: true } } };

export const helpSummaryAssistant: HelpSummary = { assistantAvailable: true };
export const helpSummaryWaiting: HelpSummary = {
  assistantAvailable: true,
  case: { id: 'case_help_1', status: 'open', unread: false, last: { from: 'me', body: 'Jordan never came for the desk on Saturday. I waited two hours.', at: '2026-11-17T15:56:00.000Z' } },
};
export const helpSummaryReplied: HelpSummary = {
  assistantAvailable: true,
  case: { id: 'case_help_1', status: 'awaiting_poster', unread: true, last: { from: 'support', body: "Hi Maya, I'm Riley from support. I'm sorry Jordan didn't come.", at: '2026-11-17T15:59:00.000Z' } },
};

export const chatInboxData: ChatInboxData = { ...mayaInboxWithDirectData, help: helpSummaryReplied };
export const chatInboxEmptyData: ChatInboxData = { ...inboxEmptyData, help: helpSummaryAssistant };
/** The window's conversation: the header shows who it is with, their @username and Sparks (2026-11-22). */
export const chatThreadData: ChatThreadData = {
  data: { ...deskBookingThreadPageData, thread: { ...deskBookingThreadPageData.thread, otherParty: { ...deskBookingThreadPageData.thread.otherParty, username: 'jordan', sparks: jordanSparks } } },
};

const ok = async (): Promise<ActionResult> => ({ ok: true, code: 'sent' });

export const fakeHelpChatHandlers: HelpChatHandlers = {
  onAsk: () => undefined,
  onRetry: () => undefined,
  onStartOver: () => undefined,
  onHandOff: async () => ({ ok: true, code: 'submitted' }),
  onReply: ok,
  onRequestLive: async () => ({ ok: true, code: 'updated' }),
  onTyping: () => undefined,
  onRate: async () => ({ ok: true, code: 'saved' }),
  onEmailTranscript: async () => ({ ok: true, code: 'sent' }),
};

export const fakeChatThreadHandlers: ChatThreadHandlers = {
  onSend: ok,
  onUploadPhoto: async () => ({ ok: false, code: 'unknown' }),
  onTyping: async () => undefined,
  onReact: async () => ({ ok: true, code: 'updated' }),
  onSaveReply: async () => ({ ok: true, code: 'saved' }),
  onDeleteReply: async () => ({ ok: true, code: 'saved' }),
  onReport: async () => ({ ok: true, code: 'submitted' }),
  onBlock: async () => ({ ok: true, code: 'updated' }),
  // The chat's tools (2026-11-23): everything works; "desk" finds two messages.
  onFlag: async () => ({ ok: true, code: 'updated' }),
  onAccept: async () => ({ ok: true, code: 'updated' }),
  onSearch: async (_threadId, query) => ({ ...conversationSearchData, query, hits: query.toLowerCase().includes('desk') ? conversationSearchData.hits : [] }),
  onTranslate: async () => ({ text: '¡Hola Maya! Jordan T. dijo que quizá necesitas ayuda para mover un sofá el sábado.' }),
  onSuggest: async () => ({ replies: ['Sounds good to me!', 'What day and time work best for you?', 'Let me check and get back to you today.'] }),
  requestCards: { onAccept: async () => ({ ok: true, code: 'booked' }), onDecline: async () => ({ ok: true, code: 'updated' }), onCancel: async () => ({ ok: true, code: 'updated' }) },
};

/** The window's list with a pinned, a muted and an archived conversation, and a message request (2026-11-23). */
export const chatInboxFoldersData: ChatInboxData = { ...mayaFoldersInboxData, help: helpSummaryReplied };
/** A message request in the window, and a conversation with a task request card. */
export const chatRequestThreadData: ChatThreadData = { data: requestThreadPageData };
export const chatRequestCardThreadData: ChatThreadData = { data: requestCardThreadPageData };
