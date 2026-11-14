import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HowItWorksScreen } from '@/ui/screens/public';
import { publicPageMetadata } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.howItWorks');
  return publicPageMetadata({ path: routes.howItWorks(), title: t('title'), description: t('description') });
}

export default function HowItWorksPage() {
  return <HowItWorksScreen />;
}
