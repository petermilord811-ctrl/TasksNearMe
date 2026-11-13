import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { joinWaitlistAction } from '@/modules/marketing/actions';
import { getWaitlistPageData } from '@/modules/marketing/queries';
import { PageSkeleton } from '@/ui/components';
import { WaitlistScreen } from '@/ui/screens/public';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.waitlist');
  return { title: t('title'), description: t('description'), robots: { index: false, follow: true } };
}

/** Outside the service area, or (`?from=beta`) from an invite-only step during the private beta. */
export default function WaitlistPage({ searchParams }: PageProps<'/[locale]/waitlist'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Waitlist searchParams={searchParams} />
    </Suspense>
  );
}

async function Waitlist({ searchParams }: Pick<PageProps<'/[locale]/waitlist'>, 'searchParams'>) {
  const [{ from }, data] = await Promise.all([searchParams, getWaitlistPageData()]);
  return <WaitlistScreen data={{ ...data, ...(from === 'beta' ? { from: 'beta' as const } : {}) }} handlers={{ onJoin: joinWaitlistAction }} />;
}
