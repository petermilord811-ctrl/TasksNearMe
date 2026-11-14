import type { CategorySlug, HelperProfilePageData, HelperServiceDetail, ISODateTime, MarketView, PriceGuidance } from '@/contracts';
import { APP_LOCALES, INTL_LOCALES, type AppLocale } from '@/contracts/locale';
import { localizedPath } from '@/shared/locale';
import { absoluteUrl } from './sitemap-entries';

/**
 * schema.org structured data (JSON-LD) for the public pages: the site's name and logo for search results, breadcrumbs,
 * and what a market, a category or a helper offers. Pure. Pages pass only what they already show, so the markup
 * never carries more than the page does (T-20, B-020): no addresses, no contact details, no last names, no photos.
 * TasksNearMe arranges the work but doesn't do it, so services name it as the `broker`, never the provider.
 */

export const SITE_NAME = 'TasksNearMe';
/** The square brand tile (the PWA icon): at least 112 px and crawlable, as Google wants a logo. */
const LOGO = { path: '/icons/icon-512.png', size: 512 };

export type JsonLdNode = { '@type': string } & Record<string, unknown>;

export interface StructuredDataContext {
  /** APP_URL, the address canonical links use. */
  baseUrl: string;
  /** The page's language; links point at pages in the same language. */
  locale: AppLocale;
}

export interface Crumb {
  name: string;
  /** The page's English path; the context's language is applied. */
  path: string;
}

function pageUrl(context: StructuredDataContext, path: string): string {
  return absoluteUrl(context.baseUrl, localizedPath(path, context.locale));
}

function homeUrl(context: StructuredDataContext): string {
  return absoluteUrl(context.baseUrl, '/');
}

/** A reference to the organization, complete enough to stand on a page without the full node. */
function organizationRef(context: StructuredDataContext) {
  return { '@type': 'Organization', '@id': `${homeUrl(context)}/#organization`, name: SITE_NAME, url: homeUrl(context) };
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** A market's city, by name and state code, without any address inside it. */
function cityNode(market: MarketView) {
  return {
    '@type': 'City',
    name: market.name,
    address: { '@type': 'PostalAddress', addressLocality: market.name, addressRegion: market.state, addressCountry: 'US' },
  };
}

const PRICE_UNITS = { hour: { unitCode: 'HUR', unitText: 'hour' }, item: { unitCode: 'C62', unitText: 'item' } } as const;

/** A category's typical price range, as the page shows it. */
function priceRange(guidance: PriceGuidance) {
  const range = { '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: dollars(guidance.lowCents), highPrice: dollars(guidance.highCents) };
  if (guidance.unit === 'task') return range;
  return {
    ...range,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      priceCurrency: 'USD',
      minPrice: dollars(guidance.lowCents),
      maxPrice: dollars(guidance.highCents),
      ...PRICE_UNITS[guidance.unit],
    },
  };
}

/** The organization, on the home page: its name and logo are what search results show beside the site. */
export function organizationNode(context: StructuredDataContext, description: string): JsonLdNode {
  return {
    ...organizationRef(context),
    // The name as people type it: the brand is the phrase "tasks near me".
    alternateName: 'Tasks Near Me',
    logo: { '@type': 'ImageObject', url: absoluteUrl(context.baseUrl, LOGO.path), width: LOGO.size, height: LOGO.size },
    description,
    // The brand is national; each city opens in turn (its market pages name it).
    areaServed: { '@type': 'Country', name: 'United States' },
  };
}

/** The site, on the home page: where search results take the site's name from. */
export function websiteNode(context: StructuredDataContext, description: string): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': `${homeUrl(context)}/#website`,
    name: SITE_NAME,
    alternateName: 'Tasks Near Me',
    url: homeUrl(context),
    description,
    inLanguage: APP_LOCALES.map((locale) => INTL_LOCALES[locale]),
    publisher: { '@id': `${homeUrl(context)}/#organization` },
  };
}

/** The trail from the home page to this one; the last crumb is the page itself. */
export function breadcrumbNode(context: StructuredDataContext, crumbs: readonly Crumb[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: pageUrl(context, crumb.path) })),
  };
}

/** A market's page: local help in the city, with its categories as the catalog. */
export function marketServiceNode(
  context: StructuredDataContext,
  input: { market: MarketView; name: string; description: string; path: string; categories: readonly Crumb[] },
): JsonLdNode {
  return {
    '@type': 'Service',
    name: input.name,
    description: input.description,
    url: pageUrl(context, input.path),
    broker: organizationRef(context),
    areaServed: cityNode(input.market),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: input.name,
      itemListElement: input.categories.map((category) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: category.name, url: pageUrl(context, category.path) },
      })),
    },
  };
}

/** A category's page in a market: the kind of help, where, and its typical prices. */
export function categoryServiceNode(
  context: StructuredDataContext,
  input: { market: MarketView; serviceType: string; name: string; description: string; path: string; priceGuidance: PriceGuidance },
): JsonLdNode {
  return {
    '@type': 'Service',
    name: input.name,
    serviceType: input.serviceType,
    description: input.description,
    url: pageUrl(context, input.path),
    broker: organizationRef(context),
    areaServed: cityNode(input.market),
    offers: priceRange(input.priceGuidance),
  };
}

function serviceOffer(service: HelperServiceDetail, name: string) {
  const price =
    service.pricingType === 'hourly' && service.hourlyRateCents !== undefined
      ? { '@type': 'UnitPriceSpecification', priceCurrency: 'USD', price: dollars(service.hourlyRateCents), ...PRICE_UNITS.hour }
      : service.fromPriceCents !== undefined
        ? { '@type': 'PriceSpecification', priceCurrency: 'USD', minPrice: dollars(service.fromPriceCents) }
        : null;
  return {
    '@type': 'Offer',
    itemOffered: { '@type': 'Service', name, ...(service.description ? { description: service.description } : {}) },
    ...(price ? { priceSpecification: price } : {}),
  };
}

/**
 * A helper's public profile: the name the page shows (first name and last initial), their headline, languages and
 * services with prices. No photo (uploads are kept out of crawlers' reach), no neighborhood, no reviews.
 */
export function helperProfileNode(
  context: StructuredDataContext,
  input: { data: HelperProfilePageData; path: string; categoryName: (slug: CategorySlug) => string },
): JsonLdNode {
  const { helper, services, languages } = input.data;
  return {
    '@type': 'ProfilePage',
    url: pageUrl(context, input.path),
    name: helper.displayName,
    inLanguage: INTL_LOCALES[context.locale],
    mainEntity: {
      '@type': 'Person',
      name: helper.displayName,
      ...(helper.headline ? { description: helper.headline } : {}),
      ...(languages.length > 0 ? { knowsLanguage: languages } : {}),
      knowsAbout: services.map((service) => input.categoryName(service.categorySlug)),
      makesOffer: services.map((service) => serviceOffer(service, input.categoryName(service.categorySlug))),
    },
  };
}

/** A help center article, with the date it was last updated. */
export function helpArticleNode(
  context: StructuredDataContext,
  input: { title: string; summary: string; path: string; updatedAt: ISODateTime },
): JsonLdNode {
  const url = pageUrl(context, input.path);
  return {
    '@type': 'Article',
    headline: input.title,
    description: input.summary,
    url,
    mainEntityOfPage: url,
    dateModified: input.updatedAt,
    inLanguage: INTL_LOCALES[context.locale],
    author: organizationRef(context),
    publisher: organizationRef(context),
  };
}
