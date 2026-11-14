import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { CategorySlug, ISODateTime } from '@/contracts';
import { APP_LOCALES, localeOrDefault, type AppLocale } from '@/contracts/locale';
import { appUrl } from '@/integrations/oauth';
import { SITE_NAME, type StructuredDataContext } from '@/modules/seo/structured-data';
import { languageAlternatePaths, localizedPath } from '@/shared/locale';

const OPEN_GRAPH_LOCALES: Record<AppLocale, string> = { en: 'en_US', es: 'es_US' };

/** The link-preview cards, the brand and its tagline in each language (public/og, drawn by scripts/seo/share-image.mjs). */
export const SHARE_IMAGES: Record<AppLocale, { url: string; width: number; height: number; type: string }> = {
  en: { url: '/og/tasksnearme-en.png', width: 1200, height: 630, type: 'image/png' },
  es: { url: '/og/tasksnearme-es.png', width: 1200, height: 630, type: 'image/png' },
};

export interface PublicPageMeta {
  /** The page's English path; the page's language is applied. */
  path: string;
  /** As in Metadata: a string goes through the "%s · TasksNearMe" template, `absolute` doesn't. */
  title: string | { absolute: string };
  description: string;
  /** What the page is, for link previews: a helper's profile, a help article, or (by default) any other page. */
  kind?: { type: 'profile'; username: string } | { type: 'article'; modifiedTime: ISODateTime };
}

/**
 * Everything a public page tells search engines and link previews: title and description, the canonical address
 * (the page's own language: `/x` in English, `/es/x` in Spanish) and the other languages' (hreflang, the same
 * addresses the sitemap lists), and the Open Graph and X (Twitter) card. Add `robots` on top for pages kept out
 * of search (closed tasks, draft legal texts).
 */
export async function publicPageMetadata(page: PublicPageMeta): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale().then(localeOrDefault), getTranslations('server.meta.site')]);
  const canonical = localizedPath(page.path, locale);
  const shareTitle = typeof page.title === 'string' ? `${page.title} · ${SITE_NAME}` : page.title.absolute;
  const images = [{ ...SHARE_IMAGES[locale], alt: t('shareImageAlt') }];
  const kind =
    page.kind?.type === 'profile'
      ? { type: 'profile' as const, username: page.kind.username }
      : page.kind?.type === 'article'
        ? { type: 'article' as const, modifiedTime: page.kind.modifiedTime }
        : { type: 'website' as const };
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical, languages: languageAlternatePaths(page.path) },
    openGraph: {
      ...kind,
      siteName: SITE_NAME,
      title: shareTitle,
      description: page.description,
      url: canonical,
      locale: OPEN_GRAPH_LOCALES[locale],
      alternateLocale: APP_LOCALES.filter((other) => other !== locale).map((other) => OPEN_GRAPH_LOCALES[other]),
      images,
    },
    twitter: { card: 'summary_large_image', title: shareTitle, description: page.description, images },
  };
}

/** What structured data needs to know about the page: the site's address and the page's language. */
export async function structuredDataContext(): Promise<StructuredDataContext> {
  return { baseUrl: appUrl(), locale: localeOrDefault(await getLocale()) };
}

/** Category names in the page's language (the database holds the English ones). */
export async function categoryNames(): Promise<(slug: CategorySlug) => string> {
  const t = await getTranslations('server.meta.categoryNames');
  return (slug) => t(slug);
}
