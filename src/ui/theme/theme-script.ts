/**
 * Runs before the first paint (the root layout inlines it in <head>):
 * - applies the visitor's saved theme (`data-theme` on <html>; none means "follow the system");
 * - marks the document so motion primitives know whether they may animate (`data-motion="ready"`).
 * - applies "Use the system pointer" (`data-pointer="system"`; the Bubble cursor's CSS stays off then).
 *   The landing page switches it to "on" after hydration; reduced motion keeps it "off".
 * - marks it `data-logo-settled` once the logo's first drawing is over (1.5 s), so a header mounted later in the
 *   same document (a switch to another layout) shows the logo already drawn instead of drawing it again (BrandMark).
 * Keep it tiny, dependency-free and wrapped in try/catch: storage can be blocked.
 */
export const THEME_STORAGE_KEY = 'tnm-theme';
/** The same key as POINTER_STORAGE_KEY in src/ui/components/cursor/pointer-preference.ts. */
export const POINTER_STORAGE_KEY = 'tnm-pointer';

export const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);}if(localStorage.getItem('${POINTER_STORAGE_KEY}')==='system'){d.setAttribute('data-pointer','system');}var r=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;d.setAttribute('data-motion',r?'off':'ready');setTimeout(function(){d.setAttribute('data-logo-settled','')},1500);}catch(e){}})();`;

/**
 * Puts the script's marks back on <html> when React has made it again. The script runs once per document, but a
 * language switch refreshes the page in place with a new value of the root `[locale]` segment, and React then takes
 * over <html> anew, dropping every attribute it didn't render: the page fell back to the system's theme (and lost
 * reduced motion) until the next full load (owner, 2026-11-22: "when page switch, it's going to be default again").
 * Only fills in what's missing, so a theme or motion state set since then stands. `settled`: the logo has drawn
 * once in this document already (a later mount, not the first hydration, which the script's own timer covers).
 */
export function restoreDocumentMarks(
  root: HTMLElement,
  { savedTheme, reducedMotion, settled, savedPointer = null }: { savedTheme: string | null; reducedMotion: boolean; settled: boolean; savedPointer?: string | null },
): void {
  if (!root.hasAttribute('data-theme') && (savedTheme === 'light' || savedTheme === 'dark')) root.setAttribute('data-theme', savedTheme);
  if (!root.hasAttribute('data-pointer') && savedPointer === 'system') root.setAttribute('data-pointer', 'system');
  if (!root.hasAttribute('data-motion')) root.setAttribute('data-motion', reducedMotion ? 'off' : 'ready');
  if (settled && !root.hasAttribute('data-logo-settled')) root.setAttribute('data-logo-settled', '');
}
