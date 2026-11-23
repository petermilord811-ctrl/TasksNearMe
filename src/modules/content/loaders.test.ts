import { describe, expect, it } from 'vitest';
import type { ContentBlock, InlineNode } from '@/contracts';
import { CATEGORY_SLUGS, LEGAL_DOCS } from '@/contracts';
import fs from 'node:fs';
import { getCityGuide, getHelpArticle, getHelpCenterData, getLegalDoc, getLocalGuide, listHelpArticleDates, listHelpArticleSlugs, listPublishedLegalDocs } from './loaders';

/** Checks the real files in content/: every article and document parses, and links resolve. */

function hrefs(blocks: ContentBlock[]): string[] {
  const fromNodes = (nodes: InlineNode[]) => nodes.flatMap((node) => (typeof node === 'object' && 'href' in node ? [node.href] : []));
  return blocks.flatMap((block) => {
    switch (block.type) {
      case 'paragraph':
      case 'callout':
        return fromNodes(block.content);
      case 'list':
        return block.items.flatMap(fromNodes);
      default:
        return [];
    }
  });
}

const slugs = listHelpArticleSlugs();
const STATIC_PAGES = ['/', '/pricing', '/how-it-works', '/trust-and-safety', '/become-a-helper', '/help', '/waitlist', '/cities'];

function isKnownInternalLink(href: string): boolean {
  const pathname = href.split(/[?#]/)[0]!;
  if (STATIC_PAGES.includes(pathname)) return true;
  const legal = /^\/legal\/([a-z-]+)$/.exec(pathname);
  if (legal) return (LEGAL_DOCS as readonly string[]).includes(legal[1]!);
  const help = /^\/help\/([a-z0-9-]+)$/.exec(pathname);
  if (help) return slugs.includes(help[1]!);
  // Only an open city's pages: Gainesville, the first city (Austin's answer 404 while it's paused).
  if (pathname === '/gainesville' || pathname === '/gainesville/tasks') return true;
  const category = /^\/gainesville\/(?:tasks\/)?([a-z-]+)(?:\/cost)?$/.exec(pathname);
  if (category) return (CATEGORY_SLUGS as readonly string[]).includes(category[1]!);
  return false;
}

describe('help content', () => {
  it('groups every article under a topic', () => {
    const data = getHelpCenterData();
    const listed = data.topics.flatMap((topic) => topic.articles.map((article) => article.slug));
    expect(listed.sort()).toEqual([...slugs].sort());
    expect(data.topics.length).toBeGreaterThanOrEqual(3);
  });

  it.each(slugs)('%s parses, has related articles, and links resolve', (slug) => {
    const article = getHelpArticle(slug)!;
    expect(article.blocks.length).toBeGreaterThan(1);
    expect(article.related.length).toBeGreaterThan(0);
    expect(article.related.map((r) => r.slug)).not.toContain(slug);
    for (const href of hrefs(article.blocks)) {
      if (href.startsWith('/')) expect(isKnownInternalLink(href), href).toBe(true);
      else expect(href).toMatch(/^https:\/\//);
    }
  });

  it("ends the guides that lead somewhere with their next step, in every language (J-V)", () => {
    expect(getHelpArticle('post-your-first-task')?.action).toEqual({ kind: 'post_task' });
    expect(getHelpArticle('moving-out-in-gainesville')?.action).toEqual({ kind: 'post_task', category: 'moving-help' });
    expect(getHelpArticle('earn-with-tasks-near-you')?.action).toEqual({ kind: 'become_helper' });
    expect(getHelpArticle('cancel-a-booking')?.action).toBeUndefined();
    expect(getHelpArticle('moving-out-in-gainesville', 'es')?.action).toEqual({ kind: 'post_task', category: 'moving-help' });
  });

  it('refuses unknown or unsafe slugs', () => {
    expect(getHelpArticle('nope')).toBeNull();
    expect(getHelpArticle('../legal/terms')).toBeNull();
  });
});

describe('help content in Spanish', () => {
  it('has every article and topic, in Spanish, with the same structure as English', () => {
    const english = getHelpCenterData();
    const spanish = getHelpCenterData('es');
    expect(spanish.topics.map((topic) => topic.slug)).toEqual(english.topics.map((topic) => topic.slug));
    for (const [index, topic] of spanish.topics.entries()) {
      expect(topic.title).not.toBe(english.topics[index]!.title);
      expect(topic.articles.map((article) => article.slug).sort()).toEqual(english.topics[index]!.articles.map((article) => article.slug).sort());
    }
  });

  it.each(slugs)('%s is translated, and its links resolve', (slug) => {
    const english = getHelpArticle(slug)!;
    const article = getHelpArticle(slug, 'es')!;
    expect(article.title).not.toBe(english.title);
    expect(article.summary).not.toBe(english.summary);
    expect(article.topic.slug).toBe(english.topic.slug);
    expect(article.updatedAt).toBe(english.updatedAt);
    expect(article.blocks.map((block) => block.type)).toEqual(english.blocks.map((block) => block.type));
    expect(hrefs(article.blocks)).toEqual(hrefs(english.blocks));
  });
});

describe('legal content', () => {
  it.each([...LEGAL_DOCS])('%s is a draft with sections and resolvable links', (doc) => {
    const data = getLegalDoc(doc)!;
    expect(data.status).toBe('draft');
    expect(data.version).toBe('Draft 0.1');
    expect(data.sections.length).toBeGreaterThan(2);
    expect(data.otherDocs).toHaveLength(LEGAL_DOCS.length - 1);
    for (const href of data.sections.flatMap((section) => hrefs(section.blocks))) {
      if (href.startsWith('/')) expect(isKnownInternalLink(href), href).toBe(true);
    }
  });

  it('the cancellation policy agrees with the fee engine example (the $60 desk held for $63, 2026-11-23)', () => {
    const text = JSON.stringify(getLegalDoc('cancellation-policy'));
    expect(text).toContain('$63.00');
    expect(text).toContain('$51.00');
    expect(text).toContain('$12.00');
  });

  it('refuses unknown documents', () => {
    expect(getLegalDoc('cookies')).toBeNull();
  });
});

describe('city guides (content/local)', () => {
  const words = (blocks: ContentBlock[]) =>
    JSON.stringify(blocks).replace(/"(type|content|items|text|href|ordered|tone|strong)":/g, ' ').split(/\s+/).filter((word) => /\p{L}/u.test(word)).length;
  // Every city with guides: Austin, and Gainesville, the first city (owner, 2026-11-17).
  const cities = fs.readdirSync('content/local').filter((dir) => dir !== 'es' && fs.statSync(`content/local/${dir}`).isDirectory());
  const guidesOf = (city: string) => fs.readdirSync(`content/local/${city}`).filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3));
  const guides = cities.flatMap((city) => guidesOf(city).map((slug) => [city, slug] as const));

  it.each(['austin', 'gainesville'])('covers every category in %s', (city) => {
    expect(cities).toContain(city);
    expect([...guidesOf(city)].sort()).toEqual([...CATEGORY_SLUGS].sort());
  });

  it.each(guides)('%s/%s exists in English and Spanish, with substance, and links only to https or this site', (city, slug) => {
    for (const locale of ['en', 'es'] as const) {
      const blocks = getLocalGuide(city, slug, locale);
      expect(blocks, `${locale} ${slug}`).not.toBeNull();
      expect(words(blocks!), `${locale} ${slug}`).toBeGreaterThan(150);
      for (const href of hrefs(blocks!)) expect(href.startsWith('https://') || isKnownInternalLink(href), href).toBe(true);
    }
  });

  it('has nothing for a city or language without a guide, and refuses unsafe slugs', () => {
    expect(getLocalGuide('chicago', 'furniture-assembly')).toBeNull();
    expect(getLocalGuide('austin', '../legal/terms')).toBeNull();
    expect(getLocalGuide('../content', 'furniture-assembly')).toBeNull();
  });
});

describe("a city's own guide (content/cities)", () => {
  const words = (blocks: ContentBlock[]) =>
    JSON.stringify(blocks).replace(/"(type|content|items|text|href|ordered|tone|strong)":/g, ' ').split(/\s+/).filter((word) => /\p{L}/u.test(word)).length;
  const cities = fs.readdirSync('content/cities').filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3));

  it('exists for Gainesville, the first city', () => {
    expect(cities).toContain('gainesville');
  });

  it.each(cities)('%s exists in English and Spanish, with substance, the same links, and links only to https or this site', (city) => {
    const english = getCityGuide(city, 'en')!;
    const spanish = getCityGuide(city, 'es')!;
    for (const [locale, blocks] of [['en', english], ['es', spanish]] as const) {
      expect(blocks, locale).not.toBeNull();
      expect(words(blocks), locale).toBeGreaterThan(250);
      for (const href of hrefs(blocks)) expect(href.startsWith('https://') || isKnownInternalLink(href), href).toBe(true);
    }
    expect(spanish.map((block) => block.type)).toEqual(english.map((block) => block.type));
    expect(hrefs(spanish)).toEqual(hrefs(english));
  });

  it('has nothing for a city without one, and refuses unsafe slugs', () => {
    expect(getCityGuide('chicago')).toBeNull();
    expect(getCityGuide('../legal/terms')).toBeNull();
  });
});

describe('sitemap content', () => {
  it('lists every help article with the date its page shows', () => {
    const dated = listHelpArticleDates();
    expect(dated.map((article) => article.slug)).toEqual(listHelpArticleSlugs());
    for (const { slug, updatedAt } of dated) expect(updatedAt).toBe(getHelpArticle(slug)!.updatedAt);
  });

  it('lists exactly the legal documents in effect (none while they are drafts)', () => {
    const published = LEGAL_DOCS.filter((doc) => getLegalDoc(doc)!.status === 'published');
    expect(listPublishedLegalDocs()).toEqual(published.map((doc) => ({ doc, updatedAt: getLegalDoc(doc)!.updatedAt })));
  });
});
