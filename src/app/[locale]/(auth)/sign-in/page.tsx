import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import {
  changeEmail,
  changePhone,
  passkeySignIn,
  passkeySignInOptions,
  continueWith,
  requestEmailCode,
  resendEmailCode,
  resendPhoneCode,
  saveProfile,
  sendPhoneCode,
  signOutOfSignUp,
  verifyEmailCode,
  verifyPhoneCode,
} from '@/modules/accounts/sign-in/actions';
import { botCheckForPage } from '@/modules/accounts/bot-check';
import { resolveCurrentSignIn } from '@/modules/accounts/sign-in/server';
import { redeemSignUpInvite } from '@/modules/beta/actions';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { SignInScreen } from '@/ui/screens/auth/sign-in-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.signIn');
  return { title: t('title'), description: t('description'), robots: { index: false, follow: false } };
}

/**
 * One flow for sign-in and sign-up. The step comes from the session and pending codes. A Google or
 * Microsoft sign-in comes back here: signed in (the next step), or with `via` and `error`.
 */
function SignInPage({ searchParams }: PageProps<'/[locale]/sign-in'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <SignIn searchParams={searchParams} />
    </Suspense>
  );
}

async function SignIn({ searchParams }: Pick<PageProps<'/[locale]/sign-in'>, 'searchParams'>) {
  const { next, via, error } = await searchParams;
  const resolution = await resolveCurrentSignIn(typeof next === 'string' ? next : undefined, { via, error });
  if (resolution.kind === 'done') redirect(resolution.redirectTo);

  // The name step (finishing sign-up) runs a bot check before Continue (Turnstile, or the stand-in outside
  // production). Asking for a code doesn't, since 2026-11-14 (the owner's call; rate limits hold floods).
  const botCheck = resolution.data.step === 'profile' ? await botCheckForPage() : undefined;
  const data = botCheck ? { ...resolution.data, botCheck } : resolution.data;
  return (
    <SignInScreen
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

export default withClientMessages('[locale]/(auth)/sign-in/page.tsx', SignInPage);
