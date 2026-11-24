import { routes, type AppShellHandlers, type PreviewEntry, type ThankYouHandlers, type ThankYouNoteView, type ThreadHandlers, type ThreadPageData } from '@/contracts';
import {
  adminCaseThanksHidden, adminCaseThanksShown, fakeConversationHandlers, fakeHandler, fakeThreadHandlers, jordanProfileWithThanks, jordanQuietHoursOnAccountData, jordanShell, mayaQuietHoursOffAccountData, mayaShell,
  QUIET_UNTIL, quietHoursThreadPageData, thanksHelperThreadPageData, thanksNoteClientEditable, thanksNoteClientHidden, thanksNoteClientLocked, thanksNoteHelper, thanksNoteHelperHidden, thanksNoteHelperShown, thanksOfferThreadPageData, thanksSentThreadPageData,
} from '@/fixtures';
import { QuietHoursNote } from '@/ui/components/messaging/quiet-hours-note';
import { PublicThankYouNotes } from '@/ui/components/thanks/public-thank-you-notes';
import { ThankYouNoteCard, ThanksOffer } from '@/ui/components/thanks/thank-you-note';
import { AccountQuietHours } from '@/ui/screens/account/account-quiet-hours';
import { AdminReportedThanks } from '@/ui/screens/admin/admin-reported-thanks';
import { ThreadContent } from '@/ui/screens/messages/thread-screen';
import { AppShell } from '@/ui/shells/app-shell';

/**
 * Thank-you notes and quiet hours (2026-11-24): the note's card for its client and its helper in every state, the offer,
 * the profile's section, a conversation with each, the account setting off and on, the sender's note, and the staff card.
 */

const thanksGroup = 'Thank-you notes';
const quietGroup = 'Quiet hours';
const now = '2026-11-24T17:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const thanksHandlers: ThankYouHandlers = {
  onSave: fakeHandler({ ok: true, code: 'saved' }),
  onDelete: fakeHandler({ ok: true, code: 'updated' }),
  onShowOnProfile: fakeHandler({ ok: true, code: 'updated' }),
  onHideName: fakeHandler({ ok: true, code: 'updated' }),
};
const failingThanks: ThankYouHandlers = { ...thanksHandlers, onShowOnProfile: fakeHandler({ ok: false, code: 'not_allowed' }), onHideName: fakeHandler({ ok: false, code: 'unknown' }) };

const card = (id: string, title: string, note: ThankYouNoteView, name: string, handlers: ThankYouHandlers | null = thanksHandlers): PreviewEntry => ({
  id: `thanks/${id}`, group: thanksGroup, title,
  render: () => <div className="flex justify-center"><ThankYouNoteCard note={note} name={name} {...(handlers ? { handlers } : {})} /></div>,
});

const thread = (id: string, title: string, data: ThreadPageData, helper = false): PreviewEntry => {
  const handlers: ThreadHandlers = { ...fakeThreadHandlers, ...fakeConversationHandlers, thanks: thanksHandlers };
  return {
    id: `thanks/${id}`, group: id.startsWith('thread-quiet') ? quietGroup : thanksGroup, title, layout: 'fullscreen',
    render: () => <AppShell viewer={helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.thread(data.thread.id)} layout="flow"><ThreadContent data={data} handlers={handlers} now={now} /></AppShell>,
  };
};

export const thanksPreviews: PreviewEntry[] = [
  { id: 'thanks/offer', group: thanksGroup, title: 'Offer: "Thank Jordan with a note" (booking page)', render: () => <ThanksOffer bookingId="bkg_desk" name="Jordan T." onSave={thanksHandlers.onSave} /> },
  { id: 'thanks/offer-compact', group: thanksGroup, title: 'Offer above the message box (compact)', render: () => <div className="max-w-md rounded-xl border"><ThanksOffer bookingId="bkg_desk" name="Jordan" onSave={thanksHandlers.onSave} compact /></div> },
  card('card-client-editable', 'Client: sent, editable for 24 h, shown on the profile', thanksNoteClientEditable, 'Jordan T.'),
  card('card-client-locked', "Client: past 24 h, name hidden, not on the profile", thanksNoteClientLocked, 'Jordan T.'),
  card('card-client-hidden', 'Client: hidden by our team (can still delete)', thanksNoteClientHidden, 'Jordan T.'),
  card('card-client-failing', 'Client: "Don\'t show my name" fails and goes back', thanksNoteClientLocked, 'Jordan T.', failingThanks),
  card('card-helper', 'Helper: masked, not on the profile, Report', thanksNoteHelper, 'Maya R.'),
  card('card-helper-shown', 'Helper: shown on the profile', thanksNoteHelperShown, 'Maya R.'),
  card('card-helper-hidden', 'Helper: hidden by our team', thanksNoteHelperHidden, 'Maya R.'),
  card('card-readonly', 'Without handlers (read-only)', thanksNoteHelper, 'Maya R.', null),
  { id: 'thanks/profile-section', group: thanksGroup, title: 'Profile: six notes, named, anonymous and remote', render: () => <section className="space-y-3"><h2 className="text-xl font-semibold">Thank-you notes</h2><PublicThankYouNotes notes={jordanProfileWithThanks.thanks ?? []} /></section> },
  { id: 'thanks/profile-peek', group: thanksGroup, title: 'Profile peek: compact list', render: () => <div className="max-w-sm"><PublicThankYouNotes notes={(jordanProfileWithThanks.thanks ?? []).slice(0, 3)} compact /></div> },
  thread('thread-offer', 'Conversation: the client is offered a note', thanksOfferThreadPageData),
  thread('thread-client-card', "Conversation: the client's sent note as a card", thanksSentThreadPageData),
  thread('thread-helper-card', "Conversation: the helper's card with Show on my profile", thanksHelperThreadPageData, true),
  { id: 'thanks/admin-shown', group: thanksGroup, title: 'Staff: a reported note on its case', render: () => <AdminReportedThanks data={adminCaseThanksShown} onModerate={fakeHandler({ ok: true, code: 'updated' })} /> },
  { id: 'thanks/admin-hidden', group: thanksGroup, title: 'Staff: a hidden note (show again)', render: () => <AdminReportedThanks data={adminCaseThanksHidden} onModerate={fakeHandler({ ok: true, code: 'updated' })} /> },
  { id: 'quiet-hours/settings-off', group: quietGroup, title: 'Account: off (suggested times)', render: () => <div className="max-w-xl"><AccountQuietHours setting={mayaQuietHoursOffAccountData.quietHours!} onSave={fakeHandler({ ok: true, code: 'updated' })} /></div> },
  { id: 'quiet-hours/settings-on', group: quietGroup, title: 'Account: on, 9:30 pm to 7:00 am', render: () => <div className="max-w-xl"><AccountQuietHours setting={jordanQuietHoursOnAccountData.quietHours!} onSave={fakeHandler({ ok: true, code: 'updated' })} /></div> },
  { id: 'quiet-hours/settings-failing', group: quietGroup, title: 'Account: saving fails', render: () => <div className="max-w-xl"><AccountQuietHours setting={jordanQuietHoursOnAccountData.quietHours!} onSave={fakeHandler({ ok: false, code: 'unknown' })} /></div> },
  { id: 'quiet-hours/note', group: quietGroup, title: "Sender's note above the message box", render: () => <div className="max-w-md rounded-xl border"><QuietHoursNote name="Jordan" until={QUIET_UNTIL} /></div> },
  { id: 'quiet-hours/note-compact', group: quietGroup, title: "Sender's note in the chat window (compact)", render: () => <div className="max-w-sm rounded-xl border"><QuietHoursNote name="Jordan" until={QUIET_UNTIL} compact /></div> },
  thread('thread-quiet', "Conversation: the other person's quiet hours", quietHoursThreadPageData),
];
