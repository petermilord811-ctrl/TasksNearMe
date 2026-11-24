/**
 * What the Bubble cursor makes of the element under it (2026-11-24). Plain DOM functions, no React, so they're tested
 * on their own. The CSS in bubble-cursor.css hides the system pointer except over TEXT_ZONE and NATIVE_ZONE, where the
 * bubble steps aside instead: keep the two lists in step.
 */

/** Text you type into: the system's text cursor places the caret better. */
export const TEXT_ZONE =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"]):not([type="image"]), textarea, [contenteditable=""], [contenteditable="true"]';

/** Things you drag or resize (maps, the photo crop, the minimap's frame) and anything marked native: the system pointer. */
export const NATIVE_ZONE =
  '.maplibregl-map, [data-cursor="native"], [class*="cursor-grab"], [class*="cursor-move"], [class*="cursor-crosshair"], [class*="-resize"], [class*="cursor-zoom"], [class*="cursor-text"]';

/** Things you press. */
export const PRESSABLE =
  'a[href], button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], label, select, summary, input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"], input[type="reset"], input[type="file"]';

/** What the bubble says over a link: it opens over the page, it opens in a new tab, or it isn't available yet. */
export type CursorHint = 'sheet' | 'tab' | 'off';
export type CursorZone = 'bubble' | 'text' | 'native';

export function zoneOf(target: Element | null): CursorZone {
  if (!target) return 'bubble';
  if (target.closest(TEXT_ZONE)) return 'text';
  if (target.closest(NATIVE_ZONE)) return 'native';
  return 'bubble';
}

/** Over something you can press: `press`, or `off` when it's disabled; and what it would say, if anything. */
export function pressStateOf(target: Element | null): { hover: 'press' | 'off' | null; hint: CursorHint | null } {
  const pressable = target?.closest(PRESSABLE) ?? null;
  if (!pressable) return { hover: null, hint: null };
  const control = pressable.closest('[aria-disabled="true"]') ?? (pressable.matches(':disabled') ? pressable : null);
  if (control) return { hover: 'off', hint: 'off' };
  const marked = pressable.closest('[data-cursor]')?.getAttribute('data-cursor');
  if (marked === 'sheet' || marked === 'tab' || marked === 'off') return { hover: 'press', hint: marked };
  if (pressable.matches('a[target="_blank"]')) return { hover: 'press', hint: 'tab' };
  if (pressable.matches('[aria-haspopup="dialog"]')) return { hover: 'press', hint: 'sheet' };
  return { hover: 'press', hint: null };
}

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
