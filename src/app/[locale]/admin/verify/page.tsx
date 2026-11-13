import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { confirmStaffAuthenticator, redeemStaffSetupCode, verifyStaffCode } from '@/modules/accounts/actions';
import { getStaffVerifyPage } from '@/modules/accounts/staff-authenticator';
import { getViewer } from '@/platform/auth/viewer';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { StaffVerifyScreen } from '@/ui/screens/admin/staff-verify-screen';

export const metadata: Metadata = { title: 'Staff sign-in', robots: { index: false } };

/** The staff two-step check: the authenticator's code, or setting the authenticator up (blueprint 08). */
export default function StaffVerifyPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <StaffVerify />
    </Suspense>
  );
}

async function StaffVerify() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user' || viewer.user.staffRoles.length === 0) notFound();
  if (viewer.user.staffTwoStepVerified) redirect(routes.admin.home());
  const data = await getStaffVerifyPage(
    { db, cipher: fieldCipherFromEnv(), secret: process.env.BETTER_AUTH_SECRET ?? '', production: process.env.NODE_ENV === 'production' },
    { id: viewer.user.id, displayName: viewer.user.displayName, email: viewer.user.email },
  );
  return <StaffVerifyScreen data={data} handlers={{ onVerifyCode: verifyStaffCode, onRedeemSetupCode: redeemStaffSetupCode, onConfirmEnrollment: confirmStaffAuthenticator }} />;
}
