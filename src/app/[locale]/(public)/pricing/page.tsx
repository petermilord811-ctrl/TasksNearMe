import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getPricingPageData } from '@/modules/marketing/queries';
import { PricingScreen } from '@/ui/screens/public';
import { publicPageMetadata } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.pricing');
  return publicPageMetadata({ path: routes.pricing(), title: t('title'), description: t('description') });
}

/** Every number comes from the fee engine and the default market's published policy. */
export default async function PricingPage() {
  return <PricingScreen data={await getPricingPageData()} />;
}
