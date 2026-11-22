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
} from '@/contracts';
import { deskBookingThreadPageData, inboxEmptyData, mayaInboxWithDirectData } from './messaging';

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

export const helpChatAssistantData: HelpChatData = {
  viewer: { firstName: 'Maya', mode: 'poster' },
  assistantAvailable: true,
  handoff: { bookings: [{ id: 'bkg_desk', title: 'Assemble an IKEA desk', start: '2026-11-15T15:00:00.000Z' }], replyHours },
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

export const helpChatRecentData: HelpChatData = { ...helpChatAssistantData, recent: { id: 'case_help_0', status: 'resolved', topic: 'payment' } };

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
export const chatThreadData: ChatThreadData = { data: deskBookingThreadPageData };

const ok = async (): Promise<ActionResult> => ({ ok: true, code: 'sent' });

export const fakeHelpChatHandlers: HelpChatHandlers = {
  onAsk: () => undefined,
  onRetry: () => undefined,
  onStartOver: () => undefined,
  onHandOff: async () => ({ ok: true, code: 'submitted' }),
  onReply: ok,
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
};
