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
import { signUpWith, startSignUp } from '@/modules/accounts/sign-in/sign-up-actions';
import { intentForNext } from '@/modules/accounts/sign-in/sign-up-domain';
import { redeemSignUpInvite } from '@/modules/beta/actions';
import { publicPageMetadata } from '@/i18n/metadata';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { SignInScreen } from '@/ui/screens/auth/sign-in-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.signUp');
  // People search for it by name ("tasksnearme sign up"), so it may be listed, unlike sign-in.
  return publicPageMetadata({ path: routes.signUp(), title: t('title'), description: t('description') });
}

/**
 * Creating an account (completion plan 9.6): its own first step, `sign_up` (name, email, what the person is here for,
 * 18+ and the terms, or Google and Microsoft), then the same steps as `/sign-in`, which this page shows as they come.
 * Signed in already: on to where they were going.
 */
function SignUpPage({ searchParams }: PageProps<'/[locale]/sign-up'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <SignUp searchParams={searchParams} />
    </Suspense>
  );
}

async function SignUp({ searchParams }: Pick<PageProps<'/[locale]/sign-up'>, 'searchParams'>) {
  const { next, via, error } = await searchParams;
  const resolution = await resolveCurrentSignIn(typeof next === 'string' ? next : undefined, { via, error });
  if (resolution.kind === 'done') redirect(resolution.redirectTo);

  // The first step here is the sign-up form; the others are sign-in's. Both forms that finish sign-up run the bot check.
  const step = resolution.data.step === 'email' ? 'sign_up' : resolution.data.step;
  const botCheck = step === 'sign_up' || step === 'profile' ? await botCheckForPage() : undefined;
  const data = { ...resolution.data, step, ...(botCheck ? { botCheck } : {}), ...(step === 'sign_up' ? { suggestedIntent: intentForNext(resolution.data.next) } : {}) };
  return (
    <SignInScreen
      data={data}
      handlers={{
        onStartSignUp: startSignUp.bind(null, data.next),
        onSignUpWith: signUpWith.bind(null, data.next),
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
      }}
    />
  );
}

export default withClientMessages('[locale]/(auth)/sign-up/page.tsx', SignUpPage);
