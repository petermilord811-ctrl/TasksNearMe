import type {
  InboxPageData,
  MessageSegment,
  MessageView,
  PhotoUploadResult,
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

/** Maya's view of the booking thread. */
export const deskBookingThreadPageData: ThreadPageData = {
  thread: deskBookingThread,
  messages: deskBookingMessages,
  composer,
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
