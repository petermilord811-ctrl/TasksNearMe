import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminBookings, parseAdminBookingFilter } from '@/modules/support/staff-bookings';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminBookingsScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Bookings', robots: { index: false } };

/** Every booking for staff: a filter tab (`filter`) and a search (`q`) in the URL. */
export default function AdminBookingsPage({ searchParams }: PageProps<'/admin/bookings'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminBookings searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminBookings({ searchParams }: Pick<PageProps<'/admin/bookings'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
  const now = new Date();
  const data = await getAdminBookings(db, { filter: parseAdminBookingFilter(first(params.filter)), query: first(params.q) }, now);
  return <AdminBookingsScreen data={data} now={now.toISOString()} />;
}
