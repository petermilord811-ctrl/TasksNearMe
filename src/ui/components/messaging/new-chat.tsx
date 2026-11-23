'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Info, MessageCircle, RotateCcw } from 'lucide-react';
import { normalizeUsername, routes, type ActionResult, type ChatLoad, type DirectChatStart, type DirectChatTarget, type NewChatHandlers, type PeopleSearchData, type PersonSuggestion } from '@/contracts';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Badge } from '@/ui/primitives/badge';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { DirectMessageForm } from './direct-message-form';
import { PersonPicker } from './person-picker';

export interface NewChatProps {
  /** Where it shows: the chat window's pane, a dialog over the page, or the New message page. */
  variant: 'pane' | 'dialog' | 'page';
  /** The person chosen; absent while finding them. */
  to?: DirectChatTarget;
  /** The first message's form for `to` (`DirectChatStart`; a conversation the two already have is opened by the app). */
  start: ChatLoad<DirectChatStart>;
  /** The find step's first answer (the allowance), when the page already has it. */
  initialSearch?: PeopleSearchData;
  handlers: Pick<NewChatHandlers, 'onSearch' | 'onStart'>;
  /** Choose a person (`person`: a suggestion, which may name the conversation the two have), or none: back to finding. */
  onChoose(to: DirectChatTarget | undefined, person?: PersonSuggestion): void;
  /** After the first message: the new conversation (`redirectTo`). */
  onStarted(redirectTo: string): void;
  /** Load the chosen person's form again after a failure. */
  onRetry(): void;
  /** Seeds for the preview gallery: what the box starts with, and the first message's result and words. */
  initialQuery?: string;
  initialResult?: ActionResult;
  initialBody?: string;
}

function Loading({ compact }: { compact: boolean }) {
  const t = useTranslations('chat.window');
  return <div role="status" className={cn('flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground', compact ? 'p-6' : 'py-12')}><Spinner aria-hidden="true" />{t('loading')}</div>;
}

function Failed({ onRetry, compact }: { onRetry(): void; compact: boolean }) {
  const t = useTranslations('chat.window');
  return <div role="alert" className={cn('flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm', compact ? 'p-6' : 'py-12')}>
    <p>{t('failed')}</p>
    <button type="button" onClick={onRetry} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })}><RotateCcw aria-hidden="true" />{t('retry')}</button>
  </div>;
}

/**
 * New message, where the person is (2026-11-23, owner: "I want to do it in live chat box itself. I hate to redirect to
 * new pages continually … if possible, use dialog"): find them by @username with suggestions as you type, then write
 * the first message right there; Send opens the new conversation. The same steps in the chat window, in the dialog over
 * the page on phones, and on the New message page. The app loads the chosen person's form (`start`) and opens a
 * conversation the two already have instead.
 */
export function NewChat({ variant, to, start, initialSearch, handlers, onChoose, onStarted, onRetry, initialQuery, initialResult, initialBody }: NewChatProps) {
  const t = useTranslations('directMessage');
  const find = useTranslations('directMessage.find');
  const id = useId();
  const compact = variant === 'pane';
  const page = variant === 'page';
  const frame = cn(compact ? 'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3' : 'mx-auto w-full space-y-5', page && 'max-w-reading');
  const back = page && <Link href={routes.app.messages()} aria-label={find('back')} title={find('back')} className={buttonVariants({ variant: 'ghost', size: 'icon', className: '-ml-2 size-11 shrink-0 rounded-full' })}><ArrowLeft aria-hidden="true" className="size-5" /></Link>;
  const missing = to && 'username' in to && start.status === 'error' && start.notFound ? normalizeUsername(to.username) : undefined;

  if (!to || missing !== undefined) {
    const picker = <PersonPicker
      key={missing ?? 'find'}
      onSearch={handlers.onSearch}
      onChoose={(choice) => ('person' in choice ? onChoose({ userId: choice.person.id }, choice.person) : onChoose({ username: choice.username }))}
      {...(missing ? { initialQuery: missing, notFound: missing } : initialQuery ? { initialQuery } : {})}
      {...(initialSearch && !missing ? { initial: initialSearch } : {})}
      compact={compact}
      autoFocus={!page}
    />;
    // The dialog's own header says "New message": its body doesn't say it again.
    return <section {...(variant === 'dialog' ? { 'aria-label': find('title') } : { 'aria-labelledby': `${id}-title` })} className={frame}>
      {page
        ? <header className="flex min-w-0 items-center gap-2 sm:gap-3">{back}<h1 id={`${id}-title`} className="font-display text-2xl leading-tight font-semibold tracking-[-0.02em]">{find('title')}</h1></header>
        : compact && <h3 id={`${id}-title`} className="font-heading text-[15px] font-semibold">{find('title')}</h3>}
      {page
        ? <div className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]"><p className="text-muted-foreground">{find('description')}</p>{picker}</div>
        : <><p className={cn('text-muted-foreground', compact ? 'text-sm' : '')}>{find('description')}</p>{picker}</>}
    </section>;
  }

  const loaded = start.status === 'idle' ? undefined : start.data;
  if (!loaded || loaded.kind === 'thread') {
    return start.status === 'error' && !loaded ? <div className={frame}><Failed onRetry={onRetry} compact={compact} /></div> : <div className={frame}><Loading compact={compact} /></div>;
  }

  const { data } = loaded;
  const { recipient } = data;
  const firstName = recipient.displayName.split(' ')[0] ?? recipient.displayName;
  // Under the page's h1, the dialog's (its header) or the chat window's h2 ("Messages").
  const Title = page ? 'h1' : variant === 'dialog' ? 'h2' : 'h3';
  const Subtitle = page ? 'h2' : variant === 'dialog' ? 'h3' : 'h4';
  return <section aria-labelledby={`${id}-title`} className={frame}>
    <header className="flex min-w-0 items-center gap-3">
      {back}
      <InitialsAvatar initials={recipient.initials} photo={recipient.photo} size={page ? 'lg' : 'md'} />
      <div className="min-w-0 flex-1">
        <Title id={`${id}-title`} className={cn('leading-tight font-semibold [overflow-wrap:anywhere]', page ? 'font-display text-xl tracking-[-0.02em] sm:text-2xl' : 'font-heading text-base')}>{t('title', { name: recipient.displayName })}</Title>
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {data.username && <span>@{data.username}</span>}
          {data.helperHandle && data.canRequest && <Badge variant="secondary">{t('helperBadge')}</Badge>}
          {data.sample && <Badge variant="outline">{t('sampleBadge')}</Badge>}
          {data.helperHandle && <Link href={routes.helperProfile(data.helperHandle)} className="inline-flex min-h-9 items-center font-medium text-primary underline-offset-4 hover:underline">{t('viewProfile')}</Link>}
        </p>
      </div>
      <button type="button" onClick={() => onChoose(undefined)} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'min-h-9 shrink-0 rounded-full' })}>{t('someoneElse')}</button>
    </header>

    {data.sample && <p role="note" className="flex items-start gap-2 rounded-xl border border-foreground/[0.08] px-3 py-2 text-sm text-muted-foreground dark:border-white/[0.08]"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('sampleNote', { name: firstName })}</p>}

    <DirectMessageForm key={recipient.id} data={data} onStart={handlers.onStart} onStarted={onStarted} compact={compact} autoFocus={!page} {...(initialResult ? { initialResult } : {})} {...(initialBody ? { initialBody } : {})} />

    {data.canRequest && data.helperHandle && <section aria-labelledby={`${id}-request`} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-[1.375rem] border border-dashed border-foreground/15 dark:border-white/15', compact ? 'p-3' : 'p-card')}>
      <div className="min-w-0 space-y-1">
        <Subtitle id={`${id}-request`} className={cn('flex items-center gap-2 font-medium', compact && 'text-sm')}><MessageCircle aria-hidden="true" className="size-4 text-primary" />{t('request.title', { name: firstName })}</Subtitle>
        <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{t('request.description')}</p>
      </div>
      <Link href={routes.app.requestHelper(data.helperHandle)} className={buttonVariants({ variant: 'outline', className: 'min-h-11' })}>{t('request.action')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </section>}
  </section>;
}
