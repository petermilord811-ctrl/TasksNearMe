import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import type { ISODateTime, MarketPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { ContentBlocks } from '@/ui/components/content/content-blocks';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { buttonVariants } from '@/ui/primitives/button';
import { CategoryGrid, Coverage, MarketActivity } from './marketing-sections';

export function MarketScreen({ data, now }: { data: MarketPageData; now: ISODateTime }) {
  const t = useTranslations('publicPages');
  return <div className="space-y-section">
    <PageHeader title={t('market.title', { market: data.market.name })} description={t('market.description')}><Link href={routes.app.newTask()} className={buttonVariants()}>{t('shared.postTask')}</Link></PageHeader>
    <CategoryGrid categories={data.categories} market={data.market} />
    {data.about ? <Section title={t('market.aboutTitle', { market: data.market.name })}><div className="max-w-reading"><ContentBlocks blocks={data.about} headingLevel={3} /></div></Section> : null}
    <MarketActivity tasks={data.recentTasks} helpers={data.featuredHelpers} now={now} market={data.market} />
    <Coverage market={data.market} />
  </div>;
}
