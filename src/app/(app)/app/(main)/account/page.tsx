import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { signOut } from '@/modules/accounts/actions';
import {
  requestAccountDeletionAction,
  requestDataExportAction,
  saveAccountProfileAction,
  saveNotificationPreferenceAction,
} from '@/modules/notifications/actions';
import { getAccountPage } from '@/modules/notifications/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AccountScreen } from '@/ui/screens/account';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };

/** Profile, contact details, notification preferences, helper status, privacy, sign out. */
export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.account()));
  const data = await getAccountPage(db, viewer.user.id);
  if (!data) notFound();
  return (
    <AccountScreen
      data={data}
      handlers={{
        onSaveProfile: saveAccountProfileAction,
        onSavePreference: saveNotificationPreferenceAction,
        onRequestExport: requestDataExportAction,
        onRequestDeletion: requestAccountDeletionAction,
        onSignOut: signOut,
      }}
    />
  );
}
