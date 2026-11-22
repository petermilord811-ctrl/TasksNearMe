'use client';

import { useState, useTransition } from 'react';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CommunityTranslation, QueryHandler } from '@/contracts';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * "See translation" (plan 10.23): a post or a reply in the reader's language, made when they ask (never stored), shown
 * under the original with "Hide translation". Says so when it can't be made right now.
 */
export function TranslateButton({ target, onTranslate }: { target: { target: 'post' | 'reply'; id: string }; onTranslate: QueryHandler<{ target: 'post' | 'reply'; id: string }, CommunityTranslation | null> }) {
  const t = useTranslations('community.translate');
  const locale = useLocale();
  const [translation, setTranslation] = useState<CommunityTranslation | null>(null);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (shown) return setShown(false);
    if (translation) return setShown(true);
    startTransition(async () => {
      let next: CommunityTranslation | null = null;
      try {
        next = await onTranslate(target);
      } catch {
        next = null;
      }
      setFailed(next === null);
      setTranslation(next);
      setShown(next !== null);
    });
  };

  return <div className="space-y-2">
    <button type="button" onClick={toggle} aria-expanded={shown} disabled={pending} className="inline-flex min-h-8 items-center gap-1.5 rounded-sm text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">
      {pending ? <Spinner aria-hidden="true" /> : <Languages aria-hidden="true" className="size-3.5" />}{pending ? t('loading') : shown ? t('hide') : t('show')}
    </button>
    {shown && translation && <div lang={locale} className="space-y-1 rounded-2xl border-l-2 border-primary/40 bg-muted/50 px-3 py-2">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('label')}</p>
      {translation.title && <p className="font-semibold [overflow-wrap:anywhere]">{translation.title}</p>}
      <p className="whitespace-pre-line text-[15px]/6 [overflow-wrap:anywhere]">{translation.body}</p>
    </div>}
    {failed && <p role="status" className="text-sm text-muted-foreground">{t('failed')}</p>}
  </div>;
}
