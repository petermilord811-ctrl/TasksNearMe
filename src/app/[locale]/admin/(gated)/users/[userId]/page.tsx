import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { reverseStrikeAction, setHelperSuspensionAction } from '@/modules/accounts/staff-actions';
import { decideAddressAction, decideIdentityCaptureAction, revealAddressProofAction, revealIdentityCaptureAction, verificationStaffAction } from '@/modules/verification/staff-actions';
import { getAdminUser } from '@/modules/accounts/staff';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminUserScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';
import { adminBadgesFor, canModerateBadges } from '@/modules/badges/staff';
import { moderateBadgeAction } from '@/modules/badges/staff-actions';

export const metadata: Metadata = { title: 'Person', robots: { index: false } };

/** One person for staff: bookings, cases, rewards, strikes, and suspending a helper. */
export default function AdminUserPage({ params }: PageProps<'/[locale]/admin/users/[userId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <AdminUser params={params} />
    </Suspense>
  );
}

async function AdminUser({ params }: Pick<PageProps<'/[locale]/admin/users/[userId]'>, 'params'>) {
  const [{ userId }, viewer] = await Promise.all([params, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = await requestNow();
  const [person, badges] = await Promise.all([getAdminUser(db, staff, userId, now), adminBadgesFor(db, userId)]);
  if (!person) notFound();
  const data = { ...person, badges, canModerateBadges: canModerateBadges(staff.roles) };
  return (
    <AdminUserScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onSuspension: setHelperSuspensionAction.bind(null, userId),
        onReverseStrike: reverseStrikeAction.bind(null, userId),
        onModerateBadge: moderateBadgeAction,
        onRevealAddressProof: revealAddressProofAction,
        onDecideAddress: decideAddressAction,
        onRevealIdentityCapture: revealIdentityCaptureAction,
        onDecideIdentityCapture: decideIdentityCaptureAction,
        onVerificationAction: verificationStaffAction,
      }}
    />
  );
}
