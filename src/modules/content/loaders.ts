import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { AppLocale, HelpArticleData, HelpArticleSummary, HelpCenterData, ISODateTime, LegalDoc, LegalDocData } from '@/contracts';
import { DEFAULT_LOCALE, LEGAL_DOCS } from '@/contracts';
import { parseBlocks, parseSections, splitFrontMatter } from './markdown';

/**
 * Help articles (content/help/*.md + topics.json) and legal documents (content/legal/<doc>.md).
 * Files are read synchronously, so pages built from them prerender at build time.
 * Translations: content/help/<locale>/<slug>.md and topics.json give the words (title, summary, body,
 * topic titles); the English files decide which articles exist, their topic, order and date. An
 * article not yet translated shows in English. Legal documents are English only (decisions.md).
 */

const CONTENT_DIR = path.join(process.cwd(), 'content');
const SLUG = /^[a-z0-9-]+$/;

interface HelpTopicFile {
  slug: string;
  title: string;
  description: string;
}

interface HelpArticleFile extends HelpArticleSummary {
  topic: string;
  order: number;
  updatedAt: ISODateTime;
  body: string;
}

/** "2026-11-11" → late morning in Austin that day, so it displays as Nov 11 in Central time. */
function dateToIso(value: string | undefined, file: string): ISODateTime {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${file}: "updated" must be YYYY-MM-DD`);
  return `${value}T17:00:00.000Z`;
}

function required(meta: Record<string, string>, key: string, file: string): string {
  const value = meta[key];
  if (!value) throw new Error(`${file}: missing "${key}" in front matter`);
  return value;
}

function translationDir(locale: AppLocale): string | null {
  return locale === DEFAULT_LOCALE ? null : path.join(CONTENT_DIR, 'help', locale);
}

function readTopics(locale: AppLocale = DEFAULT_LOCALE): HelpTopicFile[] {
  const english = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'help', 'topics.json'), 'utf8')) as HelpTopicFile[];
  const dir = translationDir(locale);
  const file = dir && path.join(dir, 'topics.json');
  if (!file || !fs.existsSync(file)) return english;
  const translated = JSON.parse(fs.readFileSync(file, 'utf8')) as HelpTopicFile[];
  return english.map((topic) => {
    const words = translated.find((candidate) => candidate.slug === topic.slug);
    return words ? { ...topic, title: words.title || topic.title, description: words.description || topic.description } : topic;
  });
}

function readHelpArticles(locale: AppLocale = DEFAULT_LOCALE): HelpArticleFile[] {
  const dir = path.join(CONTENT_DIR, 'help');
  const translated = translationDir(locale);
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const slug = file.slice(0, -3);
      if (!SLUG.test(slug)) throw new Error(`help/${file}: file names must be lowercase-with-dashes`);
      const { meta, body } = splitFrontMatter(fs.readFileSync(path.join(dir, file), 'utf8'));
      const article = {
        slug,
        title: required(meta, 'title', file),
        summary: required(meta, 'summary', file),
        topic: required(meta, 'topic', file),
        order: Number(meta.order ?? 99),
        updatedAt: dateToIso(meta.updated, file),
        body,
      };
      const words = translated && path.join(translated, file);
      if (!words || !fs.existsSync(words)) return article;
      const local = splitFrontMatter(fs.readFileSync(words, 'utf8'));
      const where = `help/${locale}/${file}`;
      return { ...article, title: required(local.meta, 'title', where), summary: required(local.meta, 'summary', where), body: local.body };
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

const summaryOf = ({ slug, title, summary }: HelpArticleSummary): HelpArticleSummary => ({ slug, title, summary });

export function getHelpCenterData(locale: AppLocale = DEFAULT_LOCALE): HelpCenterData {
  const articles = readHelpArticles(locale);
  return {
    topics: readTopics(locale)
      .map((topic) => ({
        ...topic,
        articles: articles.filter((article) => article.topic === topic.slug).map(summaryOf),
      }))
      .filter((topic) => topic.articles.length > 0),
  };
}

export function listHelpArticleSlugs(): string[] {
  return readHelpArticles().map((article) => article.slug);
}

export function getHelpArticle(slug: string, locale: AppLocale = DEFAULT_LOCALE): HelpArticleData | null {
  if (!SLUG.test(slug)) return null;
  const articles = readHelpArticles(locale);
  const article = articles.find((candidate) => candidate.slug === slug);
  if (!article) return null;
  const topic = readTopics(locale).find((candidate) => candidate.slug === article.topic);
  if (!topic) throw new Error(`help/${slug}.md: unknown topic "${article.topic}"`);
  const sameTopic = articles.filter((other) => other.topic === article.topic && other.slug !== slug);
  const others = articles.filter((other) => other.topic !== article.topic);
  return {
    ...summaryOf(article),
    topic: { slug: topic.slug, title: topic.title },
    updatedAt: article.updatedAt,
    blocks: parseBlocks(article.body),
    related: [...sameTopic, ...others].slice(0, 3).map(summaryOf),
  };
}

function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOCS as readonly string[]).includes(value);
}

function readLegalFile(doc: LegalDoc) {
  const file = `${doc}.md`;
  const { meta, body } = splitFrontMatter(fs.readFileSync(path.join(CONTENT_DIR, 'legal', file), 'utf8'));
  return { meta, body, file };
}

export function getLegalDoc(doc: string): LegalDocData | null {
  if (!isLegalDoc(doc)) return null;
  const { meta, body, file } = readLegalFile(doc);
  const status = required(meta, 'status', file);
  if (status !== 'draft' && status !== 'published') throw new Error(`legal/${file}: status must be draft or published`);
  // Text before the first "##" is a note for editors and isn't published.
  const { sections } = parseSections(body);
  if (sections.length === 0) throw new Error(`legal/${file}: needs at least one "##" section`);
  return {
    doc,
    title: required(meta, 'title', file),
    version: required(meta, 'version', file),
    status,
    updatedAt: dateToIso(meta.updated, file),
    ...(status === 'published' ? { effectiveAt: dateToIso(required(meta, 'effective', file), file) } : {}),
    summary: required(meta, 'summary', file),
    sections,
    otherDocs: LEGAL_DOCS.filter((other) => other !== doc).map((other) => ({
      doc: other,
      title: required(readLegalFile(other).meta, 'title', `${other}.md`),
    })),
  };
}
