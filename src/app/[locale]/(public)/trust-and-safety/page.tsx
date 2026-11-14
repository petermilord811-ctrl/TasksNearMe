import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TrustSafetyScreen } from '@/ui/screens/public';
import { publicPageMetadata } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.trustSafety');
  return publicPageMetadata({ path: routes.trustAndSafety(), title: t('title'), description: t('description') });
}

export default function TrustAndSafetyPage() {
  return <TrustSafetyScreen />;
}
