'use client';

import { useEffect } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { BrandMark } from '@/ui/shells/logo';

/** What public/sw.js hands the page in front instead of popping up a system notification over it. */
export interface PagePush {
  type: 'tnm:push';
  title: string;
  body: string;
  /** Where a tap opens (absolute, from the server). */
  url: string;
  tag?: string;
}

export function isPagePush(value: unknown): value is PagePush {
  if (!value || typeof value !== 'object') return false;
  const push = value as Record<string, unknown>;
  return push.type === 'tnm:push' && typeof push.title === 'string' && typeof push.body === 'string' && typeof push.url === 'string'
    && (push.tag === undefined || typeof push.tag === 'string');
}

/** `url` as a path on this site (`origin`), or the app's home when it's another site's or not an address. */
export function pushPath(url: string, origin: string): string {
  try {
    const target = new URL(url, origin);
    if (target.origin === origin) return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    /* not an address */
  }
  return '/app';
}

/** The path without a language segment (`/es/app/x` → `/app/x`), so the page in front compares in any language. */
function withoutLanguage(path: string): string {
  return path.replace(/^\/(en|es)(?=\/|$)/, '') || '/';
}

/**
 * Whether the page shows `push` itself: only while it's in front. A push about the page that's open (the conversation
 * a message belongs to) shows nothing, since the page already has it, and still counts as shown, so no system
 * notification follows.
 */
export function takePagePush(push: PagePush, page: { origin: string; path: string; visible: boolean }, show: (path: string) => void): boolean {
  if (!page.visible) return false;
  const path = pushPath(push.url, page.origin);
  if (withoutLanguage(path.split(/[?#]/)[0]!) !== withoutLanguage(page.path)) show(path);
  return true;
}

/** One notification, in the app's look: the mark, its title and sentence, and the whole card opens its page. */
export function PushToastCard({ push, path, onDismiss }: { push: Pick<PagePush, 'title' | 'body'>; path: string; onDismiss(): void }) {
  const t = useTranslations('feedback.push');
  return (
    <div data-push-toast="" className="relative flex w-full items-start gap-3 p-3.5 pr-12">
      <Link href={path} onClick={onDismiss} className="group/push flex min-w-0 flex-1 items-start gap-3 rounded-xl outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring">
        <BrandMark className="size-10" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{push.title}</span>
          {push.body && <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{push.body}</span>}
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
            {t('open')}
            <ArrowRight aria-hidden="true" className="size-3.5 transition-transform duration-200 ease-[var(--ease-out)] group-hover/push:translate-x-0.5 motion-reduce:transition-none" />
          </span>
        </span>
      </Link>
      <button type="button" onClick={onDismiss} aria-label={t('dismiss')} className="absolute top-2.5 right-2.5 z-[1] grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/**
 * Notifications while TasksNearMe is open (owner, 2026-11-24: "Customize app notification (you are showing unstylized
 * notification on the top, so can't press it)"). The service worker asks the page in front first (public/sw.js): this
 * answers whether it showed the push, as a toast in the app's look under the top bar, whose card opens the page. No
 * answer (no page in front, or an old one without this) and the device's own notification shows as before.
 */
export function PushToasts() {
  useEffect(() => {
    const worker = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
    if (!worker) return;
    const onMessage = (event: MessageEvent) => {
      if (!isPagePush(event.data)) return;
      const push = event.data;
      const page = { origin: window.location.origin, path: window.location.pathname, visible: document.visibilityState === 'visible' };
      const shown = takePagePush(push, page, (path) => {
        toast.custom((id) => <PushToastCard push={push} path={path} onDismiss={() => toast.dismiss(id)} />, {
          // One card per thread or booking: a newer push about it replaces the card (as the device's tags do).
          ...(push.tag ? { id: `push:${push.tag}` } : {}),
          duration: 8000,
        });
      });
      event.ports?.[0]?.postMessage({ shown });
    };
    worker.addEventListener('message', onMessage);
    return () => worker.removeEventListener('message', onMessage);
  }, []);
  return null;
}
