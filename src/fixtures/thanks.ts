import { QUIET_HOURS_DEFAULT, type AccountPageData, type AdminCaseThanks, type BookingView, type HelperProfilePageData, type MessageView, type PublicThankYouNote, type ThankYouNoteView, type ThanksPanel, type ThreadPageData } from '@/contracts';
import { jordanAccountData, mayaAccountData } from './account';
import { deskBookingHelperCompleted, deskBookingPosterCompleted } from './bookings';
import { deskBookingThreadPageData } from './messaging';
import { maya } from './people';
import { jordanProfilePageData } from './profiles';

/**
 * Thank-you notes and quiet hours (2026-11-24): Maya's note to Jordan for the desk, in every state its two people see,
 * Jordan's profile with notes he chose to show, and quiet hours on the account page and above a sender's message box.
 */

const words = 'Thank you, Jordan! The desk is rock solid and you left the room spotless. My daughter has been doing homework at it all week.';

/** Maya, an hour after sending: she can still edit it; Jordan shows it on his profile. */
export const thanksNoteClientEditable: ThankYouNoteView = {
  id: 'tyn_desk',
  bookingId: 'bkg_desk',
  viewerRole: 'client',
  segments: [{ kind: 'text', text: words }],
  draft: words,
  createdAt: '2026-11-24T16:00:00.000Z',
  editableUntil: '2026-11-25T16:00:00.000Z',
  nameHidden: false,
  shownOnProfile: true,
};

/** Maya, days later: no more edits; her name isn't shown, and Jordan hasn't put it on his profile. */
export const thanksNoteClientLocked: ThankYouNoteView = { id: 'tyn_desk', bookingId: 'bkg_desk', viewerRole: 'client', segments: [{ kind: 'text', text: words }], createdAt: '2026-11-21T16:00:00.000Z', nameHidden: true, shownOnProfile: false };

/** Maya's note after our team hid it: she can still delete it. */
export const thanksNoteClientHidden: ThankYouNoteView = { ...thanksNoteClientLocked, nameHidden: false, hidden: true };

/** Jordan reads it masked (her number is hidden), not on his profile yet. */
export const thanksNoteHelper: ThankYouNoteView = {
  id: 'tyn_desk',
  bookingId: 'bkg_desk',
  viewerRole: 'helper',
  segments: [{ kind: 'text', text: `${words} Text me when you do bookshelves: ` }, { kind: 'masked', detail: 'phone', hint: '0101' }],
  createdAt: '2026-11-24T16:00:00.000Z',
  nameHidden: false,
  shownOnProfile: false,
  reportable: true,
};
export const thanksNoteHelperShown: ThankYouNoteView = { ...thanksNoteHelper, shownOnProfile: true };
/** Hidden by our team: Jordan no longer sees its words, and can't show it. */
export const thanksNoteHelperHidden: ThankYouNoteView = { id: 'tyn_desk', bookingId: 'bkg_desk', viewerRole: 'helper', segments: [], createdAt: '2026-11-24T16:00:00.000Z', nameHidden: false, shownOnProfile: false, hidden: true };

export const thanksPanelOffer: ThanksPanel = { bookingId: 'bkg_desk', viewerRole: 'client', canWrite: true };
export const thanksPanelSent: ThanksPanel = { bookingId: 'bkg_desk', viewerRole: 'client', note: thanksNoteClientEditable, canWrite: false };
export const thanksPanelHelper: ThanksPanel = { bookingId: 'bkg_desk', viewerRole: 'helper', note: thanksNoteHelper, canWrite: false };

/** The booking page, completed: Maya's offer, her sent note, and Jordan's view of it. */
export const deskCompletedThanksOffer: BookingView = { ...deskBookingPosterCompleted, thanks: thanksPanelOffer };
export const deskCompletedThanksSent: BookingView = { ...deskBookingPosterCompleted, thanks: thanksPanelSent };
export const deskHelperCompletedThanks: BookingView = { ...deskBookingHelperCompleted, thanks: thanksPanelHelper };

/** The conversation's line for the note: its card shows in its place. */
export const thanksSentLine: MessageView = { id: 'msg_thanks', sender: 'system', kind: 'status', segments: [], attachments: [], event: { type: 'thanks_sent', params: { noteId: 'tyn_desk' } }, createdAt: '2026-11-24T16:00:00.000Z' };

/** Maya's view of the completed booking's conversation: "Thank Jordan with a note" above the message box. */
export const thanksOfferThreadPageData: ThreadPageData = { ...deskBookingThreadPageData, thanks: thanksPanelOffer };
/** Maya's view after sending it: the note's card in the log. */
export const thanksSentThreadPageData: ThreadPageData = { ...deskBookingThreadPageData, messages: [...deskBookingThreadPageData.messages, thanksSentLine], cards: { thanks: { tyn_desk: thanksNoteClientEditable } } };
/** Jordan's view: the card with "Show on my profile". */
export const thanksHelperThreadPageData: ThreadPageData = {
  ...deskBookingThreadPageData,
  thread: { ...deskBookingThreadPageData.thread, otherParty: maya },
  messages: [...deskBookingThreadPageData.messages.map((message) => (message.sender === 'me' ? { ...message, sender: 'them' as const } : message.sender === 'them' ? { ...message, sender: 'me' as const } : message)), thanksSentLine],
  cards: { thanks: { tyn_desk: thanksNoteHelper } },
};

/** Jordan's quiet hours end at 8:00 am Central (2:00 pm UTC): Maya writing late at night sees when he'll get it. */
export const QUIET_UNTIL = '2026-11-25T14:00:00.000Z';
export const quietHoursThreadPageData: ThreadPageData = { ...deskBookingThreadPageData, quietHours: { until: QUIET_UNTIL } };

/** Account settings: quiet hours off (the suggested times), and on from 9:30 pm to 7:00 am. */
export const mayaQuietHoursOffAccountData: AccountPageData = { ...mayaAccountData, quietHours: QUIET_HOURS_DEFAULT };
export const jordanQuietHoursOnAccountData: AccountPageData = { ...jordanAccountData, quietHours: { enabled: true, startsAt: '21:30', endsAt: '07:00' } };

/** Notes Jordan shows on his profile, newest first (6): by first name and area, "A client in…", and a remote task's. */
export const jordanPublicThanks: PublicThankYouNote[] = [
  { id: 'tyn_pub_1', text: words, firstName: 'Maya', area: 'Hyde Park', createdAt: '2026-11-24T16:00:00.000Z' },
  { id: 'tyn_pub_2', text: 'Showed up early, explained everything, and the shelves are perfectly level. Thank you!', area: 'Mueller', createdAt: '2026-11-19T21:00:00.000Z' },
  { id: 'tyn_pub_3', text: 'Patient with my questions and quick with the drill.', firstName: 'Chris', area: 'East Austin', createdAt: '2026-11-12T18:30:00.000Z' },
  { id: 'tyn_pub_4', text: 'Our crib went together in under an hour, and he took all the cardboard with him. We slept better knowing it was done right.', firstName: 'Ruth', area: 'Travis Heights', createdAt: '2026-11-06T15:00:00.000Z' },
  { id: 'tyn_pub_5', text: 'Walked me through setting up the printer over video. Lifesaver.', firstName: 'Ben', createdAt: '2026-10-30T19:00:00.000Z' },
  { id: 'tyn_pub_6', text: 'Thanks for fitting us in on a Sunday!', area: 'Zilker', createdAt: '2026-10-25T17:00:00.000Z' },
];
export const jordanProfileWithThanks: HelperProfilePageData = { ...jordanProfilePageData, thanks: jordanPublicThanks };

/** A reported note on its case (staff tools). */
export const adminCaseThanksShown: AdminCaseThanks = {
  note: { id: 'tyn_desk', body: `${words} Text me at 512-555-0101 when you do bookshelves.`, author: { displayName: 'Maya R.' }, helper: { displayName: 'Jordan T.' }, createdAt: '2026-11-24T16:00:00.000Z', nameHidden: false },
  status: 'shown',
  canModerate: true,
};
export const adminCaseThanksHidden: AdminCaseThanks = { ...adminCaseThanksShown, status: 'hidden', hiddenReason: 'Shares a phone number to take work off the platform.' };
