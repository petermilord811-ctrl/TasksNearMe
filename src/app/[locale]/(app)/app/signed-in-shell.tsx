import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { setMode, signOut } from '@/modules/accounts/actions';
import { signUpUnfinished } from '@/modules/accounts/sign-up';
import { remindApprovalsDue, remindUpcomingBookings } from '@/modules/bookings/reminders';
import { unreadMessageCount } from '@/modules/messaging/service';
import { dispatchNotifications, unreadNotificationCount } from '@/modules/notifications/service';
import { getViewer, toSignedInViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AppShell, type AppShellProps } from '@/ui/shells';
import { requestNow } from '@/platform/clock';

type ShellLayout = NonNullable<AppShellProps['layout']>;

/**
 * The signed-in shell, shared by the (main) and (flow) route groups. Visitors without a session
 * go to sign-in, and so do accounts that haven't finished signing up (name, 18+ and terms, or a private
 * beta invite): `/sign-in` shows the step they stopped at. `flow` hides the phone tab bar for step-by-step screens like posting a task.
 */
export function SignedInShell({ layout, children }: { layout: ShellLayout; children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton variant={layout === 'flow' ? 'form' : 'list'} />}>
      <ViewerShell layout={layout}>{children}</ViewerShell>
    </Suspense>
  );
}

async function ViewerShell({ layout, children }: { layout: ShellLayout; children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.home()));
  if (await signUpUnfinished(db, viewer.user.id)) redirect(routes.signIn(routes.app.home()));
  // The job runner does this every minute; doing it for the viewer too keeps pages current, and lets a
  // time-travel test (the test clock moves this request's "now") see its reminders and notifications.
  const now = await requestNow();
  await remindApprovalsDue(db, now, { posterUserId: viewer.user.id });
  await remindUpcomingBookings(db, now, { userId: viewer.user.id });
  await dispatchNotifications(db, now, 50);
  const [unreadMessages, unreadNotifications] = await Promise.all([unreadMessageCount(db, viewer.user.id), unreadNotificationCount(db, viewer.user.id)]);
  return (
    <AppShell viewer={{ ...toSignedInViewer(viewer.user), unreadMessages, unreadNotifications }} handlers={{ onModeChange: setMode, onSignOut: signOut }} layout={layout}>
      {children}
    </AppShell>
  );
}
