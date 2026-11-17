import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { getContactRevertPage } from '@/modules/accounts/contact-revert';
import { confirmContactRevertAction } from '@/modules/accounts/contact-revert-actions';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { ContactRevertScreen } from '@/ui/screens/account/contact-revert-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account.notMe');
  return { title: t('metaTitle'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/**
 * The "Not you?" link in an email or phone change notice (completion plan 5.23). No sign-in: the link is signed
 * and works once. Opening it changes nothing; the button does (mail apps open links to scan them).
 */
function ContactRevertPage({ searchParams }: PageProps<'/[locale]/account/not-me'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <ContactRevert searchParams={searchParams} />
    </Suspense>
  );
}

async function ContactRevert({ searchParams }: Pick<PageProps<'/[locale]/account/not-me'>, 'searchParams'>) {
  const { token: raw } = await searchParams;
  const token = typeof raw === 'string' ? raw : '';
  const data = await getContactRevertPage(db, token, await requestNow());
  return <ContactRevertScreen data={data} handlers={{ onConfirm: confirmContactRevertAction.bind(null, token) }} />;
}

export default withClientMessages('[locale]/(public)/account/not-me/page.tsx', ContactRevertPage);
