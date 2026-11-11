import type { ContentBlock, InlineNode, LegalSection, RichText } from '@/contracts';

/**
 * A small Markdown subset for help and legal content (content/**), parsed into the typed blocks
 * of src/contracts/content.ts. No HTML ever passes through: text stays text.
 *
 *   ---                         front matter: `key: value` lines
 *   ## Title {#anchor}          a section (legal) or a heading block (help)
 *   ### Subheading              a heading block inside a section
 *   - item / 1. item            lists
 *   > [!info] text              callouts (`info` or `warning`); continue with `> ` lines
 *   **bold** and [text](href)   inline
 */

export interface ParsedDocument {
  meta: Record<string, string>;
  body: string;
}

export function splitFrontMatter(source: string): ParsedDocument {
  const text = source.replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const index = line.indexOf(':');
    if (index > 0) meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return { meta, body: text.slice(match[0].length) };
}

/** `**bold**` and `[text](href)` → inline nodes. Everything else is plain text. */
export function parseInline(text: string): RichText {
  const nodes: InlineNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    if (match[1] !== undefined) nodes.push({ text: match[1], strong: true });
    else nodes.push({ text: match[2]!, href: match[3]! });
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const LIST_ITEM = /^(?:([-*])|(\d+)\.)\s+(.*)$/;
const CALLOUT = /^>\s*\[!(info|warning)\]\s*(.*)$/i;

/** Body Markdown → blocks. `##` and `###` both become heading blocks. */
export function parseBlocks(markdown: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (line === '') {
      flushParagraph();
      continue;
    }

    const heading = /^#{2,3}\s+(.*?)(?:\s*\{#[\w-]+\})?$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', text: heading[1]! });
      continue;
    }

    const callout = CALLOUT.exec(line);
    if (callout) {
      flushParagraph();
      const parts = [callout[2]!];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1]!.trim()) && !CALLOUT.test(lines[i + 1]!.trim())) {
        i += 1;
        parts.push(lines[i]!.trim().replace(/^>\s?/, ''));
      }
      const tone = callout[1]!.toLowerCase() as 'info' | 'warning';
      blocks.push({ type: 'callout', tone, content: parseInline(parts.filter(Boolean).join(' ')) });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      const ordered = item[2] !== undefined;
      const items: RichText[] = [parseInline(item[3]!)];
      while (i + 1 < lines.length) {
        const nextItem = LIST_ITEM.exec(lines[i + 1]!.trim());
        if (!nextItem || (nextItem[2] !== undefined) !== ordered) break;
        i += 1;
        items.push(parseInline(nextItem[3]!));
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Legal documents: each `## Title {#id}` starts a section; `###` inside becomes a heading block. */
export function parseSections(markdown: string): { intro: ContentBlock[]; sections: LegalSection[] } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const intro: string[] = [];
  const sections: { id: string; title: string; lines: string[] }[] = [];
  for (const line of lines) {
    const match = /^##\s+(.*?)(?:\s*\{#([\w-]+)\})?\s*$/.exec(line.trim());
    if (match && !line.trim().startsWith('###')) {
      sections.push({ id: match[2] ?? slugify(match[1]!), title: match[1]!, lines: [] });
    } else if (sections.length > 0) {
      sections[sections.length - 1]!.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  const ids = new Set<string>();
  for (const section of sections) {
    if (ids.has(section.id)) throw new Error(`Duplicate section id "${section.id}"`);
    ids.add(section.id);
  }
  return {
    intro: parseBlocks(intro.join('\n')),
    sections: sections.map((s) => ({ id: s.id, title: s.title, blocks: parseBlocks(s.lines.join('\n')) })),
  };
}
