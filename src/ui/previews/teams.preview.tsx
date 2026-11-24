import { routes, type AppShellHandlers, type BookingSheetHandlers, type BookingView, type PreviewEntry, type TeamHandlers, type TeamInviteCard, type ThreadHandlers, type ThreadPageData } from '@/contracts';
import {
  chrisTeamBookingsPageData, fakeBookingHubHandlers, fakeConversationHandlers, fakeHandler, fakeThreadHandlers, jordanShell, mayaShell,
  movingClientCancelChoiceData, movingClientConfirmData, movingClientPartnerBookingData, movingClientTeamData, movingLeadCanInviteData, movingLeadInvitedData, movingLeadTeamData, movingPartnerBookingData,
  teamCardStates, teamClientBarThreadData, teamClientConfirmThreadData, teamPartnerBarThreadData, teamPartnerInviteThreadData,
} from '@/fixtures';
import { TeamBarView, TeamInviteCardView } from '@/ui/components/teams/team-card';
import { TeamInviteDialog, TeamPanel } from '@/ui/components/teams/team-panel';
import { BookingHubScreen } from '@/ui/screens/bookings/booking-hub-screen';
import { BookingsScreen } from '@/ui/screens/bookings/bookings-screen';
import { ThreadContent } from '@/ui/screens/messages/thread-screen';
import { AppShell } from '@/ui/shells/app-shell';

/**
 * Team up (2026-11-24): the invite card in every state for the partner, the lead and the client; the lead's invite
 * dialog; the team on the booking pages (lead, partner, client, the client's cancel choice); the bookings list; and the
 * team bar in the conversations.
 */

const group = 'Team up';
const now = '2026-11-24T17:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const teamHandlers: TeamHandlers = { onInvite: fakeHandler({ ok: true, code: 'sent' }), onAction: fakeHandler({ ok: true, code: 'updated' }), onKeep: fakeHandler({ ok: true, code: 'updated' }) };
const failingTeam: TeamHandlers = { onInvite: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { username: ['invalid'] } }), onAction: fakeHandler({ ok: false, code: 'expired' }) };
const sheets: BookingSheetHandlers = {
  onPreviewCancel: () => Promise.resolve({ by: 'poster', late: false, freeUntil: now, posterRefundCents: 0, helperCompensationCents: 0, helperStrike: false, paidDirectly: true }),
  onCancel: fakeHandler({ ok: true, code: 'canceled' }),
  onRunningLate: fakeHandler({ ok: true, code: 'updated' }),
  onReportNoShow: fakeHandler({ ok: true, code: 'canceled' }),
  onCantAccess: fakeHandler({ ok: true, code: 'updated' }),
  onSafetyReport: fakeHandler({ ok: true, code: 'submitted' }),
};

const card = (id: keyof typeof teamCardStates, title: string, handlers: TeamHandlers = teamHandlers): PreviewEntry => ({
  id: `teams/card-${id}`, group, title,
  render: () => <div className="flex justify-center"><TeamInviteCardView card={teamCardStates[id] as TeamInviteCard} handlers={handlers} createdAt={now} /></div>,
});

const page = (id: string, title: string, data: BookingView, helper = false): PreviewEntry => ({
  id: `teams/booking-${id}`, group, title, layout: 'fullscreen',
  render: () => <AppShell viewer={helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.booking(data.id)} layout="flow">
    <BookingHubScreen data={data} handlers={fakeBookingHubHandlers} sheets={sheets} team={teamHandlers} partnerSheets={sheets} now={now} />
  </AppShell>,
});

const thread = (id: string, title: string, data: ThreadPageData, helper = false): PreviewEntry => {
  const handlers: ThreadHandlers = { ...fakeThreadHandlers, ...fakeConversationHandlers, teams: teamHandlers };
  return {
    id: `teams/thread-${id}`, group, title, layout: 'fullscreen',
    render: () => <AppShell viewer={helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.thread(data.thread.id)} layout="flow"><ThreadContent data={data} handlers={handlers} now={now} /></AppShell>,
  };
};

export const teamPreviews: PreviewEntry[] = [
  card('partnerInvited', 'Partner: invited (accept or decline, with the note)'),
  card('partnerAccepted', 'Partner: accepted, waiting for the client (step back)'),
  card('partnerBooked', 'Partner: on the team, their booking linked'),
  card('leadInvited', "Lead: asking (their proposal's price, cancel)"),
  card('leadConfirmed', 'Lead: on the team (names and roles only)'),
  card('leadDeclined', 'Lead: the partner said no'),
  card('clientAccepted', 'Client: confirm or not now'),
  card('clientBooking', 'Client: confirmed, held part not booked yet (Book Sam)'),
  card('clientBooked', "Client: booked, the partner's booking linked"),
  card('clientRefused', 'Client: said no'),
  card('expired', 'Expired (the job started)'),
  card('clientPartnerCanceled', "Client: the partner's booking was canceled"),
  { id: 'teams/card-readonly', group, title: 'Read-only (no handlers)', render: () => <div className="flex justify-center"><TeamInviteCardView card={teamCardStates.partnerInvited} createdAt={now} /></div> },
  { id: 'teams/card-failing', group, title: 'Answer fails: expired now', render: () => <div className="flex justify-center"><TeamInviteCardView card={teamCardStates.partnerInvited} handlers={failingTeam} /></div> },
  { id: 'teams/invite-dialog', group, title: "Lead's invite dialog", render: () => <TeamInviteDialog open onOpenChange={() => undefined} onInvite={teamHandlers.onInvite!} /> },
  { id: 'teams/invite-dialog-not-found', group, title: 'Invite dialog: nobody bookable by that @username', render: () => <TeamInviteDialog open onOpenChange={() => undefined} onInvite={failingTeam.onInvite!} /> },
  { id: 'teams/panel-can-invite', group, title: 'Panel: the lead can team up', render: () => <div className="max-w-reading"><TeamPanel data={movingLeadCanInviteData} team={movingLeadCanInviteData.team!} handlers={teamHandlers} /></div> },
  { id: 'teams/panel-cancel-choice', group, title: "Panel: the client's keep or cancel choice", render: () => <div className="max-w-reading"><TeamPanel data={movingClientCancelChoiceData} team={movingClientCancelChoiceData.team!} handlers={teamHandlers} partnerSheets={sheets} /></div> },
  page('lead-can-invite', "Lead's booking: Team up", movingLeadCanInviteData, true),
  page('lead-invited', "Lead's booking: invite waiting", movingLeadInvitedData, true),
  page('lead-team', "Lead's booking: Sam on the team", movingLeadTeamData, true),
  page('client-confirm', "Client's booking with the lead: confirm Sam", movingClientConfirmData),
  page('client-team', "Client's booking with the lead: team booked", movingClientTeamData),
  page('client-cancel-choice', "Client: the lead's booking canceled, keep Sam or cancel both", movingClientCancelChoiceData),
  page('partner', "Partner's booking: Jordan leads", movingPartnerBookingData, true),
  page('client-partner', "Client's view of the partner's booking", movingClientPartnerBookingData),
  { id: 'teams/bookings-list', group, title: "Client's bookings: both parts as one team job", layout: 'fullscreen', render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.bookings()} layout="flow"><BookingsScreen data={chrisTeamBookingsPageData} now={now} /></AppShell> },
  { id: 'teams/bar', group, title: 'Team bar (page and compact)', render: () => <div className="max-w-xl space-y-4 rounded-xl border">{teamClientBarThreadData.team && <TeamBarView bar={teamClientBarThreadData.team} />}{teamPartnerBarThreadData.team && <TeamBarView bar={teamPartnerBarThreadData.team} compact />}</div> },
  thread('client-confirm', "Client's conversation with the lead: the confirm card", teamClientConfirmThreadData),
  thread('client-bar', "Client's conversation: the team bar", teamClientBarThreadData),
  thread('partner-invite', 'Team conversation: the partner is invited', teamPartnerInviteThreadData, true),
  thread('partner-bar', 'Team conversation: the team bar', teamPartnerBarThreadData, true),
];
