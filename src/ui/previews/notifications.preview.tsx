import {
  NOTIFICATION_TYPES, routes,
  type AppShellHandlers, type NotificationHandlers, type NotificationsPageData, type PreviewEntry, type SignedInViewer,
} from '@/contracts';
import {
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

export const notificationPreviews: PreviewEntry[] = [
  preview('client', copy.previews.client, mayaNotificationsData),
  preview('helper', copy.previews.helper, jordanNotificationsData, jordanShell),
  preview('support', copy.previews.support, supportNotificationsData, mayaShell, fakeNotificationHandlers, false, '2026-11-24T18:00:00.000Z'),
  preview('empty', copy.previews.empty, notificationsEmptyData),
  preview('all-types', copy.previews.allTypes, allTypes),
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
