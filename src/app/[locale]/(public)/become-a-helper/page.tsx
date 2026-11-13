import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getBecomeHelperPageData } from '@/modules/marketing/queries';
import { BecomeHelperScreen } from '@/ui/screens/public';
import { languageAlternates } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.becomeHelper');
  return { title: t('title'), description: t('description'), alternates: await languageAlternates(routes.becomeAHelper()) };
}

export default async function BecomeAHelperPage() {
  return <BecomeHelperScreen data={await getBecomeHelperPageData()} />;
}
