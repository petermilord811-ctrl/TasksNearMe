import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HowItWorksScreen } from '@/ui/screens/public';
import { languageAlternates } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.howItWorks');
  return { title: t('title'), description: t('description'), alternates: await languageAlternates(routes.howItWorks()) };
}

export default function HowItWorksPage() {
  return <HowItWorksScreen />;
}
