import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { AppToaster } from '@/ui/components/feedback/app-toaster';
import { fontVariables } from '@/ui/theme/fonts';
import { themeInitScript } from '@/ui/theme/theme-script';
import '@/ui/theme/globals.css';

export const metadata: Metadata = {
  title: { default: 'TasksNearMe', template: '%s · TasksNearMe' },
  description: 'Book trusted local help for everyday tasks in Austin.',
  icons: { icon: [{ url: '/ui/brand/icon.svg', type: 'image/svg+xml' }], apple: '/ui/brand/icon.svg' },
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The theme script sets data-theme and data-motion before paint, so React sees different attributes.
    <html lang="en" className={fontVariables} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        {/* In the initial HTML before any app code (Next places it in <head>): the saved theme, before paint. */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <NextIntlClientProvider>
          {children}
          <AppToaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
