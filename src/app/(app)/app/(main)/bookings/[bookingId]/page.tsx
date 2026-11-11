import { and, eq, or } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { bookings } from '@/modules/bookings/schema';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';

/**
 * The booking page. Until its screen lands (UI-011), it sends each participant to their side of the
 * task: the client to the task page, the helper to the task from the helper's side. Anyone else: 404.
 */
export default function BookingPage({ params }: PageProps<'/app/bookings/[bookingId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Booking params={params} />
    </Suspense>
  );
}

async function Booking({ params }: Pick<PageProps<'/app/bookings/[bookingId]'>, 'params'>): Promise<React.ReactNode> {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.booking(bookingId)));
  const userId = viewer.user.id;
  const [booking] = await db
    .select({ taskId: bookings.taskId, posterUserId: bookings.posterUserId })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId))))
    .limit(1);
  if (!booking) notFound();
  return redirect(booking.posterUserId === userId ? routes.app.task(booking.taskId) : routes.app.findWorkTask(booking.taskId));
}
