import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HowItWorksScreen } from '@/ui/screens/public';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.howItWorks');
  return { title: t('title'), description: t('description') };
}

export default function HowItWorksPage() {
  return <HowItWorksScreen />;
}
