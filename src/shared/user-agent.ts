/**
 * A browser and its system named from a user agent string, for staff screens ("Safari on iPhone"). Only common
 * ones are named; anything else is left unnamed rather than guessed. Order matters: Edge, Opera and Samsung
 * Internet also say "Chrome", Chrome says "Safari", an iPhone says "like Mac OS X" and Android says "Linux".
 */
export interface BrowserSummary {
  browser?: string;
  os?: string;
}

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:OPR|OPT|Opera)\//, 'Opera'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\bHeadlessChrome\//, 'Headless Chrome'],
  [/\b(?:CriOS|Chrome)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMacintosh\b|\bMac OS X\b/, 'Mac'],
  [/\bLinux\b/, 'Linux'],
];

export function summarizeUserAgent(userAgent: string | null | undefined): BrowserSummary {
  const agent = (userAgent ?? '').slice(0, 512);
  const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1];
  const os = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1];
  return { ...(browser ? { browser } : {}), ...(os ? { os } : {}) };
}
