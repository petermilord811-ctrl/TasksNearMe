/**
 * Formatted task descriptions (owner, 2026-11-21: "make content as html style available, also AI can help write
 * this html post style"). The poster, or the AI writing for them, formats a description with a small Markdown
 * subset. It's stored as text and drawn as React elements (src/ui/components/rich-text): no HTML ever passes
 * through, so a description can't carry markup, scripts or links.
 *
 *   ## Heading                  a heading (any number of #)
 *   - item  or  * item          a bulleted list
 *   1. item  or  1) item        a numbered list
 *   **bold**  *italic*          inline marks (also __bold__, _italic_ and ***both***)
 *   a blank line                a new paragraph; a single line break stays a line break
 *
 * Everything else is plain text, so every description written before keeps reading as it did, and a formatted one
 * still reads well as plain text (`richTextToPlain`: alerts, emails, search results, the page's meta description).
 */

export interface RichInline {
  text: string;
  bold?: true;
  italic?: true;
}
/** One line of text with its marks. */
export type RichLine = RichInline[];

export type RichBlock =
  | { type: 'heading'; content: RichLine }
  /** Lines of one paragraph: each one after the first starts on a new line. */
  | { type: 'paragraph'; lines: RichLine[] }
  /** `start`: the first number of a numbered list, when it isn't 1. */
  | { type: 'list'; ordered: boolean; start?: number; items: RichLine[] };

const HEADING = /^#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,4})[.)]\s+(.*)$/;

type ListMatch = { ordered: boolean; number: number; text: string };

function listItem(line: string): ListMatch | null {
  const bullet = BULLET.exec(line);
  if (bullet) return { ordered: false, number: 0, text: bullet[1]! };
  const numbered = NUMBERED.exec(line);
  if (numbered) return { ordered: true, number: Number(numbered[1]), text: numbered[2]! };
  return null;
}

const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

/** Inline marks, from the longest marker down. Lookbehinds would be simpler, but older Safari can't parse them. */
const MARKERS = ['***', '___', '**', '__', '*', '_'] as const;

/** `text` with its marks: bold and italic, nested as written ("**very *nice* work**"). */
export function parseRichInline(text: string, marks: { bold?: true; italic?: true } = {}): RichLine {
  const out: RichLine = [];
  const push = (value: string, extra: { bold?: true; italic?: true } = {}) => {
    if (!value) return;
    const bold = marks.bold ?? extra.bold;
    const italic = marks.italic ?? extra.italic;
    const last = out[out.length - 1];
    if (last && last.bold === bold && last.italic === italic) {
      last.text += value;
      return;
    }
    out.push({ text: value, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}) });
  };

  let plain = '';
  let index = 0;
  outer: while (index < text.length) {
    const char = text[index]!;
    if (char === '*' || char === '_') {
      for (const marker of MARKERS) {
        if (!text.startsWith(marker, index)) continue;
        // An underscore inside a word (snake_case) or a star between words (2*3*4) is just a character.
        if (marker[0] === '_' && isWord(text[index - 1])) break;
        if (marker.length === 1 && marker === '*' && isWord(text[index - 1]) && isWord(text[index + 1])) break;
        const open = index + marker.length;
        // Only a whole run counts ("** text**" stays as typed), and the marked words can't start with a space.
        if (text[open] === marker[0] || isSpace(text[open])) continue;
        // The nearest closing marker that ends on a non-space and isn't the start of a longer run.
        let close = text.indexOf(marker, open + 1);
        while (close !== -1) {
          const before = text[close - 1];
          const after = text[close + marker.length];
          const longerRun = after === marker[0];
          const closesWord = marker[0] === '_' ? !isWord(after) : true;
          if (!isSpace(before) && !longerRun && closesWord && !text.slice(open, close).includes('\n')) break;
          close = text.indexOf(marker, close + 1);
        }
        if (close === -1) continue;
        const inner = text.slice(open, close);
        if (plain) {
          push(plain);
          plain = '';
        }
        const kind = marker.length === 3 ? { bold: true as const, italic: true as const } : marker.length === 2 ? { bold: true as const } : { italic: true as const };
        for (const node of parseRichInline(inner, { ...marks, ...kind })) push(node.text, { ...(node.bold ? { bold: true } : {}), ...(node.italic ? { italic: true } : {}) });
        index = close + marker.length;
        continue outer;
      }
    }
    plain += char;
    index += 1;
  }
  push(plain);
  return out;
}

/** A description's text → blocks. Old plain descriptions come back as paragraphs with their line breaks. */
export function parseRichText(source: string): RichBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: RichBlock[] = [];
  let paragraph: RichLine[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading && heading[1]) {
      flush();
      blocks.push({ type: 'heading', content: parseRichInline(heading[1]) });
      continue;
    }

    const item = listItem(raw);
    if (item) {
      flush();
      const items: RichLine[] = [];
      let text = item.text.trim();
      const start = item.number;
      let next = i + 1;
      for (;;) {
        // An indented line that isn't an item carries on the item above ("- Bring a ladder\n  if you have one").
        while (next < lines.length && /^\s+\S/.test(lines[next]!) && !listItem(lines[next]!) && !HEADING.test(lines[next]!.trim())) {
          text += ` ${lines[next]!.trim()}`;
          next += 1;
        }
        // A bullet with nothing after it yet (the toolbar's new item) draws nothing.
        if (text) items.push(parseRichInline(text));
        // The same kind of list carries on, also across blank lines between its items.
        let peek = next;
        while (peek < lines.length && !lines[peek]!.trim()) peek += 1;
        const following = peek < lines.length ? listItem(lines[peek]!) : null;
        if (!following || following.ordered !== item.ordered) break;
        text = following.text.trim();
        next = peek + 1;
      }
      if (items.length) blocks.push({ type: 'list', ordered: item.ordered, ...(item.ordered && start !== 1 ? { start } : {}), items });
      i = next - 1;
      continue;
    }

    paragraph.push(parseRichInline(line));
  }
  flush();
  return blocks;
}

const lineText = (line: RichLine) => line.map((node) => node.text).join('');

/**
 * The words without the formatting, for places that show plain text: headings and paragraphs on their own lines,
 * list items as "• item" or "1. item", blank lines between blocks.
 */
export function richTextToPlain(source: string): string {
  return parseRichText(source)
    .map((block) => {
      if (block.type === 'heading') return lineText(block.content);
      if (block.type === 'paragraph') return block.lines.map(lineText).join('\n');
      return block.items.map((item, index) => `${block.ordered ? `${(block.start ?? 1) + index}.` : '•'} ${lineText(item)}`).join('\n');
    })
    .join('\n\n');
}

/** The plain words on one line, for a summary or a meta description: `max` characters at most, cut at a word. */
export function richTextSummary(source: string, max = 160): string {
  const flat = richTextToPlain(source).replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

/**
 * A model's answer in this format, whatever it sent (an AI may answer in HTML or fuller Markdown): HTML tags become
 * their Markdown or go, links keep only their words, code fences and images go, `*` bullets become `-`, headings
 * become `##`, and runs of blank lines shrink to one.
 */
export function tidyRichText(source: string): string {
  let text = source.replace(/\r\n?/g, '\n');
  // HTML a model may have used anyway.
  text = text
    .replace(/<\s*(script|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/?\s*(ul|ol)\b[^>]*>/gi, '\n\n')
    .replace(/<\s*\/?\s*(p|div|section|article)\b[^>]*>/gi, '\n\n')
    .replace(/<\s*h[1-6]\b[^>]*>([\s\S]*?)<\s*\/\s*h[1-6]\s*>/gi, (_match, inner: string) => `\n\n## ${inner.trim()}\n\n`)
    .replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_match, _tag, inner: string) => `**${inner.trim()}**`)
    .replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_match, _tag, inner: string) => `*${inner.trim()}*`)
    .replace(/<\s*li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  text = text
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const lines = text.split('\n').map((line) => {
    const trimmed = line.replace(/\s+$/, '');
    const heading = HEADING.exec(trimmed.trim());
    if (heading) return heading[1] ? `## ${heading[1]}` : '';
    const bullet = /^\s*[*•]\s+(.*)$/.exec(trimmed);
    if (bullet) return `- ${bullet[1]}`;
    return trimmed;
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
