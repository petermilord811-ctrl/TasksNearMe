'use client';

import { useSyncExternalStore } from 'react';
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

/**
 * The light/dark switch from the top bar: a small pill with a sliding knob. The choice is saved for next
 * time (theme-script.ts applies it before paint); until someone picks, the system decides.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('shell.theme');
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  const toggle = () => {
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage blocked: it lasts for this page */
    }
  };

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
