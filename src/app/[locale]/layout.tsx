import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import * as rootParams from 'next/root-params';
import Script from 'next/script';
import { APP_LOCALES, isAppLocale } from '@/contracts/locale';
import { AppToaster } from '@/ui/components/feedback/app-toaster';
import { MapTilesProvider } from '@/ui/components/map/map-tiles';
import { mapTiles } from '@/modules/markets/map-tiles';
import { fontVariables } from '@/ui/theme/fonts';
import { themeInitScript } from '@/ui/theme/theme-script';
import '@/ui/theme/globals.css';
// Page switches and pending links (plan 9.5).
import '@/ui/theme/transitions.css';
import { appUrl } from '@/integrations/oauth';
import { ClientMessages } from '@/i18n/client-messages';
import { SHARE_IMAGES } from '@/i18n/metadata';

export const metadata: Metadata = {
  // Canonical and language links (src/i18n/metadata.ts) are made absolute against the app's address.
  metadataBase: new URL(appUrl()),
  title: { default: 'TasksNearMe', template: '%s · TasksNearMe' },
  // The brand is national; city pages name their city.
  description: 'Book trusted local help for everyday tasks from verified people near you.',
  applicationName: 'TasksNearMe',
  // Large image previews and full snippets in search results. Whether a page may be indexed at all is the page's
  // own robots metadata and, for the whole site, the SEARCH_INDEXING switch (src/shared/search-indexing.ts).
  robots: { 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  // Link previews for pages without their own card (public pages set theirs with publicPageMetadata).
  openGraph: { type: 'website', siteName: 'TasksNearMe', images: [SHARE_IMAGES.en] },
  twitter: { card: 'summary_large_image', images: [SHARE_IMAGES.en] },
  // The web app manifest (src/app/manifest.ts) is linked automatically; iPhones read these instead.
  icons: {
    // Google Search takes ICO and PNG favicons, not SVG, and prefers them larger than 48 px: the 192 px PNG comes
    // first (after Next's favicon.ico), the SVG after it for browsers.
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/ui/brand/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, title: 'TasksNearMe', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // The phone's keyboard resizes the page (ab, 2026-11-21; journeys on a phone): sticky bars (Send offer, Save and
  // continue, a booking's actions) sit above it instead of under it, and the tab dock steps aside while a text field has
  // focus (MobileBottomNav). Android Chrome follows it; iOS Safari ignores it and still covers bottom bars (left so).
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBF7F2' },
    { media: '(prefers-color-scheme: dark)', color: '#0F0D0B' },
  ],
};

/** Every page prerenders once per language; src/proxy.ts picks which one a visitor gets. */
export function generateStaticParams() {
  return APP_LOCALES.map((locale) => ({ locale }));
}

/**
 * Only those languages exist: any other first segment is not found. Declaring it also tells the client router
 * that `locale` is a closed parameter, so it asks the server for a route instead of predicting it. Without it,
 * a visit to /es taught the router "/[locale] is the landing page" and it then read /how-it-works, /pricing and
 * /become-a-helper (rewritten by src/proxy.ts) as locales, prefetched segments that don't exist (404 in
 * production) and navigated slowly (completion plan 5.7).
 */
export const unstable_paramMatching = { locale: 'not-found' };

export default async function RootLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await rootParams.locale();
  if (!isAppLocale(locale)) notFound();
  return (
    // The theme script sets data-theme and data-motion before paint, so React sees different attributes.
    <html lang={locale} className={fontVariables} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        {/* In the initial HTML before any app code (Next places it in <head>): the saved theme, before paint. */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Only the root's own copy (the toaster): each layout and page below gives its client components theirs. */}
        <ClientMessages route="[locale]/layout.tsx">
          <MapTilesProvider tiles={{ ...mapTiles(), live: true }}>{children}</MapTilesProvider>
          <AppToaster />
        </ClientMessages>
      </body>
    </html>
  );
}
