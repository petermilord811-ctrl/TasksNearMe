/**
 * Runs before the first paint (the root layout inlines it in <head>):
 * - applies the visitor's saved theme (`data-theme` on <html>; none means "follow the system");
 * - marks the document so motion primitives know whether they may animate (`data-motion="ready"`).
 *   The landing page switches it to "on" after hydration; reduced motion keeps it "off".
 * - marks it `data-logo-settled` once the logo's first drawing is over (1.5 s), so a header mounted later in the
 *   same document (a switch to another layout) shows the logo already drawn instead of drawing it again (BrandMark).
 * Keep it tiny, dependency-free and wrapped in try/catch: storage can be blocked.
 */
export const THEME_STORAGE_KEY = 'tnm-theme';

export const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);}var r=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;d.setAttribute('data-motion',r?'off':'ready');setTimeout(function(){d.setAttribute('data-logo-settled','')},1500);}catch(e){}})();`;
