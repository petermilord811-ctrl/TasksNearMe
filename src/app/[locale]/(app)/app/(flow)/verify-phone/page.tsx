import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import {
  changeEmail,
  changePhone,
  continueWith,
  passkeySignIn,
  passkeySignInOptions,
  requestEmailCode,
  resendEmailCode,
  resendPhoneCode,
  saveProfile,
  sendPhoneCode,
  signOutOfSignUp,
  verifyEmailCode,
  verifyPhoneCode,
} from '@/modules/accounts/sign-in/actions';
import { resolveCurrentSignIn } from '@/modules/accounts/sign-in/server';
import { redeemSignUpInvite } from '@/modules/beta/actions';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { SignInScreen } from '@/ui/screens/auth/sign-in-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.signIn');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * The phone check that posting asks for, inside the app (journeys on a phone, J-C2): sign-in's own phone steps and
 * actions, without the public site's header and its "Post a task" button. Any other step goes to sign-in itself, and
 * a phone already verified goes straight on to `next`.
 */
function VerifyPhonePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <VerifyPhone searchParams={searchParams} />
    </Suspense>
  );
}

async function VerifyPhone({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  const wanted = typeof next === 'string' ? next : undefined;
  const resolution = await resolveCurrentSignIn(wanted);
  if (resolution.kind === 'done') redirect(resolution.redirectTo);
  if (resolution.data.step !== 'phone' && resolution.data.step !== 'phone_code') redirect(routes.signIn(wanted));
  const data = resolution.data;
  return (
    <SignInScreen
      inApp
      data={data}
      handlers={{
        onRequestEmailCode: requestEmailCode.bind(null, data.next),
        onContinueWith: continueWith.bind(null, data.next),
        onVerifyEmailCode: verifyEmailCode.bind(null, data.next),
        onResendEmailCode: resendEmailCode.bind(null, data.next),
        onChangeEmail: changeEmail,
        onRedeemInvite: redeemSignUpInvite.bind(null, data.next),
        onSignOut: signOutOfSignUp,
        onSaveProfile: saveProfile.bind(null, data.next),
        onSendPhoneCode: sendPhoneCode.bind(null, data.next),
        onVerifyPhoneCode: verifyPhoneCode.bind(null, data.next),
        onResendPhoneCode: resendPhoneCode.bind(null, data.next),
        onChangePhone: changePhone,
        onPasskeyOptions: passkeySignInOptions,
        onPasskeySignIn: passkeySignIn.bind(null, data.next),
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(flow)/verify-phone/page.tsx', VerifyPhonePage);
