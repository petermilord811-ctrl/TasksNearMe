'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { Heart, MessageCircle, ThumbsUp } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ActionHandler, CommunityReactInput, CommunityReaction, CommunityReactionsView, CommunityReactorsView, QueryHandler } from '@/contracts';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { Spinner } from '@/ui/primitives/spinner';

const icons = { thanks: Heart, helpful: ThumbsUp } as const;

/** Who reacted, behind the counts (plan 10.2): loaded when opened, Helpful and Thanks in two short lists. */
function ReactorsList({ target, onLoad }: { target: { kind: 'post' | 'reply'; id: string }; onLoad: QueryHandler<{ target: 'post' | 'reply'; id: string }, CommunityReactorsView | null> }) {
  const t = useTranslations('community.reactors');
  const [state, setState] = useState<{ loading: boolean; data: CommunityReactorsView | null; failed: boolean }>({ loading: true, data: null, failed: false });
  // Loaded once, when the list opens (it mounts with the popover).
  useEffect(() => {
    let live = true;
    onLoad({ target: target.kind, id: target.id })
      .then((data) => live && setState({ loading: false, data, failed: data === null }))
      .catch(() => live && setState({ loading: false, data: null, failed: true }));
    return () => {
      live = false;
    };
  }, [onLoad, target.kind, target.id]);
  if (state.loading) return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t('loading')}</p>;
  if (state.failed || !state.data) return <p role="alert" className="text-sm text-destructive">{t('failed')}</p>;
  const group = (kind: 'helpful' | 'thanks', names: string[]) => names.length > 0 && <section aria-labelledby={`reactors-${kind}-${target.id}`} className="space-y-1.5">
    <h3 id={`reactors-${kind}-${target.id}`} className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{kind === 'helpful' ? <ThumbsUp aria-hidden="true" className="size-3.5" /> : <Heart aria-hidden="true" className="size-3.5" />}{t(kind, { count: names.length })}</h3>
    <ul className="space-y-1 text-sm">{names.map((name, index) => <li key={`${name}-${index}`} className="truncate">{name}</li>)}</ul>
  </section>;
  return <div className="max-h-72 space-y-4 overflow-y-auto">
    {group('helpful', state.data.helpful)}
    {group('thanks', state.data.thanks)}
    {state.data.helpful.length === 0 && state.data.thanks.length === 0 && <p className="text-sm text-muted-foreground">{t('none')}</p>}
  </div>;
}

export interface PostEngagementProps {
  target: { kind: 'post' | 'reply'; id: string };
  reactions: CommunityReactionsView;
  /** The viewer wrote it: counts only, no Helpful or Thanks buttons. */
  own: boolean;
  onReact: ActionHandler<CommunityReactInput>;
  /** Up to two people who found it helpful (never the viewer). */
  helpfulNames?: string[];
  onLoadReactors?: QueryHandler<{ target: 'post' | 'reply'; id: string }, CommunityReactorsView | null>;
  /** The reply count and where it leads (the feed), or just the count (a post's page). */
  replies?: { count: number; href?: string };
  /** Reply: opens the reply box on the card, or moves to the form on a post's page. Absent: no Reply button. */
  onReply?: () => void;
  replyExpanded?: boolean;
  /** Save, at the end of the actions. */
  children?: ReactNode;
  /** After the actions: Ask for help (its own row on phones). */
  trailing?: ReactNode;
}

/**
 * A post's counts and actions, Nextdoor-style (plan 10.2): a quiet line of what neighbors did ("Priya S. and 3 others
 * found this helpful", the Thanks, the replies), then a row of actions: Helpful, Thanks, Reply and Save. Helpful and
 * Thanks answer at once and settle when the server agrees (back as they were if it doesn't). Your own post shows the
 * counts without the buttons. On phones the actions share the row equally, each with its icon and word.
 */
export function PostEngagement({ target, reactions, own, onReact, helpfulNames = [], onLoadReactors, replies, onReply, replyExpanded, children, trailing }: PostEngagementProps) {
  const t = useTranslations('community');
  const format = useFormatter();
  const [state, setState] = useState(reactions);
  const [, startTransition] = useTransition();
  // A fresh server render (a live refresh, another tab) wins over the local copy.
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

  // "Priya S. and 3 others found this helpful": every name when there are at most two and nobody else ("You and
  // Priya S."), else the first (the viewer first) and how many more, so the line stays short on a phone.
  const mineHelpful = state.mine.includes('helpful');
  const people = [...(mineHelpful ? [t('reactors.you')] : []), ...helpfulNames];
  const shown = people.length <= 2 && state.helpful <= people.length ? people : people.slice(0, 1);
  const others = Math.max(0, state.helpful - shown.length);
  const names = shown.length > 0 ? format.list(shown, { type: 'conjunction' }) : '';
  const helpfulLine = state.helpful === 0
    ? null
    : shown.length === 0
      ? t('reactors.helpfulCount', { count: state.helpful })
      : state.helpful === 1 && mineHelpful
        ? t('reactors.helpfulYou')
        : t('reactors.helpfulBy', { names, others, total: state.helpful });
  // Phones: just the names beside the thumbs-up and its count ("Priya S. and 3 others"); the sentence didn't fit.
  const helpfulShort = state.helpful > 0 && shown.length > 0 ? t('reactors.helpfulByShort', { names, others }) : null;
  const summary = <span className="inline-flex min-w-0 items-center gap-2">
    {state.helpful > 0 && <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1 tabular-nums"><span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><ThumbsUp className="size-3" /></span>{state.helpful}</span>}
    {state.thanks > 0 && <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1 tabular-nums"><span className="grid size-5 place-items-center rounded-full bg-badge-success text-badge-success-foreground"><Heart className="size-3" /></span>{state.thanks}</span>}
    {/* min-w-0: a flex item's text can't shrink below its full width otherwise, and the line widened the page. One
        of the two shows (display: none hides the other from screen readers too). */}
    {helpfulLine && <span className={cn('min-w-0 truncate', helpfulShort && 'max-sm:hidden')}>{helpfulLine}</span>}
    {helpfulShort && <span className="min-w-0 truncate sm:hidden">{helpfulShort}</span>}
    <span className="sr-only">{t('reactors.counts', { helpful: state.helpful, thanks: state.thanks })}</span>
  </span>;
  const showLine = state.helpful > 0 || state.thanks > 0 || (replies && replies.count > 0);

  const actionClass = 'inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-[13px] font-semibold text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-white/[0.06] sm:gap-1.5 sm:px-3';
  return <div className="space-y-0.5">
    {showLine && <div className="flex min-h-6 items-center justify-between gap-3 text-[12.5px] text-muted-foreground">
      {state.helpful > 0 || state.thanks > 0
        ? onLoadReactors
          ? <Popover>
              {/* Named by what it shows (label in name), the action after it; flex so the line can truncate. */}
              <PopoverTrigger className="flex min-w-0 rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{summary}<span className="sr-only">{t('reactors.open')}</span></PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-4"><ReactorsList target={target} onLoad={onLoadReactors} /></PopoverContent>
            </Popover>
          : summary
        : <span />}
      {replies && replies.count > 0 && (replies.href
        ? <Link href={replies.href} className="shrink-0 rounded-sm tabular-nums underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('replyCount', { count: replies.count })}</Link>
        : <span className="shrink-0 tabular-nums">{t('replyCount', { count: replies.count })}</span>)}
    </div>}
    {/* One row: the actions, then "Ask for help" on the viewer's own ask (2026-11-22: no line of its own). */}
    <div className="flex items-center gap-1 border-t border-border/70 pt-0.5">
    {/* Phones: Helpful and Reply share the row with their words; Thanks (named for screen readers) and Save show their
        icons, since four labels in a 360 px card cut each one to a few letters. From `sm` they sit at the start. */}
    <div role="group" aria-label={t('reactions.label')} className="flex min-w-0 flex-1 items-center gap-1 sm:flex-wrap">
      {!own && (['helpful', 'thanks'] as const).map((kind) => {
        const Icon = icons[kind];
        const pressed = state.mine.includes(kind);
        return <button key={kind} type="button" aria-pressed={pressed} onClick={() => toggle(kind)} className={cn(actionClass, kind === 'helpful' ? 'max-sm:flex-1' : 'max-sm:w-11 max-sm:flex-none max-sm:px-0', pressed && 'bg-brand-soft text-primary hover:bg-brand-soft hover:text-primary')}>
          <Icon aria-hidden="true" className={cn('size-4 shrink-0 transition-transform duration-150', pressed && 'fill-current motion-safe:scale-110')} />
          <span className={cn('truncate', kind === 'thanks' && 'max-sm:sr-only')}>{t(`reactions.${kind}`)}</span>
        </button>;
      })}
      {onReply && <button type="button" onClick={onReply} aria-expanded={replyExpanded} aria-label={t('replyToPost')} className={cn(actionClass, 'max-sm:flex-1')}>
        <MessageCircle aria-hidden="true" className="size-4 shrink-0" /><span className="truncate">{t('reply')}</span>
      </button>}
      {children}
    </div>
    {trailing && <div className="flex shrink-0">{trailing}</div>}
    </div>
  </div>;
}
