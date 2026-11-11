import {
  NOTIFICATION_TYPES, routes,
  type AppShellHandlers, type NotificationHandlers, type NotificationsPageData, type PreviewEntry, type SignedInViewer,
} from '@/contracts';
import {
  bookshelfInviteAcceptedPoster, bookshelfInviteCounteredPoster, bookshelfInviteSentHelper,
  deskChairChangeAppliedData, deskChairChangeCounterpartyData,
  fakeHandler, fakeNotificationHandlers, jordanNotificationsData, jordanShell,
  mayaNotificationsData, mayaShell, notificationsEmptyData, supportNotificationsData,
} from '@/fixtures';
import { NotificationsScreen } from '@/ui/screens/account/notifications-screen';
import { AppShell } from '@/ui/shells/app-shell';
import { AccountInteractionPreview } from './account-examples';
import copy from '../../../messages/en/ui/notifications.json';

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

function preview(variant: string, title: string, data: NotificationsPageData, viewer: SignedInViewer = mayaShell, handlers: NotificationHandlers = fakeNotificationHandlers, markAllError = false, now = viewer.mode === 'helper' ? '2026-11-25T16:00:00.000Z' : '2026-11-21T18:00:00.000Z'): PreviewEntry {
  return {
    id: `screen-notifications/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={{ ...viewer, unreadNotifications: data.unreadCount }} handlers={shellHandlers} currentPath={routes.app.notifications()}>
      <AccountInteractionPreview action={markAllError ? 'button' : undefined} triggerLabel={copy.markAllRead}>
        <NotificationsScreen data={data} handlers={handlers} now={now} />
      </AccountInteractionPreview>
    </AppShell>,
  };
}

const allTypes: NotificationsPageData = {
  notifications: NOTIFICATION_TYPES.map((type) => ({
    ...mayaNotificationsData.notifications[0], id: `preview-${type}`, type,
    params: type === 'payout_paid' ? jordanNotificationsData.notifications[0].params
      : type === 'earnings_transferred' ? jordanNotificationsData.notifications[2].params
        : type === 'helper_running_late' ? mayaNotificationsData.notifications[2].params
          : type === 'offer_received' || type === 'offer_updated' ? mayaNotificationsData.notifications[5].params : undefined,
  })),
  unreadCount: NOTIFICATION_TYPES.length,
};

const changes: NotificationsPageData = {
  notifications: [
    {
      id: 'preview-change-proposed', type: 'change_proposed',
      title: deskChairChangeCounterpartyData.booking.title, actorName: deskChairChangeCounterpartyData.booking.posterDisplayName,
      target: { kind: 'booking', bookingId: deskChairChangeCounterpartyData.booking.id },
      createdAt: deskChairChangeCounterpartyData.change.createdAt,
    },
    {
      id: 'preview-change-applied', type: 'change_applied', title: deskChairChangeAppliedData.booking.title,
      target: { kind: 'booking', bookingId: deskChairChangeAppliedData.booking.id },
      createdAt: deskChairChangeAppliedData.change.createdAt,
    },
  ],
  unreadCount: 2,
};

const inviteReceived: NotificationsPageData = {
  notifications: [{
    id: 'preview-invite-received', type: 'invite_received', title: bookshelfInviteSentHelper.task.title,
    actorName: bookshelfInviteSentHelper.client.displayName,
    target: { kind: 'invite', inviteId: bookshelfInviteSentHelper.id }, createdAt: bookshelfInviteSentHelper.sentAt,
  }],
  unreadCount: 1,
};

const inviteUpdates: NotificationsPageData = {
  notifications: [
    {
      id: 'preview-invite-countered', type: 'invite_countered', title: bookshelfInviteCounteredPoster.task.title,
      actorName: bookshelfInviteCounteredPoster.helper.displayName,
      params: { amountCents: bookshelfInviteCounteredPoster.counter!.breakdown.taskPriceCents },
      target: { kind: 'task', taskId: bookshelfInviteCounteredPoster.task.id }, createdAt: bookshelfInviteCounteredPoster.sentAt,
    },
    {
      id: 'preview-invite-accepted', type: 'invite_accepted', title: bookshelfInviteAcceptedPoster.task.title,
      actorName: bookshelfInviteAcceptedPoster.helper.displayName,
      target: { kind: 'booking', bookingId: bookshelfInviteAcceptedPoster.bookingId! }, createdAt: bookshelfInviteAcceptedPoster.sentAt,
    },
  ],
  unreadCount: 2,
};

const updatedNotificationHandlers: NotificationHandlers = {
  onOpen: fakeHandler({ ok: true, code: 'updated' }),
  onMarkAllRead: fakeHandler({ ok: true, code: 'updated' }),
};

export const notificationPreviews: PreviewEntry[] = [
  preview('client', copy.previews.client, mayaNotificationsData),
  preview('helper', copy.previews.helper, jordanNotificationsData, jordanShell),
  preview('support', copy.previews.support, supportNotificationsData, mayaShell, fakeNotificationHandlers, false, '2026-11-24T18:00:00.000Z'),
  preview('empty', copy.previews.empty, notificationsEmptyData),
  preview('all-types', copy.previews.allTypes, allTypes),
  preview('changes', copy.previews.changes, changes, jordanShell, updatedNotificationHandlers),
  preview('invite-received', copy.previews.inviteReceived, inviteReceived, jordanShell, updatedNotificationHandlers, false, bookshelfInviteSentHelper.sentAt),
  preview('invite-updates', copy.previews.inviteUpdates, inviteUpdates, mayaShell, updatedNotificationHandlers, false, bookshelfInviteAcceptedPoster.sentAt),
  preview('all-read', copy.previews.readOnly, {
    notifications: mayaNotificationsData.notifications.map((notification) => ({ ...notification, readAt: notification.readAt ?? notification.createdAt })),
    unreadCount: 0,
  }),
  preview('missing-details', copy.previews.missingParams, {
    ...allTypes,
    notifications: allTypes.notifications.map((notification) => ({ ...notification, title: undefined, actorName: undefined, params: undefined })),
  }),
  preview('mark-all-error', copy.previews.markAllError, mayaNotificationsData, mayaShell, {
    ...fakeNotificationHandlers, onMarkAllRead: fakeHandler({ ok: false, code: 'unknown' }, 0),
  }, true),
];
