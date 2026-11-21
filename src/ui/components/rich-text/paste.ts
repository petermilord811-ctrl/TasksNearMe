import { tidyRichText } from '@/shared/rich-text';

/**
 * Formatted text pasted from a page, a doc or an email (the clipboard's HTML) → the editor's format: headings, lists,
 * bold and italic stay, everything else becomes plain words. The HTML is only read (DOMParser makes an inert
 * document: nothing in it runs or loads), never inserted.
 */
export function htmlToRichText(html: string): string {
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];

  const weight = (element: HTMLElement) => {
    const value = element.style.fontWeight;
    return value === 'bold' || value === 'bolder' || Number(value) >= 600;
  };
  // Google Docs wraps a whole paste in <b style="font-weight:normal">: that isn't bold.
  const isBold = (element: HTMLElement) => (['B', 'STRONG'].includes(element.tagName) && !/^(normal|[1-5]00)$/.test(element.style.fontWeight)) || weight(element);
  const isItalic = (element: HTMLElement) => ['I', 'EM'].includes(element.tagName) || element.style.fontStyle === 'italic';

  function inline(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ');
    if (!(node instanceof HTMLElement)) return '';
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'HEAD'].includes(node.tagName)) return '';
    if (node.tagName === 'BR') return '\n';
    const words = [...node.childNodes].map(inline).join('');
    const core = words.trim();
    if (!core) return words;
    const lead = words.slice(0, words.indexOf(core[0]!));
    const trail = words.slice(words.lastIndexOf(core[core.length - 1]!) + 1);
    if (isBold(node) && isItalic(node)) return `${lead}***${core}***${trail}`;
    if (isBold(node)) return `${lead}**${core}**${trail}`;
    if (isItalic(node)) return `${lead}*${core}*${trail}`;
    return words;
  }

  function block(node: Node, list?: { ordered: boolean; count: number }) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = inline(node);
      if (text.trim()) out.push(text.trim());
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'HEAD'].includes(tag)) return;
    if (/^H[1-6]$/.test(tag)) {
      const text = inline(node).trim();
      if (text) out.push('', `## ${text.replace(/^\*+|\*+$/g, '')}`, '');
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      const nested = { ordered: tag === 'OL', count: 0 };
      out.push('');
      for (const child of node.childNodes) block(child, nested);
      out.push('');
      return;
    }
    if (tag === 'LI') {
      const own = [...node.childNodes].filter((child) => !(child instanceof HTMLElement && (child.tagName === 'UL' || child.tagName === 'OL')));
      const text = own.map(inline).join('').replace(/\s*\n\s*/g, ' ').trim();
      if (list) list.count += 1;
      if (text) out.push(`${list?.ordered ? `${list.count}.` : '-'} ${text}`);
      for (const child of node.childNodes) if (child instanceof HTMLElement && (child.tagName === 'UL' || child.tagName === 'OL')) block(child);
      return;
    }
    const isBlock = ['P', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'TABLE', 'TR', 'BODY', 'MAIN', 'HEADER', 'FOOTER'].includes(tag);
    const hasBlocks = [...node.children].some((child) => /^(P|DIV|SECTION|ARTICLE|UL|OL|H[1-6]|TABLE|TR|BLOCKQUOTE)$/.test(child.tagName));
    if (isBlock && hasBlocks) {
      // Words between blocks stay one paragraph ("text <b>bold</b>" isn't split across lines).
      let run = '';
      const flushRun = () => {
        const text = run.split('\n').map((line) => line.trim()).join('\n').trim();
        if (text) out.push('', text, '');
        run = '';
      };
      for (const child of node.childNodes) {
        if (child instanceof HTMLElement && /^(P|DIV|SECTION|ARTICLE|UL|OL|LI|H[1-6]|TABLE|TR|BLOCKQUOTE)$/.test(child.tagName)) {
          flushRun();
          block(child, list);
        } else run += inline(child);
      }
      flushRun();
      return;
    }
    const text = inline(node).split('\n').map((line) => line.trim()).join('\n').trim();
    if (text) out.push(...(isBlock ? ['', text, ''] : [text]));
  }

  block(doc.body);
  return tidyRichText(out.join('\n'));
}

/** Clipboard HTML worth converting: it has formatting the editor keeps (a plain-text paste stays a plain paste). */
export function hasRichFormatting(html: string): boolean {
  return /<(b|strong|em|i|h[1-6]|li)\b/i.test(html);
}
