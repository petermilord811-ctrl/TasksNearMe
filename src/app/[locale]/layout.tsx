import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import * as rootParams from 'next/root-params';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { APP_LOCALES, isAppLocale } from '@/contracts/locale';
import { AppToaster } from '@/ui/components/feedback/app-toaster';
import { MapTilesProvider } from '@/ui/components/map/map-tiles';
import { mapTiles } from '@/modules/markets/map-tiles';
import { fontVariables } from '@/ui/theme/fonts';
import { themeInitScript } from '@/ui/theme/theme-script';
import '@/ui/theme/globals.css';
import { appUrl } from '@/integrations/oauth';

export const metadata: Metadata = {
  // Canonical and language links (src/i18n/metadata.ts) are made absolute against the app's address.
  metadataBase: new URL(appUrl()),
  title: { default: 'TasksNearMe', template: '%s · TasksNearMe' },
  description: 'Book trusted local help for everyday tasks in Austin.',
  applicationName: 'TasksNearMe',
  // The web app manifest (src/app/manifest.ts) is linked automatically; iPhones read these instead.
  icons: {
    icon: [
      { url: '/ui/brand/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
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
        <NextIntlClientProvider>
          <MapTilesProvider tiles={{ ...mapTiles(), live: true }}>{children}</MapTilesProvider>
          <AppToaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
