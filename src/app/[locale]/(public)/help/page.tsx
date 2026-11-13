import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/contracts';
import { getHelpCenterData } from '@/modules/content/loaders';
import { HelpCenterScreen } from '@/ui/screens/content';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.help');
  return { title: t('title'), description: t('description') };
}

export default async function HelpCenterPage() {
  return <HelpCenterScreen data={getHelpCenterData(localeOrDefault(await getLocale()))} />;
}
