import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type MarketPageData } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { buttonVariants } from '@/ui/primitives/button';
import { CategoryGrid, Coverage, FeaturedHelpers, RecentTasks } from './marketing-sections';

export function MarketScreen({ data, now }: { data: MarketPageData; now: ISODateTime }) {
  const t = useTranslations('publicPages');
  return <div className="space-y-section">
    <PageHeader title={t('market.title', { market: data.market.name })} description={t('market.description')}><Link href={routes.app.newTask()} className={buttonVariants()}>{t('shared.postTask')}</Link></PageHeader>
    <CategoryGrid categories={data.categories} market={data.market} />
    <RecentTasks tasks={data.recentTasks} now={now} />
    <FeaturedHelpers helpers={data.featuredHelpers} />
    <Coverage market={data.market} />
  </div>;
}
