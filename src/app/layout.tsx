import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { AppToaster } from '@/ui/components/feedback/app-toaster';
import { fontVariables } from '@/ui/theme/fonts';
import '@/ui/theme/globals.css';

export const metadata: Metadata = {
  title: { default: 'TasksNearMe', template: '%s · TasksNearMe' },
  description: 'Book trusted local help for everyday tasks in Austin.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAF7' },
    { media: '(prefers-color-scheme: dark)', color: '#121311' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <NextIntlClientProvider>
          {children}
          <AppToaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
