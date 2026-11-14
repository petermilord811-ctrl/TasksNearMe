import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { createStaffSetupCodeAction, grantStaffRoleAction, removeStaffRoleAction, resetStaffAuthenticatorAction } from '@/modules/accounts/staff-actions';
import { getAdminStaff } from '@/modules/accounts/staff-roles';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminStaffScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Staff', robots: { index: false } };

/** Staff roles, for admins only (other staff get not found). */
function AdminStaffPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminStaff />
    </Suspense>
  );
}

async function AdminStaff() {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const data = await getAdminStaff(db, staff);
  if (!data) notFound();
  return <AdminStaffScreen data={data} now={(await requestNow()).toISOString()} handlers={{ onGrant: grantStaffRoleAction, onRemove: removeStaffRoleAction, onCreateSetupCode: createStaffSetupCodeAction, onResetAuthenticator: resetStaffAuthenticatorAction }} />;
}

export default withClientMessages('[locale]/admin/(gated)/staff/page.tsx', AdminStaffPage);
