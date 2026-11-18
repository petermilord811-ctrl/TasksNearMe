'use client';

import { useState, useTransition } from 'react';
import { Heart, MessageCircle, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, CommunityReactInput, CommunityReaction, CommunityReactionsView } from '@/contracts';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';

const icons = { thanks: Heart, helpful: ThumbsUp } as const;

/**
 * Thanks and Helpful on a post or a reply (completion plan 7.7): toggles that answer at once and settle when the
 * server agrees (back as they were if it doesn't). Your own posts show the counts without the buttons. On phones
 * each shows its icon and count (the words stay for screen readers), so a card's actions keep to one line (9.10).
 */
export function ReactionBar({ target, reactions, own, onReact, replies }: {
  target: { kind: 'post' | 'reply'; id: string };
  reactions: CommunityReactionsView;
  own: boolean;
  onReact: ActionHandler<CommunityReactInput>;
  /** A post in the feed: its reply count, linking to it. */
  replies?: { count: number; href: string };
}) {
  const t = useTranslations('community');
  const [state, setState] = useState(reactions);
  const [, startTransition] = useTransition();
  // A fresh server render (another tab, a live refresh) wins over the local copy.
  const [seen, setSeen] = useState(reactions);
  if (seen !== reactions) {
    setSeen(reactions);
    setState(reactions);
  }

  const toggle = (kind: CommunityReaction) => {
    const on = !state.mine.includes(kind);
    const before = state;
    setState({ ...state, [kind]: Math.max(0, state[kind] + (on ? 1 : -1)), mine: on ? [...state.mine, kind] : state.mine.filter((mine) => mine !== kind) });
    startTransition(async () => {
      let ok = false;
      try {
        ok = (await onReact({ targetKind: target.kind, targetId: target.id, kind, on })).ok;
      } catch {
        ok = false;
      }
      if (!ok) setState(before);
    });
  };

  return <div role="group" aria-label={t('reactions.label')} className="flex flex-wrap items-center gap-1">
    {(['thanks', 'helpful'] as const).map((kind) => {
      const Icon = icons[kind];
      const pressed = state.mine.includes(kind);
      const label = t(`reactions.${kind}`);
      if (own) {
        return state[kind] > 0 ? <span key={kind} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-[13px] text-muted-foreground tabular-nums"><Icon aria-hidden="true" className="size-4" /><span className="sr-only">{label}: </span>{state[kind]}</span> : null;
      }
      return <button
        key={kind}
        type="button"
        aria-pressed={pressed}
        onClick={() => toggle(kind)}
        className={cn(
          'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring',
          pressed ? 'bg-brand-soft text-primary' : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]',
        )}
      >
        <Icon aria-hidden="true" className={cn('size-4 transition-transform duration-150', pressed && 'fill-current motion-safe:scale-110')} />
        <span className="max-sm:sr-only">{label}</span>
        {state[kind] > 0 && <span className="tabular-nums">{state[kind]}</span>}
      </button>;
    })}
    {replies && <Link href={replies.href} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-white/[0.06]">
      <MessageCircle aria-hidden="true" className="size-4" />
      {replies.count > 0
        ? <><span className="max-sm:sr-only">{t('replyCount', { count: replies.count })}</span><span aria-hidden="true" className="tabular-nums sm:hidden">{replies.count}</span></>
        : <span className="max-sm:sr-only">{t('reply')}</span>}
    </Link>}
  </div>;
}
