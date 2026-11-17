import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { resubscribeWaitlistByLinkAction, unsubscribeWaitlistByLinkAction } from '@/modules/marketing/actions';
import { getWaitlistUnsubscribePage } from '@/modules/marketing/waitlist-unsubscribe';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { WaitlistUnsubscribeScreen } from '@/ui/screens/public/waitlist-unsubscribe-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('waitlist.unsubscribe');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/** From the unsubscribe link in a waitlist email (completion plan 8.3; no sign-in: the link is signed). It asks first. */
function WaitlistUnsubscribePage({ searchParams }: PageProps<'/[locale]/email/waitlist'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Unsubscribe searchParams={searchParams} />
    </Suspense>
  );
}

async function Unsubscribe({ searchParams }: Pick<PageProps<'/[locale]/email/waitlist'>, 'searchParams'>) {
  const { token: raw } = await searchParams;
  const token = typeof raw === 'string' ? raw : '';
  const data = await getWaitlistUnsubscribePage(db, token);
  return (
    <WaitlistUnsubscribeScreen
      data={data}
      handlers={{ onUnsubscribe: unsubscribeWaitlistByLinkAction.bind(null, token), onResubscribe: resubscribeWaitlistByLinkAction.bind(null, token) }}
    />
  );
}

export default withClientMessages('[locale]/(public)/email/waitlist/page.tsx', WaitlistUnsubscribePage);
