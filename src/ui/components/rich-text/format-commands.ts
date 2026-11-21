/**
 * The editor's toolbar as text edits (src/shared/rich-text.ts's format): each command returns the range to replace,
 * the text to put there and the selection afterwards, so the editor can apply it as typing (the browser's undo keeps
 * working) and tests can check it without a browser.
 */
export type RichFormat = 'bold' | 'italic' | 'heading' | 'bullets' | 'numbers';

export interface TextEdit {
  /** Replace `value.slice(from, to)`… */
  from: number;
  to: number;
  /** …with this… */
  insert: string;
  /** …then select this range of the new value. */
  selectionStart: number;
  selectionEnd: number;
}

const INLINE_MARKER: Record<'bold' | 'italic', string> = { bold: '**', italic: '*' };
const HEADING_PREFIX = /^#{1,6}\s+/;
const BULLET_PREFIX = /^\s*[-*•]\s+/;
const NUMBER_PREFIX = /^\s*\d{1,4}[.)]\s+/;

/** How many `*` touch the selection on one side. */
function starsBefore(value: string, at: number): number {
  let count = 0;
  while (at - count - 1 >= 0 && value[at - count - 1] === '*') count += 1;
  return count;
}
function starsAfter(value: string, at: number): number {
  let count = 0;
  while (value[at + count] === '*') count += 1;
  return count;
}

/** A run of stars holds bold with 2 or 3 of them (3 is bold and italic), italic with 1 or 3. */
const holds = (stars: number, format: 'bold' | 'italic') => (format === 'bold' ? stars === 2 || stars === 3 : stars === 1 || stars === 3);

function inlineEdit(value: string, start: number, end: number, format: 'bold' | 'italic'): TextEdit {
  const marker = INLINE_MARKER[format];
  const size = marker.length;
  const selected = value.slice(start, end);

  // Already marked around the selection ("**|word|**"): take the marks off.
  const before = starsBefore(value, start);
  const after = starsAfter(value, end);
  if (selected && holds(before, format) && holds(after, format)) {
    return { from: start - size, to: end + size, insert: selected, selectionStart: start - size, selectionEnd: end - size };
  }
  // The selection includes its marks ("|**word**|").
  const inner = /^(\*+)([\s\S]*?)(\*+)$/.exec(selected);
  if (inner && inner[2] && holds(inner[1]!.length, format) && holds(inner[3]!.length, format)) {
    const unwrapped = selected.slice(size, selected.length - size);
    return { from: start, to: end, insert: unwrapped, selectionStart: start, selectionEnd: start + unwrapped.length };
  }
  if (!selected) {
    return { from: start, to: end, insert: `${marker}${marker}`, selectionStart: start + size, selectionEnd: start + size };
  }
  // Spaces at the selection's edges stay outside the marks ("**word** ", not "**word **", which wouldn't read).
  const lead = /^\s*/.exec(selected)![0].length;
  const trail = /\s*$/.exec(selected)![0].length;
  const core = selected.slice(lead, selected.length - trail);
  if (!core) return { from: start, to: end, insert: selected, selectionStart: start, selectionEnd: end };
  const insert = `${selected.slice(0, lead)}${marker}${core}${marker}${selected.slice(selected.length - trail)}`;
  return { from: start, to: end, insert, selectionStart: start + lead + size, selectionEnd: start + lead + size + core.length };
}

const LINE_PREFIX: Record<'heading' | 'bullets' | 'numbers', RegExp> = { heading: HEADING_PREFIX, bullets: BULLET_PREFIX, numbers: NUMBER_PREFIX };

function stripPrefix(line: string): string {
  return line.replace(HEADING_PREFIX, '').replace(BULLET_PREFIX, '').replace(NUMBER_PREFIX, '');
}

function lineEdit(value: string, start: number, end: number, format: 'heading' | 'bullets' | 'numbers'): TextEdit {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  // A selection that ends right after a line break doesn't take in the next line.
  const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const lineEnd = value.indexOf('\n', last);
  const to = lineEnd === -1 ? value.length : lineEnd;
  const lines = value.slice(from, to).split('\n');
  const filled = lines.filter((line) => line.trim());
  const already = filled.length > 0 && filled.every((line) => LINE_PREFIX[format].test(line));

  let number = 0;
  const next = lines.map((line) => {
    if (already) return line.replace(LINE_PREFIX[format], '');
    if (!line.trim() && lines.length > 1) return line;
    const words = stripPrefix(line);
    if (format === 'heading') return `## ${words}`;
    if (format === 'bullets') return `- ${words}`;
    number += 1;
    return `${number}. ${words}`;
  });
  const insert = next.join('\n');
  if (start === end && lines.length === 1) {
    const caret = from + insert.length;
    return { from, to, insert, selectionStart: caret, selectionEnd: caret };
  }
  return { from, to, insert, selectionStart: from, selectionEnd: from + insert.length };
}

export function formatEdit(value: string, start: number, end: number, format: RichFormat): TextEdit {
  const [low, high] = start <= end ? [start, end] : [end, start];
  return format === 'bold' || format === 'italic' ? inlineEdit(value, low, high, format) : lineEdit(value, low, high, format);
}

/**
 * Enter at the end of a list item starts the next one ("- " or the next number); Enter on an empty item ends the
 * list instead. Null: an ordinary line break.
 */
export function continueListOnEnter(value: string, start: number, end: number): TextEdit | null {
  if (start !== end) return null;
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', start);
  const line = value.slice(from, lineEnd === -1 ? value.length : lineEnd);
  // Only at the end of the line: Enter in the middle of an item splits it as usual.
  if (start !== from + line.length) return null;
  const bullet = /^(\s*)([-*•])\s+(.*)$/.exec(line);
  const numbered = /^(\s*)(\d{1,4})([.)])\s+(.*)$/.exec(line);
  if (!bullet && !numbered) return null;
  const words = bullet ? bullet[3]! : numbered![4]!;
  if (!words.trim()) {
    return { from, to: from + line.length, insert: '', selectionStart: from, selectionEnd: from };
  }
  const prefix = bullet ? `${bullet[1]}${bullet[2]} ` : `${numbered![1]}${Number(numbered![2]) + 1}${numbered![3]} `;
  const insert = `\n${prefix}`;
  return { from: start, to: start, insert, selectionStart: start + insert.length, selectionEnd: start + insert.length };
}
