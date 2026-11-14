'use client';

import { useSyncExternalStore, type MouseEvent } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/ui/lib/utils';
import { THEME_STORAGE_KEY } from '@/ui/theme/theme-script';

type Theme = 'light' | 'dark';

/** The OS's color scheme query (absent in some test environments). */
function systemQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
}

function currentTheme(): Theme {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return systemQuery()?.matches ? 'dark' : 'light';
}

/** The effective theme: the saved choice on <html>, or the system's. Notifies on either changing. */
function subscribe(onChange: () => void) {
  const media = systemQuery();
  media?.addEventListener('change', onChange);
  const watch = new MutationObserver(onChange);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    media?.removeEventListener('change', onChange);
    watch.disconnect();
  };
}

/** Reduced motion asked for, or no View Transitions in this browser: switch at once. */
function instantSwitch(): boolean {
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce || typeof document.startViewTransition !== 'function';
}

/** The page's effective theme (the saved choice on <html>, or the system's); null before hydration. */
export function useEffectiveTheme(): Theme | null {
  return useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);
}

/**
 * Switches to the other theme and saves the choice. With `from` (the control that was used), the new theme spreads
 * over the page as a circle growing from it (a View Transition), so the whole page changes together.
 */
export function switchTheme(from?: Element | null) {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  const apply = () => {
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage blocked: it lasts for this page */
    }
  };
  if (instantSwitch() || !from) {
    apply();
    return;
  }
  const root = document.documentElement;
  const box = from.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  root.style.setProperty('--theme-x', `${x}px`);
  root.style.setProperty('--theme-y', `${y}px`);
  root.style.setProperty('--theme-r', `${Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))}px`);
  root.setAttribute('data-theme-switch', '');
  const transition = document.startViewTransition(apply);
  void transition.finished.finally(() => root.removeAttribute('data-theme-switch'));
}

/**
 * The light/dark switch from the top bar: a small pill with a sliding knob. The choice is saved for next time
 * (theme-script.ts applies it before paint); until someone picks, the system decides.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('shell.theme');
  const theme = useEffectiveTheme();
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const toggle = (event: MouseEvent<HTMLButtonElement>) => switchTheme(event.currentTarget);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={next === 'dark' ? t('toDark') : t('toLight')}
      title={t('label')}
      className={cn('relative inline-flex h-9 w-[4.25rem] shrink-0 items-center justify-between rounded-full bg-foreground/[0.06] px-2 text-muted-foreground transition-colors hover:text-foreground', className)}
    >
      <Sun aria-hidden="true" className="relative z-10 size-4" />
      <Moon aria-hidden="true" className="relative z-10 size-4" />
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1 left-1 size-7 rounded-full bg-card shadow-[0_2px_8px_-2px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-[var(--ease-out)]',
          theme === 'dark' && 'translate-x-[2.25rem]',
          theme === null && 'opacity-0',
        )}
      />
    </button>
  );
}
