import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { appUrl } from '@/integrations/oauth';
import { createInviteCodeAction, revokeInviteCodeAction, setBetaGateAction } from '@/modules/beta/actions';
import { getAdminBetaPage } from '@/modules/beta/service';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminBetaScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Private beta', robots: { index: false } };

/** The private beta (blueprint 11 B-068): invite-only switches per market, invite codes, who joined. */
export default function AdminBetaPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Beta />
    </Suspense>
  );
}

async function Beta() {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  return (
    <AdminBetaScreen
      data={await getAdminBetaPage(db, staff, await requestNow(), appUrl())}
      handlers={{ onCreateCode: createInviteCodeAction, onRevokeCode: revokeInviteCodeAction, onSetGate: setBetaGateAction }}
    />
  );
}
