import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { markAllNotificationsReadAction, openNotificationAction } from '@/modules/notifications/actions';
import { getNotificationsPage } from '@/modules/notifications/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { NotificationsScreen } from '@/ui/screens/account';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };

/** What happened on the viewer's offers, bookings, payments and messages. */
function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Notifications />
    </Suspense>
  );
}

async function Notifications() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.notifications()));
  const now = await requestNow();
  const data = await getNotificationsPage(db, viewer.user.id, now);
  return (
    <NotificationsScreen
      data={data}
      now={now.toISOString()}
      handlers={{ onMarkAllRead: markAllNotificationsReadAction, onOpen: openNotificationAction }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/notifications/page.tsx', NotificationsPage);
