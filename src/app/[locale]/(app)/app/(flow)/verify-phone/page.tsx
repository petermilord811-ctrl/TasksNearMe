import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { resolveCurrentSignIn } from '@/modules/accounts/sign-in/server';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { InAppPhoneStep, isPhoneStep } from '../../_phone/in-app-phone-step';
import { AuthPageMarker } from '@/ui/lib/auth-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.signIn');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * The phone check a page asks for, inside the app (journeys on a phone, J-C2): sign-in's own phone steps and actions,
 * without the public site's header and its "Post a task" button. Any other step goes to sign-in itself, and a phone
 * already verified goes straight on to `next`. Post a task shows the same steps on its own page since 2026-11-23; this
 * page stays for links that name it.
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
  if (!isPhoneStep(resolution.data)) redirect(routes.signIn(wanted));
  return <>
    {/* The phone step goes on to where it was asked from: a page with a dialog version loads as its own page. */}
    <AuthPageMarker />
    <InAppPhoneStep data={resolution.data} />
  </>;
}

export default withClientMessages('[locale]/(app)/app/(flow)/verify-phone/page.tsx', VerifyPhonePage);
