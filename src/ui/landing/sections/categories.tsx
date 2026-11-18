import { useTranslations } from 'next-intl';
import { routes, type CategorySlug, type HomePageData } from '@/contracts';
import { Reveal } from '@/ui/motion';
import { CategoryCards } from '../category-cards';
import { ArrowLink, Heading } from './heading';

/** What people book: the five categories, each with its price guidance and what's open on the map now. */
export function CategoriesSection({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.categories');
  const openCounts: Partial<Record<CategorySlug, number>> = {};
  for (const pin of data.map.pins) openCounts[pin.categorySlug] = (openCounts[pin.categorySlug] ?? 0) + 1;
  return (
    <section aria-labelledby="categories-title" className="py-12 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-content px-gutter">
        <Heading id="categories-title" eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} body={t('body')} />
        <div className="mt-10"><CategoryCards categories={data.categories} openCounts={openCounts} /></div>
        <Reveal className="mt-8 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{t('unsure')}</span> {t('unsureBody')}</p>
          <ArrowLink href={routes.app.newTask()}>{t('unsureLink')}</ArrowLink>
        </Reveal>
      </div>
    </section>
  );
}
