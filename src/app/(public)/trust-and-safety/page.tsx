import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TrustSafetyScreen } from '@/ui/screens/public';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.trustSafety');
  return { title: t('title'), description: t('description') };
}

export default function TrustAndSafetyPage() {
  return <TrustSafetyScreen />;
}
