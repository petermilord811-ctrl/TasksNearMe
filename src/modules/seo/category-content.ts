import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { AppLocale, CategoryPageData, CategorySeoContent, CategorySlug, FaqEntry, RelatedLink } from '@/contracts';
import { routes } from '@/contracts';
import { getHelpArticle, getLocalGuide } from '@/modules/content/loaders';
import { getCategorySupply, listCategorySlugs } from '@/modules/marketing/queries';
import { formatMoney } from '@/shared/format';
import { costGuidePath } from './paths';

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
 * - links to the city's other services, its open tasks and pricing.
 */
export async function categorySeoContent(
  data: CategoryPageData,
  locale: AppLocale,
  categoryName: (slug: CategorySlug) => string,
): Promise<CategorySeoContent> {
  const { market, category } = data;
  const [t, meta, supply, slugs] = await Promise.all([
    getTranslations('server.seo.categoryFaq'),
    getTranslations('server.meta'),
    getCategorySupply(market.slug, category.slug),
    listCategorySlugs(market.slug),
  ]);
  const { lowCents, highCents, unit } = category.priceGuidance;
  const faq: FaqEntry[] = [
    {
      question: t(`cost.${category.slug}`, { market: market.name }),
      answer: t('cost.answer', { market: market.name, low: formatMoney(lowCents), high: formatMoney(highCents), unit }),
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
  const related: RelatedLink[] = [
    // The cost guide first: its title is the question people search.
    { label: t(`cost.${category.slug}`, { market: market.name }), href: costGuidePath(category.slug, market.slug) },
    ...slugs
      .filter((slug) => slug !== category.slug)
      .map((slug) => ({ label: categoryName(slug as CategorySlug), href: routes.category(slug as CategorySlug, market.slug) })),
    { label: meta('taskBoard.title', { market: market.name }), href: routes.taskBoard(market.slug) },
    { label: meta('pricing.title'), href: routes.pricing() },
  ];
  const about = getLocalGuide(market.slug, category.slug, locale);
  return { helperCount: supply.helperCount, openTaskCount: supply.openTaskCount, ...(about ? { about } : {}), faq, related };
}
