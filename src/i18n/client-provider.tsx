'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { intlOnError } from './errors';

/**
 * The browser's message provider. It's a client component so it can take an error handler (a function can't
 * come from the server): in the e2e build a missing or broken message throws here too (src/i18n/errors.ts).
 */
export function IntlClientProvider({ locale, timeZone, messages, children }: { locale: string; timeZone: string; messages: AbstractIntlMessages; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={messages} onError={intlOnError}>
      {children}
    </NextIntlClientProvider>
  );
}
