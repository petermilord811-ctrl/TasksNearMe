import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { HelpArticleData, HelpArticleSummary, HelpCenterData, ISODateTime, LegalDoc, LegalDocData } from '@/contracts';
import { LEGAL_DOCS } from '@/contracts';
import { parseBlocks, parseSections, splitFrontMatter } from './markdown';

/**
 * Help articles (content/help/*.md + topics.json) and legal documents (content/legal/<doc>.md).
 * Files are read synchronously, so pages built from them prerender at build time.
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

function readTopics(): HelpTopicFile[] {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'help', 'topics.json'), 'utf8')) as HelpTopicFile[];
}

function readHelpArticles(): HelpArticleFile[] {
  const dir = path.join(CONTENT_DIR, 'help');
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const slug = file.slice(0, -3);
      if (!SLUG.test(slug)) throw new Error(`help/${file}: file names must be lowercase-with-dashes`);
      const { meta, body } = splitFrontMatter(fs.readFileSync(path.join(dir, file), 'utf8'));
      return {
        slug,
        title: required(meta, 'title', file),
        summary: required(meta, 'summary', file),
        topic: required(meta, 'topic', file),
        order: Number(meta.order ?? 99),
        updatedAt: dateToIso(meta.updated, file),
        body,
      };
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

const summaryOf = ({ slug, title, summary }: HelpArticleSummary): HelpArticleSummary => ({ slug, title, summary });

export function getHelpCenterData(): HelpCenterData {
  const articles = readHelpArticles();
  return {
    topics: readTopics()
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

export function getHelpArticle(slug: string): HelpArticleData | null {
  if (!SLUG.test(slug)) return null;
  const articles = readHelpArticles();
  const article = articles.find((candidate) => candidate.slug === slug);
  if (!article) return null;
  const topic = readTopics().find((candidate) => candidate.slug === article.topic);
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
