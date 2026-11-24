/**
 * What the Bubble cursor's moving moments read from the page (2026-11-24): which part of the page the pointer is in,
 * and whether a click switches pages. Plain DOM functions, tested on their own. Which cursor an element shows is CSS
 * (cursor-rules.ts); the moments read it back from the computed style (cursor-art.ts, kindOfCursor).
 */

const LANDMARK = 'header, footer, nav, aside, main, [role="banner"], [role="contentinfo"], [role="navigation"], [role="complementary"], [role="main"], [role="dialog"], [role="alertdialog"], [data-cursor-section]';

/**
 * The part of the page the pointer is in: the outermost landmark around it (the site header, the side navigation,
 * the main content, a side panel, the footer), or the dialog it's in. A card's own header inside the main content
 * isn't a new part of the page.
 */
export function sectionOf(target: Element | null): Element | null {
  const dialog = target?.closest('[role="dialog"], [role="alertdialog"]');
  if (dialog) return dialog;
  let outermost: Element | null = null;
  for (let node = target?.closest(LANDMARK) ?? null; node; node = node.parentElement?.closest(LANDMARK) ?? null) outermost = node;
  return outermost;
}

/**
 * The address a click is about to switch this page to (path and query), or null when it isn't a page switch here: a
 * new tab or window, a download, another site, only a different #section, or the conversation links the chat window
 * opens in place.
 */
export function pageSwitchOf(event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'target'>, current: { origin: string; pathname: string; search: string }): string | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return null;
  let url: URL;
  try {
    url = new URL(anchor.getAttribute('href') ?? '', current.origin + current.pathname + current.search);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  const next = url.pathname + url.search;
  if (next === current.pathname + current.search) return null;
  if (/^\/(es\/)?app\/messages\/[^/]+$/.test(url.pathname)) return null;
  return next;
}
