import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { localeOrDefault } from '@/contracts';
import { joinWaitlistAction } from '@/modules/marketing/actions';
import { getWaitlistDemand, getWaitlistPageData } from '@/modules/marketing/queries';
import { requestRows } from '@/platform/auth/audience';
import { normalizeZip } from '@/shared/us-zip';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { WaitlistScreen } from '@/ui/screens/public/waitlist-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.waitlist');
  return { title: t('title'), description: t('description'), robots: { index: false, follow: true } };
}

/**
 * Outside the cities we're open in, or (`?from=beta`) from an invite-only step during the private beta. `?zip=`
 * (posting's "We're not in Dallas yet") fills the form and shows how many people already wait near it. Joining keeps
 * the page's language, for the email that tells them their city opened (completion plan 8.3).
 */
function WaitlistPage({ searchParams }: PageProps<'/[locale]/waitlist'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Waitlist searchParams={searchParams} />
    </Suspense>
  );
}

async function Waitlist({ searchParams }: Pick<PageProps<'/[locale]/waitlist'>, 'searchParams'>) {
  const [{ from, zip }, data, locale] = await Promise.all([searchParams, requestRows().then(getWaitlistPageData), getLocale()]);
  const initialZip = typeof zip === 'string' ? normalizeZip(zip) : null;
  const demand = initialZip ? await getWaitlistDemand(initialZip) : null;
  return (
    <WaitlistScreen
      data={{
        ...data,
        ...(from === 'beta' ? { from: 'beta' as const } : {}),
        ...(initialZip ? { initialZip } : {}),
        ...(demand ? { demand } : {}),
      }}
      handlers={{ onJoin: joinWaitlistAction.bind(null, localeOrDefault(locale)) }}
    />
  );
}

export default withClientMessages('[locale]/(public)/waitlist/page.tsx', WaitlistPage);
