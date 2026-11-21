import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getMyTasks } from '@/modules/offers/owner';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { MyTasksScreen } from '@/ui/screens/tasks';
import { requestNow } from '@/platform/clock';
import { MyTasksSkeleton } from '@/ui/screens/tasks/my-tasks-skeleton';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('myTasks');
}

/** The poster's tasks: open, booked, past. */
export default function MyTasksPage() {
  return (
    <Suspense fallback={<MyTasksSkeleton />}>
      <MyTasks />
    </Suspense>
  );
}

async function MyTasks() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return null; // the layout sends visitors to sign-in
  const now = await requestNow();
  return <MyTasksScreen data={await getMyTasks(db, viewer.user.id, now)} now={now.toISOString()} />;
}
