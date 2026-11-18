import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { AppLocale, CategoryPageData, CategorySeoContent, FaqEntry, RelatedLink } from '@/contracts';
import { routes } from '@/contracts';
import { getHelpArticle, getLocalGuide } from '@/modules/content/loaders';
import { getCategorySupply } from '@/modules/marketing/queries';
import { formatMoneyShort } from '@/shared/format';

/**
 * Help articles whose question and short answer the category FAQ reuses, so the help center and the category pages
 * can never disagree.
 */
const SHARED_ANSWERS = ['when-am-i-charged', 'who-sees-my-address'] as const;

/**
 * What a category page adds for people arriving from search (docs/seo/PLAN.md S3), in the page's language:
 * - counts of real helpers and open tasks (sample data never counts);
 * - questions people ask, answered from the page's own data and the platform's rules: the cost (the same price
 *   guidance the page shows), how helpers are checked, remote work where allowed, when you're charged, who sees your
 *   address;
 * - the city guide for the service, when one is written in this language (content/local);
 * - links to the service's cost guide, the city's other services, the service's job hub and pricing.
 */
export async function categorySeoContent(
  data: CategoryPageData,
  locale: AppLocale,
): Promise<CategorySeoContent> {
  const { market, category } = data;
  const [t, meta, hub, supply] = await Promise.all([
    getTranslations('server.seo.categoryFaq'),
    getTranslations('server.meta'),
    getTranslations('server.seo.taskHub'),
    getCategorySupply(market.slug, category.slug),
  ]);
  const { lowCents, highCents, unit } = category.priceGuidance;
  const faq: FaqEntry[] = [
    {
      question: t(`cost.${category.slug}`, { market: market.name }),
      answer: t('cost.answer', { market: market.name, low: formatMoneyShort(lowCents), high: formatMoneyShort(highCents), unit }),
    },
    {
      question: t('checked.question'),
      answer: category.inHome && category.requiresBackgroundCheck ? t('checked.inHome') : t('checked.answer'),
    },
    ...(category.remoteAllowed ? [{ question: t('remote.question'), answer: t('remote.answer') }] : []),
    ...SHARED_ANSWERS.flatMap((slug) => {
      const article = getHelpArticle(slug, locale);
      return article ? [{ question: article.title, answer: article.summary }] : [];
    }),
  ];
  // Only what belongs to this page: the footer right below lists every service already (audit L21, 2026-11-18).
  const related: RelatedLink[] = [
    // The cost guide first: its title is the question people search.
    { label: t(`cost.${category.slug}`, { market: market.name }), href: routes.costGuide(category.slug, market.slug) },
    // The same work from the helper's side: this category's job hub (S4).
    { label: hub(`title.${category.slug}`, { market: market.name }), href: routes.taskBoard(market.slug, { category: category.slug }) },
    { label: meta('pricing.title'), href: routes.pricing() },
  ];
  const about = getLocalGuide(market.slug, category.slug, locale);
  return { helperCount: supply.helperCount, openTaskCount: supply.openTaskCount, ...(about ? { about } : {}), faq, related };
}
