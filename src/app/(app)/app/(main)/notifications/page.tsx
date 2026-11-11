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

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };

/** What happened on the viewer's offers, bookings, payments and messages. */
export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Notifications />
    </Suspense>
  );
}

async function Notifications() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.notifications()));
  const now = new Date();
  const data = await getNotificationsPage(db, viewer.user.id, now);
  return (
    <NotificationsScreen
      data={data}
      now={now.toISOString()}
      handlers={{ onMarkAllRead: markAllNotificationsReadAction, onOpen: openNotificationAction }}
    />
  );
}
