import { describe, expect, it } from 'vitest';
import { austinMarket, categoryViews } from '@/fixtures/marketing';
import { jordanProfilePageData } from '@/fixtures/profiles';
import { servicePhoto } from '@/shared/service-photos';
import {
  breadcrumbNode,
  categoryServiceNode,
  helpArticleNode,
  helperProfileNode,
  marketServiceNode,
  organizationNode,
  servicePhotoNode,
  SITE_NAME,
  type StructuredDataContext,
  websiteNode,
} from './structured-data';

const en: StructuredDataContext = { baseUrl: 'https://tasksnearme.com', locale: 'en' };
const es: StructuredDataContext = { baseUrl: 'https://tasksnearme.com', locale: 'es' };
const names: Record<string, string> = { 'furniture-assembly': 'Furniture assembly', 'moving-help': 'Moving help', 'yard-cleanup': 'Yard cleanup' };

describe('the site', () => {
  it('names the organization with its logo, serving the whole country', () => {
    expect(organizationNode(en, 'Local help.')).toEqual({
      '@type': 'Organization',
      '@id': 'https://tasksnearme.com/#organization',
      name: SITE_NAME,
      url: 'https://tasksnearme.com',
      alternateName: 'Tasks Near Me',
      logo: { '@type': 'ImageObject', url: 'https://tasksnearme.com/icons/icon-512.png', width: 512, height: 512 },
      description: 'Local help.',
      areaServed: { '@type': 'Country', name: 'United States' },
    });
  });

  it('names the website in both languages, published by the organization', () => {
    expect(websiteNode(es, 'Ayuda local.')).toMatchObject({
      '@type': 'WebSite',
      '@id': 'https://tasksnearme.com/#website',
      name: 'TasksNearMe',
      alternateName: ['Tasks Near Me', 'tasksnearme.com'],
      url: 'https://tasksnearme.com',
      inLanguage: ['en-US', 'es-US'],
      publisher: { '@id': 'https://tasksnearme.com/#organization' },
    });
  });
});

describe('breadcrumbNode', () => {
  it('numbers the trail from 1 and links each step in the page language', () => {
    const crumbs = [
      { name: SITE_NAME, path: '/' },
      { name: 'Austin', path: '/austin' },
      { name: 'Armado de muebles', path: '/austin/furniture-assembly' },
    ];
    expect(breadcrumbNode(es, crumbs)).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'TasksNearMe', item: 'https://tasksnearme.com/es' },
        { '@type': 'ListItem', position: 2, name: 'Austin', item: 'https://tasksnearme.com/es/austin' },
        { '@type': 'ListItem', position: 3, name: 'Armado de muebles', item: 'https://tasksnearme.com/es/austin/furniture-assembly' },
      ],
    });
    expect(breadcrumbNode(en, crumbs).itemListElement).toMatchObject([{ item: 'https://tasksnearme.com' }, { item: 'https://tasksnearme.com/austin' }, {}]);
  });
});

describe('services', () => {
  it('a category: TasksNearMe brokers it, in the city (no street address), at its typical prices per item', () => {
    const node = categoryServiceNode(en, {
      market: austinMarket,
      serviceType: 'Furniture assembly',
      name: 'Furniture assembly in Austin',
      description: 'Typical prices and verified local helpers.',
      path: '/austin/furniture-assembly',
      priceGuidance: categoryViews[0]!.priceGuidance,
    });
    expect(node).toMatchObject({
      '@type': 'Service',
      serviceType: 'Furniture assembly',
      url: 'https://tasksnearme.com/austin/furniture-assembly',
      broker: { '@type': 'Organization', '@id': 'https://tasksnearme.com/#organization' },
      areaServed: {
        '@type': 'City',
        name: 'Austin',
        address: { '@type': 'PostalAddress', addressLocality: 'Austin', addressRegion: 'TX', addressCountry: 'US' },
      },
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: '50.00',
        highPrice: '80.00',
        priceSpecification: { '@type': 'UnitPriceSpecification', minPrice: '50.00', maxPrice: '80.00', unitCode: 'C62', unitText: 'item' },
      },
    });
    expect(node).not.toHaveProperty('provider');
    expect(JSON.stringify(node)).not.toMatch(/streetAddress|postalCode|telephone|email/);
  });

  it('an hourly category prices per hour, and a whole-task one has no unit', () => {
    const base = { market: austinMarket, serviceType: 'Moving help', name: 'Moving help in Austin', description: '', path: '/austin/moving-help' };
    expect(categoryServiceNode(en, { ...base, priceGuidance: { lowCents: 3500, highCents: 6000, unit: 'hour' } }).offers).toMatchObject({
      priceSpecification: { unitCode: 'HUR', unitText: 'hour' },
    });
    expect(categoryServiceNode(en, { ...base, priceGuidance: { lowCents: 6000, highCents: 12000, unit: 'task' } }).offers).toEqual({
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: '60.00',
      highPrice: '120.00',
    });
  });

  it('a market lists its categories as a catalog, linked in the page language', () => {
    const node = marketServiceNode(es, {
      market: austinMarket,
      name: 'Ayuda local en Austin',
      description: 'Ayudantes verificados.',
      path: '/austin',
      categories: [{ name: 'Armado de muebles', path: '/austin/furniture-assembly' }],
    });
    expect(node).toMatchObject({
      url: 'https://tasksnearme.com/es/austin',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        itemListElement: [{ '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Armado de muebles', url: 'https://tasksnearme.com/es/austin/furniture-assembly' } }],
      },
    });
  });
});

describe('helperProfileNode', () => {
  const node = helperProfileNode(en, { data: jordanProfilePageData, path: '/helpers/jordan-t', categoryName: (slug) => names[slug]! });
  const person = node.mainEntity as Record<string, unknown>;

  it('is the profile page of a person named as the page names them, with their services and prices', () => {
    expect(node).toMatchObject({ '@type': 'ProfilePage', url: 'https://tasksnearme.com/helpers/jordan-t', name: 'Jordan T.' });
    expect(person).toMatchObject({
      '@type': 'Person',
      name: 'Jordan T.',
      description: 'Careful assembly and moving help in East Austin',
      knowsLanguage: ['English'],
      knowsAbout: ['Furniture assembly', 'Moving help', 'Yard cleanup'],
    });
    expect(person.makesOffer).toEqual([
      {
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: 'Furniture assembly' },
        priceSpecification: { '@type': 'PriceSpecification', priceCurrency: 'USD', minPrice: '45.00' },
      },
      {
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: 'Moving help' },
        priceSpecification: { '@type': 'UnitPriceSpecification', priceCurrency: 'USD', price: '35.00', unitCode: 'HUR', unitText: 'hour' },
      },
      {
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: 'Yard cleanup' },
        priceSpecification: { '@type': 'UnitPriceSpecification', priceCurrency: 'USD', price: '30.00', unitCode: 'HUR', unitText: 'hour' },
      },
    ]);
  });

  it('carries no last name, photo, location, contact details or account id (B-020)', () => {
    for (const field of ['familyName', 'image', 'address', 'homeLocation', 'workLocation', 'telephone', 'email', 'sameAs']) {
      expect(person, field).not.toHaveProperty(field);
    }
    expect(JSON.stringify(node)).not.toContain(jordanProfilePageData.helper.id);
  });
});

describe('helpArticleNode', () => {
  it('is an article by the organization, dated, in the page language', () => {
    expect(
      helpArticleNode(es, { title: '¿Quién ve mi dirección?', summary: 'Solo tu ayudante.', path: '/help/who-sees-my-address', updatedAt: '2026-11-12T17:00:00.000Z' }),
    ).toMatchObject({
      '@type': 'Article',
      headline: '¿Quién ve mi dirección?',
      url: 'https://tasksnearme.com/es/help/who-sees-my-address',
      mainEntityOfPage: 'https://tasksnearme.com/es/help/who-sees-my-address',
      dateModified: '2026-11-12T17:00:00.000Z',
      inLanguage: 'es-US',
      author: { '@type': 'Organization', name: 'TasksNearMe' },
    });
  });
});

describe('servicePhotoNode', () => {
  it("describes a licensed service photo as its source licenses it, in the page's language (plan 9.12)", () => {
    const photo = servicePhoto('moving-help');
    const node = servicePhotoNode(es, photo, 'wide');
    expect(node).toMatchObject({
      '@type': 'ImageObject',
      description: photo.alt.es,
      creditText: `${photo.credit.photographer} / ${photo.credit.source}`,
      creator: { '@type': 'Person', name: photo.credit.photographer, url: photo.credit.profileUrl },
      license: photo.credit.licenseUrl,
      acquireLicensePage: photo.credit.sourceUrl,
    });
    expect(node.contentUrl).toMatch(new RegExp(`^https://tasksnearme\\.com/ui/services/${photo.name}-wide-\\d+\\.webp$`));
    // Never TasksNearMe as the creator or the licensor.
    expect(JSON.stringify(node)).not.toContain('TasksNearMe');
  });
});
