import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminUsers } from '@/modules/accounts/staff';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminUsersScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'People', robots: { index: false } };

/** Search people by name or email (`q` in the URL). */
export default function AdminUsersPage({ searchParams }: PageProps<'/admin/users'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminUsers searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminUsers({ searchParams }: Pick<PageProps<'/admin/users'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const query = Array.isArray(params.q) ? (params.q[0] ?? '') : (params.q ?? '');
  return <AdminUsersScreen data={await getAdminUsers(db, query)} now={new Date().toISOString()} />;
}
