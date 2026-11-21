import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import {
  confirmEmailChangeAction,
  confirmPhoneChangeAction,
  removeProfilePhotoAction,
  startEmailChangeAction,
  startPhoneChangeAction,
  uploadProfilePhotoAction,
} from '@/modules/accounts/account-actions';
import {
  addPasskeyAction,
  connectSignInAction,
  disconnectSignInAction,
  passkeyRegistrationOptionsAction,
  removePasskeyAction,
  saveActivityAction,
  saveLanguageAction,
  signOut,
} from '@/modules/accounts/actions';
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  saveAccountProfileAction,
  saveNotificationPreferenceAction,
} from '@/modules/notifications/actions';
import { cancelAccountDeletionAction, requestAccountDeletionAction, requestDataExportAction } from '@/modules/privacy/actions';
import { getAccountPage } from '@/modules/notifications/service';
import { accountVerificationFor } from '@/modules/badges/standing';
import { ownBadges } from '@/modules/badges/service';
import { requestNow } from '@/platform/clock';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AccountScreen } from '@/ui/screens/account';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('account');
}

/**
 * Profile (name and photo), contact details (email and phone, each changed with a 6-digit code), ways to
 * sign in, notification preferences, helper status, privacy, sign out. Connecting Google or Microsoft comes
 * back here with `connect` (and `error` when it didn't work).
 */
function AccountPage({ searchParams }: PageProps<'/[locale]/app/account'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Account searchParams={searchParams} />
    </Suspense>
  );
}

async function Account({ searchParams }: Pick<PageProps<'/[locale]/app/account'>, 'searchParams'>) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.account()));
  const { connect, error } = await searchParams;
  const now = await requestNow();
  const [page, verification, badges] = await Promise.all([getAccountPage(db, viewer.user.id, { connect, error }, now), accountVerificationFor(db, viewer.user.id, now), ownBadges(db, viewer.user.id)]);
  if (!page) notFound();
  // A client with nothing to verify (no texts here, plan 9.2, and no ID check asked for) gets no verification section.
  const data = { ...page, ...(verification.role === 'helper' || verification.steps.length > 0 ? { verification } : {}), badges };
  return (
    <AccountScreen
      data={data}
      handlers={{
        onSaveProfile: saveAccountProfileAction,
        onSavePreference: saveNotificationPreferenceAction,
        onRequestExport: requestDataExportAction,
        onRequestDeletion: requestAccountDeletionAction,
        onCancelDeletion: cancelAccountDeletionAction,
        onSavePushSubscription: savePushSubscriptionAction,
        onRemovePushSubscription: removePushSubscriptionAction,
        onSignOut: signOut,
        onConnectSignIn: connectSignInAction,
        onDisconnectSignIn: disconnectSignInAction,
        onPasskeyRegistrationOptions: passkeyRegistrationOptionsAction,
        onAddPasskey: addPasskeyAction,
        onRemovePasskey: removePasskeyAction,
        onSaveLanguage: saveLanguageAction,
        onSaveActivity: saveActivityAction,
        onUploadPhoto: uploadProfilePhotoAction,
        onRemovePhoto: removeProfilePhotoAction,
        onStartEmailChange: startEmailChangeAction,
        onConfirmEmailChange: confirmEmailChangeAction,
        onStartPhoneChange: startPhoneChangeAction,
        onConfirmPhoneChange: confirmPhoneChangeAction,
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/account/page.tsx', AccountPage);
