import type {
  ActionDescriptor,
  AvailabilitySlotView,
  BookingAgreement,
  BookingChatActionId,
  ConversationSearchData,
  ConversationSummary,
  MessageTranslations,
  InboxPageData,
  MessageSegment,
  MessageView,
  PhotoUploadResult,
  SharedSlot,
  ThreadHandlers,
  ThreadPageData,
  ThreadSummary,
} from '@/contracts';
import { jordan, lee, maya } from './people';
import { uploadedTaskPhotos } from './posting';
import { DESK_TIMES } from './timeline';

/** Jordan's pre-booking message with a phone number, as the app delivers it (masked). */
export const maskedPhoneMessage: MessageSegment[] = [
  { kind: 'text', text: 'Happy to help! Text me at ' },
  { kind: 'masked', detail: 'phone', hint: '0134' },
  { kind: 'text', text: ' if that’s easier.' },
];

/** A message with an email address, masked. */
export const maskedEmailMessage: MessageSegment[] = [
  { kind: 'text', text: 'You can also email me at ' },
  { kind: 'masked', detail: 'email' },
  { kind: 'text', text: '.' },
];

/** After the booking is confirmed, nothing is masked. */
export const unmaskedMessage: MessageSegment[] = [{ kind: 'text', text: 'See you Saturday at 10:30!' }];

// ---- Threads (UI-014) -----------------------------------------------------------------------------
// "Now" is Sat, Nov 21, 2026, 10:05 am in Austin for the desk booking thread; Tue 9:00 am for offers.

const text = (value: string): MessageSegment[] => [{ kind: 'text', text: value }];
const composer = { canSend: true, maxLength: 2000, maxAttachments: 4, maxPhotoMegabytes: 10 } as const;

/** Maya and Jordan after booking: contact details show, and day-of updates appear in the thread. */
export const deskBookingThread: ThreadSummary = {
  id: 'thr_bkg_desk',
  kind: 'booking',
  title: 'Assemble a desk (flat-pack, 1 item)',
  otherParty: jordan,
  subject: { kind: 'booking', bookingId: 'bkg_desk' },
  lastMessage: { sender: 'system', kind: 'status', preview: [], event: { type: 'on_my_way' }, createdAt: '2026-11-21T15:58:00.000Z' },
  unreadCount: 1,
  contactMasking: false,
};

const deskBookingMessages: MessageView[] = [
  { id: 'msg_1', sender: 'system', kind: 'system', segments: [], attachments: [], event: { type: 'booked' }, createdAt: DESK_TIMES.booked },
  {
    id: 'msg_2',
    sender: 'me',
    kind: 'text',
    segments: text('Thanks for booking! The box is in the living room. Call me at 512-555-0101 when you park.'),
    attachments: [],
    createdAt: '2026-11-17T15:20:00.000Z',
  },
  {
    id: 'msg_3',
    sender: 'them',
    kind: 'text',
    segments: text('Got it. Here is the desk I am bringing tools for, to make sure it matches.'),
    attachments: [uploadedTaskPhotos[0]!],
    createdAt: '2026-11-17T15:40:00.000Z',
  },
  { id: 'msg_4', sender: 'system', kind: 'status', segments: [], attachments: [], event: { type: 'on_my_way' }, createdAt: '2026-11-21T15:58:00.000Z' },
];

/** Maya's view of the booking thread. Jordan has read her message (two ticks): he answered it. */
export const deskBookingThreadPageData: ThreadPageData = {
  thread: deskBookingThread,
  messages: deskBookingMessages,
  composer,
  readUpTo: '2026-11-17T15:40:00.000Z',
};

/** Maya and Lee before booking: Lee's number is hidden. */
export const deskOfferLeeThread: ThreadSummary = {
  id: 'thr_off_lee',
  kind: 'offer',
  title: 'Assemble a desk (flat-pack, 1 item)',
  otherParty: lee,
  subject: { kind: 'offer_for_client', taskId: 'tsk_desk', offerId: 'off_lee' },
  lastMessage: { sender: 'them', kind: 'text', preview: maskedPhoneMessage, createdAt: '2026-11-17T13:40:00.000Z' },
  unreadCount: 0,
  contactMasking: true,
};

/** Maya's view of Lee's offer thread, with the masking notice. */
export const deskOfferThreadPageData: ThreadPageData = {
  thread: deskOfferLeeThread,
  messages: [
    { id: 'msg_o1', sender: 'system', kind: 'system', segments: [], attachments: [], event: { type: 'offer_received', params: { amountCents: 5000 } }, createdAt: '2026-11-17T13:30:00.000Z' },
    { id: 'msg_o2', sender: 'them', kind: 'text', segments: maskedPhoneMessage, attachments: [], createdAt: '2026-11-17T13:40:00.000Z' },
    { id: 'msg_o3', sender: 'them', kind: 'text', segments: maskedEmailMessage, attachments: [], createdAt: '2026-11-17T13:41:00.000Z' },
  ],
  composer,
};

/** Jordan's view of his offer on Chris's move (before booking). */
export const movingOfferThreadForHelper: ThreadSummary = {
  id: 'thr_off_moving',
  kind: 'offer',
  title: 'Help loading a moving truck',
  otherParty: { id: 'usr_chris', displayName: 'Chris D.', initials: 'CD', memberSince: '2026-10-12T15:00:00.000Z', phoneVerified: true },
  subject: { kind: 'task_for_helper', taskId: 'tsk_moving' },
  lastMessage: { sender: 'me', kind: 'text', preview: text('Is there an elevator, or stairs only?'), createdAt: '2026-11-17T12:30:00.000Z' },
  unreadCount: 0,
  contactMasking: true,
};

export const mayaInboxPageData: InboxPageData = { threads: [deskBookingThread, deskOfferLeeThread] };
export const jordanInboxPageData: InboxPageData = {
  threads: [{ ...deskBookingThread, otherParty: { id: maya.id, displayName: maya.displayName, initials: maya.initials, memberSince: maya.memberSince, phoneVerified: maya.phoneVerified }, unreadCount: 0 }, movingOfferThreadForHelper],
};
export const inboxEmptyData: InboxPageData = { threads: [] };

/** A long conversation (regular visits gain lines every visit): earlier messages to load above these (sweep MN11). */
export const earlierThreadPageData: ThreadPageData = { ...deskBookingThreadPageData, earlier: { from: 'msg_0' } };

/** Lee withdrew: the thread stays readable, but nobody can send. */
export const closedThreadPageData: ThreadPageData = { ...deskOfferThreadPageData, composer: { ...composer, canSend: false, disabledReason: 'closed' } };
export const blockedThreadPageData: ThreadPageData = { ...deskOfferThreadPageData, composer: { ...composer, canSend: false, disabledReason: 'blocked' } };
/** Lee's offer expired, so the thread closed: why, and the way on (the offer, where Maya can request Lee again: audit L13). */
export const expiredOfferThreadPageData: ThreadPageData = { ...deskOfferThreadPageData, composer: { ...composer, canSend: false, disabledReason: 'closed', closedReason: 'offer_expired' } };
/** Maya canceled the desk while Lee's offer was open: the thread says the task was canceled (sweep D9). */
export const taskCanceledOfferThreadPageData: ThreadPageData = { ...deskOfferThreadPageData, composer: { ...composer, canSend: false, disabledReason: 'closed', closedReason: 'task_canceled' } };
/** Jordan's side of a task canceled while his offer was open: not "chose another offer" (sweep D9). */
export const taskCanceledThreadForHelperPageData: ThreadPageData = {
  thread: movingOfferThreadForHelper,
  messages: [{ id: 'msg_m1', sender: 'me', kind: 'text', segments: movingOfferThreadForHelper.lastMessage!.preview, attachments: [], createdAt: movingOfferThreadForHelper.lastMessage!.createdAt }],
  composer: { ...composer, canSend: false, disabledReason: 'closed', closedReason: 'task_canceled' },
};

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
let attachmentCount = 0;

/** Fake handlers: sending and uploads succeed. */
export const fakeThreadHandlers: ThreadHandlers = {
  onSend: () => wait({ ok: true, code: 'sent' }),
  onUploadPhoto: () => {
    attachmentCount += 1;
    const result: PhotoUploadResult = { ok: true, photo: { id: `ph_msg_${attachmentCount}`, src: '/samples/work-desk.svg', alt: `Attached photo ${attachmentCount}`, width: 800, height: 600 } };
    return wait(result);
  },
  onReact: () => wait({ ok: true, code: 'updated' }),
  onSaveReply: () => wait({ ok: true, code: 'saved' }),
  onDeleteReply: () => wait({ ok: true, code: 'updated' }),
};

// ---- Direct conversations (2026-11-21) ------------------------------------------------------------------------

/** Maya wrote to Jordan from his profile; he hasn't answered yet. */
export const directThreadWithJordan: ThreadSummary = {
  id: 'thr_direct_maya_jordan',
  kind: 'direct',
  title: 'Jordan T.',
  otherParty: { id: 'usr_jordan', displayName: 'Jordan T.', initials: 'JT', memberSince: '2026-11-03T15:00:00.000Z', phoneVerified: true },
  subject: { kind: 'person', helperHandle: 'jordan-t', canRequest: true },
  lastMessage: { sender: 'me', kind: 'text', preview: text('Hi Jordan! Do you assemble standing desks too?'), createdAt: '2026-11-21T15:50:00.000Z' },
  unreadCount: 0,
  contactMasking: true,
};

/** Maya's first message: 2 more until Jordan answers. */
export const directThreadPageData: ThreadPageData = {
  thread: directThreadWithJordan,
  messages: [{ id: 'msg_d1', sender: 'me', kind: 'text', segments: text('Hi Jordan! Do you assemble standing desks too?'), attachments: [], createdAt: '2026-11-21T15:50:00.000Z' }],
  composer: { ...composer, firstMessagesLeft: 2 },
};

/** Maya sent her 3 first messages: she can write again when Jordan replies. */
export const directThreadAwaitingReplyData: ThreadPageData = {
  ...directThreadPageData,
  messages: [
    ...directThreadPageData.messages,
    { id: 'msg_d2', sender: 'me', kind: 'text', segments: text('It’s a two-motor frame, about 60 inches wide.'), attachments: [], createdAt: '2026-11-21T15:51:00.000Z' },
    { id: 'msg_d3', sender: 'me', kind: 'text', segments: text('Saturday morning would be perfect.'), attachments: [], createdAt: '2026-11-21T15:52:00.000Z' },
  ],
  composer: { ...composer, canSend: false, disabledReason: 'awaiting_reply', firstMessagesLeft: 0 },
};

/** Maya's inbox with the direct conversation on top. */
export const mayaInboxWithDirectData: InboxPageData = { threads: [directThreadWithJordan, deskBookingThread, deskOfferLeeThread] };

// ---- The chat, 2026-11-23: people by @username, a sample profile, the viewer's own list, message requests, a
// conversation's search, Translate and Suggest replies, and cards for task requests and booking changes ----------------

const wrote = (id: string, sender: MessageView['sender'], segments: MessageSegment[], createdAt: string): MessageView => ({ id, sender, kind: 'text', segments, attachments: [], createdAt });
const sam = { id: 'usr_sam_rivera', displayName: 'Sam R.', initials: 'SR', memberSince: '2026-11-19T15:00:00.000Z', phoneVerified: true };

/** Jordan named by @username in Sam's message: a person (a link to his profile), not a hidden handle. */
export const mentionMessage: MessageSegment[] = [
  { kind: 'text', text: 'Hi Maya! ' },
  { kind: 'mention', userId: 'usr_jordan', name: 'Jordan T.', helperHandle: 'jordan-t' },
  { kind: 'text', text: ' said you might need help moving a couch on Saturday. Venmo me at ' },
  { kind: 'masked', detail: 'handle' },
  { kind: 'text', text: ' if you like.' },
];

/** Sam wrote to Maya first, and they haven't talked about a task: a message request. */
export const requestThreadFromSam: ThreadSummary = {
  id: 'thr_direct_sam_maya',
  kind: 'direct',
  title: 'Sam R.',
  otherParty: sam,
  subject: { kind: 'person', canRequest: false },
  lastMessage: { sender: 'them', kind: 'text', preview: mentionMessage, createdAt: '2026-11-21T15:40:00.000Z' },
  unreadCount: 1,
  contactMasking: true,
  request: true,
};

/** The request open: Accept, Ignore or Block above the composer; Translate and Suggest replies offered. */
export const requestThreadPageData: ThreadPageData = {
  thread: requestThreadFromSam,
  messages: [wrote('msg_r1', 'them', mentionMessage, '2026-11-21T15:40:00.000Z')],
  composer,
  assist: { translate: true, suggest: true },
};

/** Writing to a sample profile on the live site: the app's note under the first message, and the badge in the header. */
export const sampleThreadPageData: ThreadPageData = {
  thread: { ...directThreadWithJordan, id: 'thr_direct_maya_minh', title: 'Minh T.', otherParty: { id: 'usr_minh', displayName: 'Minh T.', initials: 'MT', memberSince: '2026-09-30T15:00:00.000Z', phoneVerified: true, username: 'minh' }, subject: { kind: 'person', helperHandle: 'jordan-t', canRequest: true }, sample: true, lastMessage: { sender: 'system', kind: 'system', preview: [], event: { type: 'sample_profile_notice' }, createdAt: '2026-11-21T15:50:01.000Z' } },
  messages: [
    wrote('msg_s1', 'me', text('Hi Minh! Are you free to help hang shelves this week?'), '2026-11-21T15:50:00.000Z'),
    { id: 'msg_s2', sender: 'system', kind: 'system', segments: [], attachments: [], event: { type: 'sample_profile_notice' }, createdAt: '2026-11-21T15:50:01.000Z' },
  ],
  composer: { ...composer, firstMessagesLeft: 2 },
};

/** Maya's list: the desk booking pinned, Jordan muted, Lee's offer archived, and Sam's request waiting. */
export const mayaFoldersInboxData: InboxPageData = {
  threads: [
    { ...deskBookingThread, pinned: true },
    { ...directThreadWithJordan, muted: true, unreadCount: 2, lastMessage: { sender: 'them', kind: 'text', preview: text('Yes, I can bring my drill.'), createdAt: '2026-11-21T15:58:00.000Z' } },
    { ...deskOfferLeeThread, archived: true },
    requestThreadFromSam,
  ],
};

/** "desk" in Maya's conversation with Jordan: two messages, newest first. */
export const conversationSearchData: ConversationSearchData = {
  query: 'desk',
  hits: [
    { id: 'msg_d2', sender: 'me', segments: text('It’s a two-motor standing desk frame, about 60 inches wide.'), createdAt: '2026-11-21T15:51:00.000Z' },
    { id: 'msg_d1', sender: 'me', segments: text('Hi Jordan! Do you assemble standing desks too?'), createdAt: '2026-11-21T15:50:00.000Z' },
  ],
  more: false,
};

/** Maya asked Jordan for a task from their conversation: the request's card, waiting on him (Maya's view). */
export const requestCardThreadPageData: ThreadPageData = {
  ...directThreadPageData,
  thread: { ...directThreadWithJordan, lastMessage: { sender: 'system', kind: 'status', preview: [], event: { type: 'invite_sent', params: { inviteId: 'inv_desk_direct' } }, createdAt: '2026-11-21T15:55:00.000Z' } },
  messages: [
    ...directThreadPageData.messages,
    wrote('msg_d4', 'them', text('Yes! Send me a request and I’ll take a look.'), '2026-11-21T15:53:00.000Z'),
    { id: 'msg_d5', sender: 'system', kind: 'status', segments: [], attachments: [], event: { type: 'invite_sent', params: { inviteId: 'inv_desk_direct' } }, createdAt: '2026-11-21T15:55:00.000Z' },
  ],
  composer,
  cards: {
    requests: {
      inv_desk_direct: {
        inviteId: 'inv_desk_direct',
        title: 'Assemble a standing desk',
        start: '2026-11-28T15:00:00.000Z',
        pricing: { type: 'fixed', priceCents: 8000 },
        status: 'sent',
        viewerRole: 'poster',
        actions: ['cancel'],
        href: '/app/tasks/tsk_desk_direct',
        expiresAt: '2026-11-23T15:55:00.000Z',
      },
    },
  },
};

/** The same request as Jordan sees it: Accept and Decline right in the conversation. */
export const requestCardForHelperPageData: ThreadPageData = {
  ...requestCardThreadPageData,
  thread: { ...requestCardThreadPageData.thread, title: 'Maya R.', otherParty: maya, subject: { kind: 'person', canRequest: false } },
  messages: requestCardThreadPageData.messages.map((message) => (message.sender === 'me' ? { ...message, sender: 'them' as const } : message.sender === 'them' ? { ...message, sender: 'me' as const } : message)),
  cards: { requests: { inv_desk_direct: { ...requestCardThreadPageData.cards!.requests!.inv_desk_direct!, viewerRole: 'helper', actions: ['accept', 'decline'], href: '/app/offers?invite=inv_desk_direct' } } },
};

/** Jordan proposed a later start in the desk booking's conversation: the change's card, and "Propose a change". */
export const changeCardThreadPageData: ThreadPageData = {
  ...deskBookingThreadPageData,
  messages: [
    ...deskBookingThreadPageData.messages,
    { id: 'msg_c1', sender: 'system', kind: 'status', segments: [], attachments: [], event: { type: 'change_proposed', params: { changeId: 'chg_desk_later' } }, createdAt: '2026-11-21T16:00:00.000Z' },
  ],
  cards: { changes: { chg_desk_later: { bookingId: 'bkg_desk', changeId: 'chg_desk_later', status: 'proposed', fromViewer: false, types: ['schedule', 'price'], startAt: '2026-11-21T19:00:00.000Z', differenceCents: 1500, expiresAt: '2026-11-21T19:00:00.000Z' } } },
  canProposeChange: true,
};

/** Fake handlers for the chat's new tools: everything works, "desk" finds two messages, Translate marks the text. */
export const fakeConversationHandlers: Pick<ThreadHandlers, 'onFlag' | 'onAccept' | 'onSearch' | 'onTranslate' | 'onSuggest' | 'onTranslateMany' | 'onCatchUp' | 'requestCards' | 'onAskForOffer' | 'onBookingAction' | 'onShareTimes'> = {
  onAskForOffer: () => wait({ ok: true, code: 'sent' }),
  // A booking's day-of chips and Share times (2026-11-24): everything works.
  onBookingAction: (input) => wait({ ok: true, code: input.action === 'on_my_way' ? 'on_the_way' : input.action === 'arrived' ? 'arrived' : 'updated' }),
  onShareTimes: () => wait({ ok: true, code: 'sent' }),
  onFlag: () => wait({ ok: true, code: 'updated' }),
  onAccept: () => wait({ ok: true, code: 'updated' }),
  onSearch: (query) => wait({ ...conversationSearchData, query, hits: query.toLowerCase().includes('desk') ? conversationSearchData.hits : [] }),
  onTranslate: () => wait({ text: '¡Hola Maya! Jordan T. dijo que quizá necesitas ayuda para mover un sofá el sábado.' }),
  onSuggest: () => wait({ replies: ['Sounds good to me!', 'What day and time work best for you?', 'Let me check and get back to you today.'] }),
  // "Translate this conversation" and "Catch me up" (2026-11-24): Lucía's messages in English, and her summary.
  onTranslateMany: (input) => wait(translationsFor(input.messageIds)),
  onCatchUp: () => wait(luciaCatchUpSummary),
  requestCards: {
    onAccept: () => wait({ ok: true, code: 'booked' }),
    onDecline: () => wait({ ok: true, code: 'updated' }),
    onCancel: () => wait({ ok: true, code: 'updated' }),
  },
};

// ---- The conversation's "+" and "Asked for an offer" (2026-11-23) -------------------------------------------------------

/** Maya talking to Jordan, a bookable helper: Request a task, and Ask for an offer on one of her two open tasks. */
export const plusMenuThreadPageData: ThreadPageData = {
  ...directThreadPageData,
  messages: [
    ...directThreadPageData.messages,
    wrote('msg_d6', 'them', text('Happy to help with anything this weekend.'), '2026-11-21T15:54:00.000Z'),
    { id: 'msg_d7', sender: 'system', kind: 'status', segments: [], attachments: [], event: { type: 'offer_requested', params: { taskId: 'tsk_shelves' } }, createdAt: '2026-11-21T15:56:00.000Z' },
  ],
  composer,
  requestOptions: { requestHandle: 'jordan-t', myOpenTasks: [{ id: 'tsk_shelves', title: 'Hang three shelves in the hallway' }, { id: 'tsk_leaves', title: 'Clear leaves from the backyard' }], theirOpenTasks: [] },
  cards: { offerAsks: { msg_d7: { taskId: 'tsk_shelves', title: 'Hang three shelves in the hallway', open: true, viewerRole: 'poster', offered: false, href: '/app/tasks/tsk_shelves' } } },
};

/** The same ask as Jordan sees it: Make an offer; and Maya's own open tasks to offer on from the "+". */
export const plusMenuForHelperPageData: ThreadPageData = {
  ...plusMenuThreadPageData,
  thread: { ...plusMenuThreadPageData.thread, title: 'Maya R.', otherParty: maya, subject: { kind: 'person', canRequest: false } },
  messages: plusMenuThreadPageData.messages.map((message) => (message.sender === 'me' ? { ...message, sender: 'them' as const } : message.sender === 'them' ? { ...message, sender: 'me' as const } : message)),
  requestOptions: { myOpenTasks: [], theirOpenTasks: [{ id: 'tsk_shelves', title: 'Hang three shelves in the hallway' }, { id: 'tsk_leaves', title: 'Clear leaves from the backyard' }] },
  cards: { offerAsks: { msg_d7: { taskId: 'tsk_shelves', title: 'Hang three shelves in the hallway', open: true, viewerRole: 'helper', offered: false, href: '/app/find-work/tsk_shelves/offer' } } },
};

// ---- A whole conversation translated, and "Catch me up" (2026-11-24, owner: "implement others all one by one") ------------

const lucia = { id: 'usr_lucia_m', displayName: 'Lucía M.', initials: 'LM', memberSince: '2026-10-02T15:00:00.000Z', phoneVerified: true };

/** Maya and Lucía talk directly; Lucía writes in Spanish. Maya hadn't read Lucía's last nine messages (one of them hides a number). */
export const luciaThread: ThreadSummary = {
  id: 'thr_direct_maya_lucia',
  kind: 'direct',
  title: 'Lucía M.',
  otherParty: lucia,
  subject: { kind: 'person', canRequest: false },
  lastMessage: { sender: 'them', kind: 'text', preview: text('👍'), createdAt: '2026-11-21T15:20:00.000Z' },
  unreadCount: 9,
  contactMasking: true,
};

const luciaMessages: MessageView[] = [
  wrote('msg_lu1', 'me', text('Hi Lucía! Could you help me move a couch on Saturday?'), '2026-11-20T15:00:00.000Z'),
  wrote('msg_lu2', 'them', text('¡Hola Maya! Sí, claro. ¿A qué hora te viene bien?'), '2026-11-20T15:10:00.000Z'),
  wrote('msg_lu3', 'me', text('Around 10 in the morning works for me.'), '2026-11-20T15:12:00.000Z'),
  wrote('msg_lu4', 'them', text('Perfecto, llego a las 10.'), '2026-11-21T15:00:00.000Z'),
  wrote('msg_lu5', 'them', text('¿El sofá pasa por la puerta o hay que quitarle las patas?'), '2026-11-21T15:02:00.000Z'),
  wrote('msg_lu6', 'them', text('Llevo una carretilla y correas, no te preocupes.'), '2026-11-21T15:04:00.000Z'),
  wrote('msg_lu7', 'them', text('¿Hay estacionamiento cerca de tu casa?'), '2026-11-21T15:06:00.000Z'),
  wrote('msg_lu8', 'them', text('Si quieres, también puedo llevar las cajas al garaje.'), '2026-11-21T15:08:00.000Z'),
  wrote('msg_lu9', 'them', [{ kind: 'text', text: 'Mi número es ' }, { kind: 'masked', detail: 'phone', hint: '0178' }, { kind: 'text', text: ' por si acaso.' }], '2026-11-21T15:10:00.000Z'),
  wrote('msg_lu10', 'them', text('Avísame si cambia algo.'), '2026-11-21T15:12:00.000Z'),
  wrote('msg_lu11', 'them', text('¡Nos vemos el sábado!'), '2026-11-21T15:14:00.000Z'),
  wrote('msg_lu12', 'them', text('👍'), '2026-11-21T15:20:00.000Z'),
];

/** Maya opens it: "New messages" above Lucía's first unread one, and "Catch me up" offered at once (nine unread). */
export const luciaThreadPageData: ThreadPageData = {
  thread: { ...luciaThread, unreadCount: 0 },
  messages: luciaMessages,
  composer: { ...composer },
  firstUnreadId: 'msg_lu4',
  assist: { translate: true, suggest: true, summarize: true, language: 'en' },
  catchUp: { unread: 9 },
};

/** The same conversation once read: nothing unread, so "Catch me up" (from the ⋯ menu) covers the latest messages. */
export const luciaReadThreadPageData: ThreadPageData = { ...luciaThreadPageData, firstUnreadId: undefined, catchUp: undefined };

/** Lucía's messages in English, as "Translate this conversation" shows them; the thumbs-up has no words to translate. */
export const luciaTranslations: MessageTranslations = {
  texts: {
    msg_lu2: 'Hi Maya! Yes, of course. What time works for you?',
    msg_lu4: 'Perfect, I’ll be there at 10.',
    msg_lu5: 'Does the couch fit through the door, or do the legs need to come off?',
    msg_lu6: 'I’m bringing a dolly and straps, don’t worry.',
    msg_lu7: 'Is there parking near your place?',
    msg_lu8: 'If you want, I can also carry the boxes to the garage.',
    msg_lu9: 'My number is [hidden] just in case.',
    msg_lu10: 'Let me know if anything changes.',
    msg_lu11: 'See you Saturday!',
  },
  same: ['msg_lu12'],
};

/** Only the asked-for messages of `luciaTranslations` (the fake handlers' answer). */
export function translationsFor(ids: readonly string[]): MessageTranslations {
  return {
    texts: Object.fromEntries(Object.entries(luciaTranslations.texts).filter(([id]) => ids.includes(id))),
    same: luciaTranslations.same.filter((id) => ids.includes(id)),
  };
}

/** "Catch me up" on Lucía's nine unread messages. */
export const luciaCatchUpSummary: ConversationSummary = {
  points: [
    'Lucía will arrive at 10 on Saturday with a dolly and straps.',
    'She asked whether the couch fits through the door or the legs need to come off, and whether there’s parking near your place.',
    'She offered to carry the boxes to the garage too.',
  ],
  count: 9,
  from: '2026-11-21T15:00:00.000Z',
  to: '2026-11-21T15:20:00.000Z',
};

// ---- A booking's conversation: day-of chips and "What we agreed" (2026-11-24) -------------------------------------------

/** What Maya and Jordan agreed for the desk, as Maya sees it: her $63.00 total, never Jordan's earnings; no address. */
export const deskAgreementForClient: BookingAgreement = {
  bookingId: 'bkg_desk',
  title: 'Assemble a desk (flat-pack, 1 item)',
  categorySlug: 'furniture-assembly',
  start: DESK_TIMES.agreedStart,
  window: { windowStart: DESK_TIMES.windowStart, windowEnd: DESK_TIMES.windowEnd, flexible: false },
  remote: false,
  timeZone: 'America/Chicago',
  pricing: { type: 'fixed', priceCents: 6000 },
  money: { kind: 'client_total', amountCents: 6300 },
  scope: 'Flat-pack desk, about 40 parts, still in the box in my living room. 2nd floor with an elevator.',
  checklist: ['all_parts_used', 'level_and_stable', 'anchored_if_asked', 'packaging_cleared'],
};

/** The same, as Jordan sees it: his $60.00 earnings, never Maya's total. */
export const deskAgreementForHelper: BookingAgreement = { ...deskAgreementForClient, money: { kind: 'helper_earnings', amountCents: 6000 } };

const chip = (id: BookingChatActionId, kind: ActionDescriptor['kind'] = 'secondary'): ActionDescriptor<BookingChatActionId> => ({ id, kind, enabled: true });
const flipped = (list: MessageView[]): MessageView[] => list.map((message) => (message.sender === 'me' ? { ...message, sender: 'them' as const } : message.sender === 'them' ? { ...message, sender: 'me' as const } : message));
const line = (id: string, type: 'on_my_way' | 'running_late' | 'arrived' | 'cant_access' | 'client_present', createdAt: string, minutes?: number): MessageView => ({ id, sender: 'system', kind: 'status', segments: [], attachments: [], event: { type, ...(minutes ? { params: { minutes } } : {}) }, createdAt });
const deskBeforeTheDay = deskBookingMessages.filter((message) => message.event?.type !== 'on_my_way');

/** Maya's view of the desk booking's conversation: what they agreed on top, with Propose a change; no chips for her now. */
export const agreementThreadPageData: ThreadPageData = { ...deskBookingThreadPageData, agreement: deskAgreementForClient, canProposeChange: true };

/** Remote work paid by the hour, any time that day, with agreed expenses and no checklist (computer help has none here). */
export const agreementRemoteHourlyThreadPageData: ThreadPageData = {
  ...agreementThreadPageData,
  agreement: { ...deskAgreementForClient, remote: true, window: { ...deskAgreementForClient.window, flexible: true }, pricing: { type: 'hourly', rateCents: 3000, estimatedHours: 2, hoursCap: 3 }, money: { kind: 'client_total', amountCents: 9450 }, expenseAllowance: { amountCents: 2000, description: 'Wall anchors from the hardware store' }, checklist: [] },
};

const jordanDeskThread: ThreadSummary = { ...deskBookingThread, otherParty: maya, unreadCount: 0 };

/** Jordan an hour before the start: On my way and Running late, one tap each. */
export const dayOfBeforeThreadPageData: ThreadPageData = {
  thread: jordanDeskThread,
  messages: flipped(deskBeforeTheDay),
  composer,
  agreement: deskAgreementForHelper,
  canProposeChange: true,
  bookingActions: [chip('on_my_way', 'primary'), chip('running_late')],
};

/** Jordan on the way (its line shows): I've arrived, and Running late still. */
export const dayOfOnTheWayThreadPageData: ThreadPageData = {
  ...dayOfBeforeThreadPageData,
  messages: [...flipped(deskBeforeTheDay), line('msg_dy1', 'on_my_way', '2026-11-21T15:58:00.000Z'), line('msg_dy2', 'running_late', '2026-11-21T16:05:00.000Z', 10)],
  bookingActions: [chip('arrived', 'primary'), chip('running_late')],
};

/** Jordan at work: Finish the job opens the completion form over the page. */
export const dayOfWorkingThreadPageData: ThreadPageData = {
  ...dayOfOnTheWayThreadPageData,
  messages: [...dayOfOnTheWayThreadPageData.messages, line('msg_dy3', 'arrived', DESK_TIMES.arrived)],
  canProposeChange: true,
  bookingActions: [chip('submit_completion', 'primary')],
};

/** Maya when Jordan couldn't get in: I'm here, while her 30 minutes run. */
export const dayOfImHereThreadPageData: ThreadPageData = {
  ...agreementThreadPageData,
  messages: [...deskBookingMessages, line('msg_dy4', 'arrived', DESK_TIMES.arrived), line('msg_dy5', 'cant_access', '2026-11-21T16:50:00.000Z')],
  bookingActions: [chip('im_here', 'primary')],
};

// ---- Shared open times (2026-11-24) -------------------------------------------------------------------------------------

/** Jordan's open slots (Austin time), soonest first: what the "+" offers him to share. */
export const jordanOpenSlots: AvailabilitySlotView[] = [
  { id: 'avl_jordan_sat', categorySlug: 'furniture-assembly', start: '2026-11-28T15:00:00.000Z', end: '2026-11-28T19:00:00.000Z', pricing: { type: 'hourly', rateCents: 3000, estimatedHours: 2, hoursCap: 3 } },
  { id: 'avl_jordan_sun', categorySlug: 'furniture-assembly', start: '2026-11-29T20:00:00.000Z', end: '2026-11-29T23:00:00.000Z', pricing: { type: 'fixed', priceCents: 6000 } },
  { id: 'avl_jordan_tue', categorySlug: 'yard-cleanup', start: '2026-12-01T15:00:00.000Z', end: '2026-12-01T18:00:00.000Z', pricing: { type: 'hourly', rateCents: 3000, estimatedHours: 3, hoursCap: 4 } },
  { id: 'avl_jordan_wed', categorySlug: 'furniture-assembly', start: '2026-12-02T23:00:00.000Z', end: '2026-12-03T01:00:00.000Z', pricing: { type: 'fixed', priceCents: 6000 } },
];

const sharedSlots: SharedSlot[] = [
  { ...jordanOpenSlots[0]!, state: 'open' },
  { ...jordanOpenSlots[1]!, state: 'open' },
  { ...jordanOpenSlots[2]!, state: 'taken' },
];
const sharedLines: MessageView[] = [
  wrote('msg_t1', 'them', text('Here are a few times that work for me this week.'), '2026-11-21T15:55:00.000Z'),
  { id: 'msg_t2', sender: 'system', kind: 'status', segments: [], attachments: [], event: { type: 'times_shared', params: { slotIds: sharedSlots.map((slot) => slot.id) } }, createdAt: '2026-11-21T15:56:00.000Z' },
];

/** Maya talking to Jordan: he shared three times; two are open (tap one: the request dialog with it chosen), one is taken. */
export const sharedTimesThreadPageData: ThreadPageData = {
  ...directThreadPageData,
  messages: [...directThreadPageData.messages, ...sharedLines],
  composer,
  cards: { sharedTimes: { msg_t2: { viewerRole: 'client', helperHandle: 'jordan-t', timeZone: 'America/Chicago', slots: sharedSlots } } },
};

/** The same card as Jordan sees it (one past now, one he took down), and Share times in his "+". */
export const sharedTimesForHelperPageData: ThreadPageData = {
  ...sharedTimesThreadPageData,
  thread: { ...sharedTimesThreadPageData.thread, title: 'Maya R.', otherParty: maya, subject: { kind: 'person', canRequest: false } },
  messages: flipped(sharedTimesThreadPageData.messages),
  requestOptions: { myOpenTasks: [], theirOpenTasks: [], shareableSlots: jordanOpenSlots },
  cards: { sharedTimes: { msg_t2: { viewerRole: 'helper', helperHandle: 'jordan-t', timeZone: 'America/Chicago', slots: [sharedSlots[0]!, { ...sharedSlots[1]!, state: 'past' }, { ...sharedSlots[2]!, state: 'withdrawn' }] } } },
};

/** Jordan in the offer conversation about his open offer: Share times is in his "+" there too. */
export const shareTimesInOfferThreadPageData: ThreadPageData = {
  thread: movingOfferThreadForHelper,
  messages: [{ id: 'msg_o1', sender: 'me', kind: 'text', segments: text('I can bring a dolly. Which day suits you?'), attachments: [], createdAt: '2026-11-21T15:40:00.000Z' }],
  composer,
  requestOptions: { myOpenTasks: [], theirOpenTasks: [], shareableSlots: jordanOpenSlots.slice(0, 2) },
};
