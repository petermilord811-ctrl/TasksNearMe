import type { ReactNode } from 'react';

/** The words of a search worth marking (as the server matches them: 2 characters or more, at most 6). */
export function highlightWords(q: string | undefined): string[] {
  if (!q) return [];
  return [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((word) => word.length >= 2))].slice(0, 6);
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A search's words marked where they appear (plan 10.23), as the board marks them: case and accents as typed, the
 * rest of the text untouched. Without words, the text as it is.
 */
export function Highlight({ text, words }: { text: string; words: readonly string[] }): ReactNode {
  if (words.length === 0 || !text) return text;
  const pattern = new RegExp(`(${words.map(escape).join('|')})`, 'giu');
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (index % 2 === 1 ? <mark key={index} className="rounded-sm bg-sun/30 px-0.5 text-inherit dark:bg-sun/25">{part}</mark> : part));
}
