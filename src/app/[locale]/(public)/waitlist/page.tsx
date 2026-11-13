import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { joinWaitlistAction } from '@/modules/marketing/actions';
import { getWaitlistPageData } from '@/modules/marketing/queries';
import { WaitlistScreen } from '@/ui/screens/public';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.waitlist');
  return { title: t('title'), description: t('description'), robots: { index: false, follow: true } };
}

export default async function WaitlistPage() {
  return <WaitlistScreen data={await getWaitlistPageData()} handlers={{ onJoin: joinWaitlistAction }} />;
}
