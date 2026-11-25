import type { AppLocale } from '@/contracts';
import { asPromptText, oneLine } from './writer';

/**
 * A model's words as the app shows them (2026-11-24, the AI features in docs/automation/ai-plan-2026-11-24.md): plain
 * text, never markup, within a length, with contact details and street addresses masked like any prompt text
 * (`asPromptText`), so whatever a model wrote can't put a phone number, a link or an address on a page.
 */

/** The language a model writes in, named for it. */
export const WRITING_LANGUAGE: Record<AppLocale, string> = { en: 'US English', es: 'Spanish (Latin American, as spoken in the US)' };

/** Markdown and HTML a model may add anyway: emphasis, headings, links (their text kept), tags, code ticks. */
function unmark(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '');
}

/** "a." ends a sentence; the cut keeps whole sentences when one ends past the middle, else whole words. */
export function cutAt(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('.\n'));
  if (sentence > maxLength / 2) return cut.slice(0, sentence + 1).trim();
  const word = cut.lastIndexOf(' ');
  return (word > maxLength / 2 ? cut.slice(0, word) : cut).trim();
}

/** Plain paragraphs (a blank line between), each tidied and masked, at most `maxLength` in all. */
export function plainParagraphs(text: string, maxLength: number): string {
  const paragraphs = unmark(text)
    .split(/\n\s*\n/)
    .map((paragraph) => asPromptText(oneLine(paragraph)))
    .filter(Boolean);
  return cutAt(paragraphs.join('\n\n'), maxLength);
}

/** One line: tidied, masked, at most `maxLength`. */
export function plainLine(text: string, maxLength: number): string {
  return cutAt(asPromptText(oneLine(unmark(text))), maxLength);
}

/**
 * Short points or steps: one line each, bullets and numbers dropped, masked, without repeats or empty ones, at most
 * `max` of at most `length` characters. With `dropMasked`, a line that needed masking is left out (it carried a
 * contact detail, so it isn't worth showing).
 */
export function plainLines(lines: readonly string[], { max, length, dropMasked = false }: { max: number; length: number; dropMasked?: boolean }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const raw = oneLine(unmark(line)).replace(/^\s*(?:[-*•·]|\d+[.)]|\[\s?[xX ]?\s?\])\s*/, '');
    const text = cutAt(asPromptText(raw), length);
    if (!text || (dropMasked && text.includes('[hidden]')) || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length === max) break;
  }
  return out;
}
