import type { Metadata } from 'next';
import { withClientMessages } from '@/i18n/client-messages';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { reverseStrikeAction, setHelperSuspensionAction } from '@/modules/accounts/staff-actions';
import { decideAddressAction, decideIdentityCaptureAction, revealAddressProofAction, revealIdentityCaptureAction, revealIdentityDetailsAction, verificationStaffAction } from '@/modules/verification/staff-actions';
import { getAdminUser } from '@/modules/accounts/staff';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminUserScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';
import { adminBadgesFor, canModerateBadges } from '@/modules/badges/staff';
import { moderateBadgeAction } from '@/modules/badges/staff-actions';
import { adminAccountView } from '@/modules/accounts/account-moderation';
import { accountActionAction } from '@/modules/accounts/account-moderation-actions';

export const metadata: Metadata = { title: 'Person', robots: { index: false } };

/** One person for staff: bookings, cases, rewards, strikes, and suspending a helper. */
function AdminUserPage({ params }: PageProps<'/[locale]/admin/users/[userId]'>) {
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
  const [person, badges, account] = await Promise.all([getAdminUser(db, staff, userId, now), adminBadgesFor(db, userId), adminAccountView(db, staff, userId)]);
  if (!person) notFound();
  const data = { ...person, badges, canModerateBadges: canModerateBadges(staff.roles), ...(account ? { account } : {}) };
  return (
    <AdminUserScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onSuspension: setHelperSuspensionAction.bind(null, userId),
        onReverseStrike: reverseStrikeAction.bind(null, userId),
        onModerateBadge: moderateBadgeAction,
        onAccountAction: accountActionAction.bind(null, userId),
        onRevealAddressProof: revealAddressProofAction,
        onDecideAddress: decideAddressAction,
        onRevealIdentityCapture: revealIdentityCaptureAction,
        onRevealIdentityDetails: revealIdentityDetailsAction,
        onDecideIdentityCapture: decideIdentityCaptureAction,
        onVerificationAction: verificationStaffAction,
      }}
    />
  );
}

export default withClientMessages('[locale]/admin/(gated)/users/[userId]/page.tsx', AdminUserPage);
