import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { markAllNotificationsReadAction, openNotificationAction } from '@/modules/notifications/actions';
import { getNotificationsPage } from '@/modules/notifications/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { NotificationsDialogScreen } from '@/ui/screens/account';

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('notifications');
}

/**
 * The bell opens the notifications over the page it's on (2026-11-23, owner: "I hate to redirect to new pages
 * continually"). Its own address, not the notifications page's: that page stays a page (a notification's own dialog,
 * a review say, opens over it), and this one loaded on its own goes there ((app)/app/(main)/notifications/recent).
 */
function NotificationsDialogPage() {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Notifications />
    </Suspense>
  );
}

async function Notifications() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.notifications()));
  const now = await requestNow();
  const data = await getNotificationsPage(db, viewer.user.id, now);
  // The signed-in shell's clock, as the full page has it (the dialog opens outside the shell).
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <NotificationsDialogScreen data={data} now={now.toISOString()} handlers={{ onMarkAllRead: markAllNotificationsReadAction, onOpen: openNotificationAction }} />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/notifications/recent/page.tsx', NotificationsDialogPage);
