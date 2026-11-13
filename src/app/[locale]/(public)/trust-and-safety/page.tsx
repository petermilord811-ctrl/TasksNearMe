import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TrustSafetyScreen } from '@/ui/screens/public';
import { languageAlternates } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.trustSafety');
  return { title: t('title'), description: t('description'), alternates: await languageAlternates(routes.trustAndSafety()) };
}

export default function TrustAndSafetyPage() {
  return <TrustSafetyScreen />;
}
