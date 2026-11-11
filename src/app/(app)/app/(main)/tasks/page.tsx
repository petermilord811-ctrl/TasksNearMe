import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getMyTasks } from '@/modules/offers/owner';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { MyTasksScreen } from '@/ui/screens/tasks';

export const metadata: Metadata = { title: 'My tasks' };

/** The poster's tasks: open, booked, past. */
export default function MyTasksPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <MyTasks />
    </Suspense>
  );
}

async function MyTasks() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return null; // the layout sends visitors to sign-in
  const now = new Date();
  return <MyTasksScreen data={await getMyTasks(db, viewer.user.id, now)} now={now.toISOString()} />;
}
