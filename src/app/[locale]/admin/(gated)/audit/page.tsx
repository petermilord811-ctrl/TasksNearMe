import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminAuditPage, parseAuditQuery } from '@/modules/support/staff-audit';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminAuditScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Audit log', robots: { index: false } };

/** The audit log, for admins and support leads (other staff get not found). Filters live in the URL. */
export default function AdminAuditPage({ searchParams }: PageProps<'/[locale]/admin/audit'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminAudit searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminAudit({ searchParams }: Pick<PageProps<'/[locale]/admin/audit'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const { filters, before } = parseAuditQuery(params);
  const data = await getAdminAuditPage(db, staff, filters, before);
  if (!data) notFound();
  return <AdminAuditScreen data={data} now={(await requestNow()).toISOString()} />;
}
