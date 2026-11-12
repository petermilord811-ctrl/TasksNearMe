/**
 * Runs before the first paint (the root layout inlines it in <head>):
 * - applies the visitor's saved theme (`data-theme` on <html>; none means "follow the system");
 * - marks the document so motion primitives know whether they may animate (`data-motion="ready"`).
 *   The landing page switches it to "on" after hydration; reduced motion keeps it "off".
 * Keep it tiny, dependency-free and wrapped in try/catch: storage can be blocked.
 */
export const THEME_STORAGE_KEY = 'tnm-theme';

export const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);}var r=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;d.setAttribute('data-motion',r?'off':'ready');}catch(e){}})();`;
