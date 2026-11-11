import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import {
  changeEmail,
  changePhone,
  requestEmailCode,
  resendEmailCode,
  resendPhoneCode,
  saveProfile,
  sendPhoneCode,
  verifyEmailCode,
  verifyPhoneCode,
} from '@/modules/accounts/sign-in/actions';
import { resolveCurrentSignIn } from '@/modules/accounts/sign-in/server';
import { PageSkeleton } from '@/ui/components';
import { SignInScreen } from '@/ui/screens/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.signIn');
  return { title: t('title'), description: t('description'), robots: { index: false, follow: false } };
}

/** One flow for sign-in and sign-up. The step comes from the session and pending codes. */
export default function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <SignIn searchParams={searchParams} />
    </Suspense>
  );
}

async function SignIn({ searchParams }: Pick<PageProps<'/sign-in'>, 'searchParams'>) {
  const { next } = await searchParams;
  const resolution = await resolveCurrentSignIn(typeof next === 'string' ? next : undefined);
  if (resolution.kind === 'done') redirect(resolution.redirectTo);

  const { data } = resolution;
  return (
    <SignInScreen
      data={data}
      handlers={{
        onRequestEmailCode: requestEmailCode.bind(null, data.next),
        onVerifyEmailCode: verifyEmailCode.bind(null, data.next),
        onResendEmailCode: resendEmailCode.bind(null, data.next),
        onChangeEmail: changeEmail,
        onSaveProfile: saveProfile.bind(null, data.next),
        onSendPhoneCode: sendPhoneCode.bind(null, data.next),
        onVerifyPhoneCode: verifyPhoneCode.bind(null, data.next),
        onResendPhoneCode: resendPhoneCode.bind(null, data.next),
        onChangePhone: changePhone,
      }}
    />
  );
}
