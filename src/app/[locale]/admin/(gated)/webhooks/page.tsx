import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { staffActorOf } from '@/modules/support/staff';
import { webhookAction } from '@/modules/webhooks/actions';
import { canSeeWebhooks, getAdminWebhooks } from '@/modules/webhooks/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminWebhooksScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Webhooks', robots: { index: false } };

/** The webhook inbox's failing and dead events, for admins and finance (completion plan 5.11). */
export default function AdminWebhooksPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminWebhooks />
    </Suspense>
  );
}

async function AdminWebhooks() {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff || !canSeeWebhooks(staff.roles)) notFound();
  const now = await requestNow();
  return <AdminWebhooksScreen data={await getAdminWebhooks(db, now)} now={now.toISOString()} handlers={{ onAction: webhookAction }} />;
}
