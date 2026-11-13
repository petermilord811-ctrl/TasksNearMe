'use client';

import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { APP_LOCALES, LOCALE_NAMES } from '@/contracts';
import { splitLocalePath } from '@/shared/locale';
import { cn } from '@/ui/lib/utils';

/**
 * "English · Español": this page in each language, each named in itself. /es/... and /en/... addresses make
 * the choice stick for this device (src/proxy.ts). Plain links, not <Link>: the whole app changes language.
 */
export function LanguageLinks({ label, className }: { label: string; className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const path = splitLocalePath(pathname)?.path ?? pathname;
  return <nav aria-label={label} className={className}>
    <ul className="flex flex-wrap items-center">
      {APP_LOCALES.map((option, index) => <li key={option} className="flex items-center">
        {index > 0 && <span aria-hidden="true" className="px-0.5">·</span>}
        <a
          href={`/${option}${path === '/' ? '' : path}`}
          hrefLang={option}
          lang={option}
          aria-current={option === locale ? 'true' : undefined}
          className={cn('inline-flex min-h-11 items-center rounded-md px-2 text-sm underline-offset-4 hover:underline', option === locale ? 'font-semibold text-foreground' : 'text-primary')}
        >{LOCALE_NAMES[option]}</a>
      </li>)}
    </ul>
  </nav>;
}
