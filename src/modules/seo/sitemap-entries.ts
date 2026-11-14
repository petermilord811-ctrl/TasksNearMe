import type { MetadataRoute } from 'next';
import type { CategorySlug, ISODateTime, LegalDoc } from '@/contracts';
import { routes } from '@/contracts';
import { APP_LOCALES } from '@/contracts/locale';
import { languageAlternatePaths, localizedPath, type Hreflang } from '@/shared/locale';

/**
 * What /sitemap.xml lists (blueprint 02 §1.1, backlog B-023): every indexable public page, once per language, each
 * entry naming all of the page's languages (hreflang), so search engines find the Spanish pages as well. Nothing
 * signed-in, staff-only or noindex: no /app, /admin, /dev, sign-in, waitlist, codes, closed or hidden tasks, or
 * draft legal texts. Pure, so it is tested without a database; src/modules/seo/sitemap.ts loads the data.
 *
 * `lastModified` is set only where the content has a real date (Google uses lastmod only while it proves accurate).
 * changefreq and priority are left out: Google ignores both.
 */

/** Google reads at most 50,000 URLs from one sitemap file. */
export const MAX_SITEMAP_URLS = 50_000;

export interface SitemapData {
  /** The market the home page shows. */
  homeMarketSlug: string;
  markets: {
    slug: string;
    /** Its enabled categories, in display order. */
    categorySlugs: CategorySlug[];
    /** Its open tasks (what the board lists), newest first. */
    tasks: { slug: string; categorySlug: string; updatedAt: ISODateTime }[];
  }[];
  /** Helpers whose public profile shows. */
  helpers: { handle: string; updatedAt: ISODateTime }[];
  helpArticles: { slug: string; updatedAt: ISODateTime }[];
  /** Published legal documents only (drafts are noindex). */
  legalDocs: { doc: LegalDoc; updatedAt: ISODateTime }[];
}

export interface SitemapPage {
  /** The page's path in English; each other language adds its prefix (src/shared/locale.ts). */
  path: string;
  /** When the page's content last changed, when that is known. */
  lastModified?: ISODateTime;
}

/** The latest of some dates, or undefined when there are none. */
export function latestDate(dates: Iterable<ISODateTime | undefined>): ISODateTime | undefined {
  let latest: ISODateTime | undefined;
  for (const date of dates) {
    if (date && (latest === undefined || Date.parse(date) > Date.parse(latest))) latest = date;
  }
  return latest;
}

/**
 * The pages, in the order the file lists them: the site's own pages, each market with its board and categories,
 * then, with `listings` (the `on` mode), helper profiles and tasks (newest first), so that a sitemap over the
 * URL limit drops the oldest tasks first. A market's pages (and the home page) change when its tasks do, so they
 * carry its newest task's date either way.
 */
export function sitemapPages(data: SitemapData, options: { listings: boolean }): SitemapPage[] {
  const newestTask = new Map(data.markets.map((market) => [market.slug, latestDate(market.tasks.map((task) => task.updatedAt))]));
  const pages: SitemapPage[] = [
    { path: routes.home(), lastModified: newestTask.get(data.homeMarketSlug) },
    { path: routes.howItWorks() },
    { path: routes.pricing() },
    { path: routes.becomeAHelper() },
    { path: routes.trustAndSafety() },
    { path: routes.help(), lastModified: latestDate(data.helpArticles.map((article) => article.updatedAt)) },
    ...data.helpArticles.map((article) => ({ path: routes.help(article.slug), lastModified: article.updatedAt })),
    ...data.legalDocs.map((legal) => ({ path: routes.legal(legal.doc), lastModified: legal.updatedAt })),
  ];
  for (const market of data.markets) {
    const lastModified = newestTask.get(market.slug);
    pages.push({ path: routes.market(market.slug), lastModified }, { path: routes.taskBoard(market.slug), lastModified });
    for (const category of market.categorySlugs) {
      const inCategory = market.tasks.filter((task) => task.categorySlug === category).map((task) => task.updatedAt);
      pages.push({ path: routes.category(category, market.slug), lastModified: latestDate(inCategory) });
    }
  }
  if (!options.listings) return pages;
  pages.push(...data.helpers.map((helper) => ({ path: routes.helperProfile(helper.handle), lastModified: helper.updatedAt })));
  for (const market of data.markets) {
    pages.push(...market.tasks.map((task) => ({ path: routes.publicTask(task.slug), lastModified: task.updatedAt })));
  }
  return pages;
}

/** An absolute address. The home page is the bare origin, exactly as its canonical link reads ("https://tasksnearme.com"). */
export function absoluteUrl(baseUrl: string, path: string): string {
  const origin = baseUrl.replace(/\/+$/, '');
  return path === '/' ? origin : `${origin}${path}`;
}

/** One entry per page and language; every entry names all of the page's languages, itself included (Google's rule). */
export function sitemapEntries(baseUrl: string, pages: readonly SitemapPage[]): MetadataRoute.Sitemap {
  const entries = pages.flatMap((page) => {
    const languages = Object.fromEntries(
      Object.entries(languageAlternatePaths(page.path)).map(([hreflang, path]) => [hreflang, absoluteUrl(baseUrl, path)]),
    ) as Record<Hreflang, string>;
    return APP_LOCALES.map((locale) => ({
      url: absoluteUrl(baseUrl, localizedPath(page.path, locale)),
      ...(page.lastModified ? { lastModified: page.lastModified } : {}),
      alternates: { languages },
    }));
  });
  return entries.slice(0, MAX_SITEMAP_URLS);
}
