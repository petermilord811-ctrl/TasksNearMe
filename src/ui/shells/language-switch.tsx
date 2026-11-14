'use client';

import { useEffect, useState, useTransition, type MouseEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
// Values from their own modules, not the contracts barrel: it would bring every zod schema onto every page.
import { APP_LOCALES, DEFAULT_LOCALE, LOCALE_NAMES, isAppLocale, type AppLocale } from '@/contracts/locale';
import type { LanguageSwitchHandler } from '@/contracts';
import { splitLocalePath } from '@/shared/locale';
import { cn } from '@/ui/lib/utils';

/** Set on <html> while a switch is on its way: the page softens until it comes back in the new language. */
const SWITCHING = 'data-language-switch';

/** Short codes for the pill; each option is also named in itself for screen readers ("ES, Español"). */
const CODES: Record<AppLocale, string> = { en: 'EN', es: 'ES' };

export interface LanguageSwitchProps {
  /** The switch's group name ("Language"). */
  label: string;
  onSwitch?: LanguageSwitchHandler;
  /** `pill`: the top bars' EN/ES switch with a sliding knob. `inline`: "English · Español" in the footer. */
  variant?: 'pill' | 'inline';
  className?: string;
}

/**
 * Switching the page's language in place, for any control (the bars' switch, the footer's links, the account
 * menu): the choice is saved for this device (and a signed-in account), then the page is refreshed where it is.
 * An /es/… address is replaced by the plain one meanwhile, since the device's choice now carries the language.
 * Without a handler (previews), or if saving fails, it goes by the explicit /es/… or /en/… address instead.
 */
export function useLanguageSwitch(onSwitch: LanguageSwitchHandler | undefined) {
  const current = useLocale();
  const locale: AppLocale = isAppLocale(current) ? current : DEFAULT_LOCALE;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<AppLocale | null>(null);
  const path = splitLocalePath(pathname)?.path ?? pathname;
  // /es/… and /en/… both make the choice stick for this device (src/proxy.ts); /en/… then lands on the plain URL.
  const hrefFor = (option: AppLocale) => `/${option}${path === '/' ? '' : path}`;

  // The page is back (this control mounts again in the new language, or the switch finished): lift the veil.
  useEffect(() => {
    if (!pending) document.documentElement.removeAttribute(SWITCHING);
  }, [pending, locale]);

  const switchTo = (next: AppLocale) => {
    if (next === locale || pending) return;
    const search = window.location.search;
    if (!onSwitch) {
      router.push(`${hrefFor(next)}${search}`, { scroll: false });
      return;
    }
    setTarget(next);
    const root = document.documentElement;
    root.setAttribute(SWITCHING, '');
    // Never leave the page veiled if something goes wrong on the way.
    window.setTimeout(() => root.removeAttribute(SWITCHING), 10_000);
    startTransition(async () => {
      const result = await onSwitch({ locale: next }).catch(() => null);
      // Not saved (offline, or refused): go by the explicit address instead, which makes the choice stick too.
      if (!result?.ok) {
        router.replace(`${hrefFor(next)}${search}`, { scroll: false });
        return;
      }
      if (splitLocalePath(pathname)) router.replace(`${path}${search}`, { scroll: false });
      else router.refresh();
    });
  };

  return { locale, shown: pending && target ? target : locale, pending, hrefFor, switchTo };
}

/**
 * Changes the page's language in place: no reload, the scroll position and the page stay where they are, and the
 * text comes back in the new language. Each option is a real link to this page in that language (/es/…, /en/…),
 * so search engines, new tabs and pages without the handler (previews) still get there by loading it.
 */
export function LanguageSwitch({ label, onSwitch, variant = 'pill', className }: LanguageSwitchProps) {
  const { shown, pending, hrefFor, switchTo } = useLanguageSwitch(onSwitch);

  const choose = (event: MouseEvent<HTMLAnchorElement>, next: AppLocale) => {
    // A new tab or window, or no handler: let the link load the page in that language.
    if (!onSwitch || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    switchTo(next);
  };

  if (variant === 'inline') {
    return (
      <nav aria-label={label} className={className}>
        <ul className="flex flex-wrap items-center">
          {APP_LOCALES.map((option, index) => (
            <li key={option} className="flex items-center">
              {index > 0 && <span aria-hidden="true" className="px-0.5">·</span>}
              <a
                href={hrefFor(option)}
                hrefLang={option}
                lang={option}
                aria-current={option === shown ? 'true' : undefined}
                onClick={(event) => choose(event, option)}
                className={cn('inline-flex min-h-11 items-center rounded-md px-2 text-sm underline-offset-4 hover:underline', option === shown ? 'font-semibold text-foreground' : 'text-primary')}
              >
                {LOCALE_NAMES[option]}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label={label} className={cn('shrink-0', className)}>
      <ul className="relative isolate flex h-9 items-center rounded-full bg-foreground/[0.06] p-1" aria-busy={pending || undefined}>
        {/* The knob slides to the chosen language the moment it's picked, before the page comes back. */}
        <li
          aria-hidden="true"
          className="absolute top-1 left-1 -z-10 h-7 w-[2.375rem] rounded-full bg-card shadow-[0_2px_8px_-2px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-[var(--ease-out)]"
          style={{ transform: `translateX(${APP_LOCALES.indexOf(shown) * 2.375}rem)` }}
        />
        {APP_LOCALES.map((option) => (
          <li key={option}>
            <a
              href={hrefFor(option)}
              hrefLang={option}
              lang={option}
              aria-current={option === shown ? 'true' : undefined}
              title={LOCALE_NAMES[option]}
              onClick={(event) => choose(event, option)}
              className={cn(
                'inline-flex h-7 w-[2.375rem] items-center justify-center rounded-full text-xs font-semibold tracking-wide transition-colors duration-300',
                option === shown ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                pending && option === shown && 'animate-pulse motion-reduce:animate-none',
              )}
            >
              {/* The name keeps the visible code and adds the language, named in itself ("ES, Español"). */}
              {CODES[option]}
              <span className="sr-only">{`, ${LOCALE_NAMES[option]}`}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
