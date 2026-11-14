import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { resubscribeByLinkAction, unsubscribeByLinkAction } from '@/modules/notifications/unsubscribe-actions';
import { getUnsubscribePage } from '@/modules/notifications/unsubscribe-service';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { EmailUnsubscribeScreen } from '@/ui/screens/account';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account.unsubscribe');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/** From the unsubscribe link in a notification email (no sign-in: the link is signed). */
function EmailUnsubscribePage({ searchParams }: PageProps<'/[locale]/email/unsubscribe'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Unsubscribe searchParams={searchParams} />
    </Suspense>
  );
}

async function Unsubscribe({ searchParams }: Pick<PageProps<'/[locale]/email/unsubscribe'>, 'searchParams'>) {
  const { token: raw } = await searchParams;
  const token = typeof raw === 'string' ? raw : '';
  const data = await getUnsubscribePage(db, token);
  return (
    <EmailUnsubscribeScreen
      data={data}
      handlers={{ onUnsubscribe: unsubscribeByLinkAction.bind(null, token), onResubscribe: resubscribeByLinkAction.bind(null, token) }}
    />
  );
}

export default withClientMessages('[locale]/(public)/email/unsubscribe/page.tsx', EmailUnsubscribePage);
