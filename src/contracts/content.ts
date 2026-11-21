import type { CategorySlug, ISODateTime } from './common';
import type { LegalDoc } from './routes';

/**
 * Written content (help articles, legal documents) as typed blocks. The app authors and parses it;
 * the UI renders it with one component and never injects HTML.
 */

/**
 * A run of inline text. A link whose `href` starts with "/" is internal (next/link); anything else
 * is an external link.
 */
export type InlineNode = string | { text: string; href: string } | { text: string; strong: true };
export type RichText = InlineNode[];

export type ContentBlock =
  /** A subheading, one level below the heading that contains the blocks. */
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; content: RichText }
  | { type: 'list'; ordered: boolean; items: RichText[] }
  | { type: 'callout'; tone: 'info' | 'warning'; content: RichText };

export interface HelpArticleSummary {
  slug: string;
  title: string;
  summary: string;
}

export interface HelpTopicView {
  slug: string;
  title: string;
  description: string;
  articles: HelpArticleSummary[];
}

export interface HelpCenterData {
  topics: HelpTopicView[];
}

/**
 * What a guide leads to, from its front matter (`action: post_task`, with an optional `category:`, or
 * `action: become_helper`): the next step at its end, so a reader ready to act needn't look for it.
 */
export type HelpArticleAction = { kind: 'post_task'; category?: CategorySlug } | { kind: 'become_helper' };

export interface HelpArticleData {
  slug: string;
  title: string;
  summary: string;
  topic: { slug: string; title: string };
  updatedAt: ISODateTime;
  blocks: ContentBlock[];
  related: HelpArticleSummary[];
  action?: HelpArticleAction;
}

export interface LegalSection {
  /** Anchor id, unique within the document. */
  id: string;
  title: string;
  blocks: ContentBlock[];
}

export interface LegalDocData {
  doc: LegalDoc;
  title: string;
  /** e.g. "Draft 0.1" or "Version 1.0". */
  version: string;
  /** Drafts are shown with a "not in effect yet" banner. */
  status: 'draft' | 'published';
  updatedAt: ISODateTime;
  /** Published documents only. */
  effectiveAt?: ISODateTime;
  /** A plain-language summary shown above the sections. */
  summary: string;
  sections: LegalSection[];
  /** The other legal documents, for the "Other policies" list. */
  otherDocs: { doc: LegalDoc; title: string }[];
}
