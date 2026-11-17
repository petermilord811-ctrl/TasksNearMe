import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CATEGORY_SLUGS, routes } from '@/contracts';
import { getCostGuideData, listCategorySlugs } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, listPublicMarketSlugs } from '@/modules/markets/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { KEEP_OUT_OF_SEARCH, marketPagesIndexable } from '@/modules/seo/indexable';
import { breadcrumbNode, SITE_NAME } from '@/modules/seo/structured-data';
import { formatMoney } from '@/shared/format';
import { CostGuideScreen } from '@/ui/screens/public/cost-guide-screen';
import { MarketTime } from '@/ui/lib/market-time';
import { categoryNames, publicPageMetadata, structuredDataContext } from '@/i18n/metadata';

/** Every enabled category in every public market, like the category pages. */
export async function generateStaticParams() {
  const marketSlugs = await listPublicMarketSlugs();
  const params = (
    await Promise.all(marketSlugs.map(async (market) => (await listCategorySlugs(market)).map((category) => ({ market, category }))))
  ).flat();
  return params.length > 0 ? params : [{ market: DEFAULT_MARKET_SLUG, category: CATEGORY_SLUGS[0] }];
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[market]/[category]/cost'>): Promise<Metadata> {
  const { market, category } = await params;
  const [data, faq, meta] = await Promise.all([getCostGuideData(market, category), getTranslations('server.seo.categoryFaq'), getTranslations('server.meta.costGuide')]);
  if (!data) return {};
  const { lowCents, highCents, unit } = data.category.priceGuidance;
  return {
    ...(await publicPageMetadata({
      path: routes.costGuide(data.category.slug, market),
      // The question people search is the title, the same words as the category page's question.
      title: faq(`cost.${data.category.slug}`, { market: data.market.name }),
      description: meta('description', { market: data.market.name, low: formatMoney(lowCents), high: formatMoney(highCents), unit }),
    })),
    ...(marketPagesIndexable(data.market, DEFAULT_MARKET_SLUG) ? {} : KEEP_OUT_OF_SEARCH),
  };
}

/** "How much does furniture assembly cost in Austin?": prices and fees from the published policy (docs/seo/PLAN.md S5). */
async function CostGuidePage({ params }: PageProps<'/[locale]/[market]/[category]/cost'>) {
  const { market, category } = await params;
  const data = await getCostGuideData(market, category);
  if (!data) notFound();
  const [context, faq, meta, hub, categoryName] = await Promise.all([
    structuredDataContext(),
    getTranslations('server.seo.categoryFaq'),
    getTranslations('server.meta'),
    getTranslations('server.seo.taskHub'),
    categoryNames(),
  ]);
  const { market: view, category: shown } = data;
  const question = faq(`cost.${shown.slug}`, { market: view.name });
  const path = routes.costGuide(shown.slug, view.slug);
  const related = [
    { label: meta('category.title', { category: categoryName(shown.slug), market: view.name }), href: routes.category(shown.slug, view.slug) },
    // What people pay for this service right now, on its job hub (S4).
    { label: hub(`title.${shown.slug}`, { market: view.name }), href: routes.taskBoard(view.slug, { category: shown.slug }) },
    { label: meta('pricing.title'), href: routes.pricing() },
  ];
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: view.name, path: routes.market(view.slug) },
            { name: categoryName(shown.slug), path: routes.category(shown.slug, view.slug) },
            { name: question, path },
          ]),
        ]}
      />
      <MarketTime timeZone={data.market.timeZone}><CostGuideScreen data={{ ...data, question, related }} /></MarketTime>
    </>
  );
}

export default withClientMessages('[locale]/(public)/[market]/[category]/cost/page.tsx', CostGuidePage);
