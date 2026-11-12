import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { connectSignInAction, disconnectSignInAction, signOut } from '@/modules/accounts/actions';
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

/**
 * Profile, contact details, ways to sign in, notification preferences, helper status, privacy, sign out.
 * Connecting Google or Microsoft comes back here with `connect` (and `error` when it didn't work).
 */
export default function AccountPage({ searchParams }: PageProps<'/app/account'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Account searchParams={searchParams} />
    </Suspense>
  );
}

async function Account({ searchParams }: Pick<PageProps<'/app/account'>, 'searchParams'>) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.account()));
  const { connect, error } = await searchParams;
  const data = await getAccountPage(db, viewer.user.id, { connect, error });
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
        onConnectSignIn: connectSignInAction,
        onDisconnectSignIn: disconnectSignInAction,
      }}
    />
  );
}
