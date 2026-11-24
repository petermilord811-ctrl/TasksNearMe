'use client';

import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ArrowUpRight, Ban, Bell, BellOff, Languages, MoreHorizontal, PanelLeft, PanelRight, Pin, PinOff, Search, Sparkles, UserCheck, X } from 'lucide-react';
import { routes, type ActionResult, type ConversationFlag, type ConversationSearchData, type ISODateTime, type ReportHandlers, type ReportSubject, type ThreadHandlers, type ThreadSummary } from '@/contracts';
import { ReportBlockMenu } from '@/ui/components/safety';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';
import { Spinner } from '@/ui/primitives/spinner';
import { useChatAssist } from '@/ui/screens/messages/chat-assist';
import { MaskedText } from './masked-text';

type Handlers = Pick<ThreadHandlers, 'onFlag' | 'onAccept' | 'onSearch'>;

/** A flag's change said in a toast; a refusal (three pinned already, a lost connection) says why. */
function useFlagResult() {
  const t = useTranslations('thread.tools');
  return (flag: ConversationFlag, on: boolean, result: ActionResult) => {
    if (result.ok) toast.success(t(`done.${flag}`, { on: on ? 'yes' : 'no' }));
    else toast.error(result.code === 'limit_reached' ? t('pinLimit') : t('failed'));
  };
}

export interface ConversationMenuProps {
  thread: ThreadSummary;
  handlers: Handlers;
  /** Report and Block, when the other person can be reported (the menu then carries both). */
  safety?: { subject: ReportSubject; handlers: ReportHandlers };
  /** The other person's name, for the menu's label. */
  name: string;
  /** A search result chosen: the chat window shows the conversation from it; the page goes to it (`routes.app.thread`). */
  onJump?: (messageId: string) => void;
  /** The chat window on wide screens: this conversation in a docked window of its own (2026-11-23). */
  onOpenBeside?: () => void;
  /** A docked window: back into the chat window's own pane. */
  onShowInWindow?: () => void;
  /** Where the conversation's subject lives (the person's profile, the booking, the offer): the menu's first item. */
  subject?: { href: string; label: string };
  now: ISODateTime;
}

/**
 * A conversation's ⋯ menu (2026-11-23, owner: "plan all and implement"): search it, pin it on top of Messages, mute it,
 * archive it, then Report and Block. One menu on the conversation page and in the chat window. Since 2026-11-24 also
 * "Translate this conversation" (on and off) and "Catch me up", where the conversation's provider offers them.
 */
export function ConversationMenu({ thread, handlers, safety, name, onJump, onOpenBeside, onShowInWindow, subject, now }: ConversationMenuProps) {
  const t = useTranslations('thread.tools');
  const translateCopy = useTranslations('thread.translateAll');
  const catchUpCopy = useTranslations('thread.catchUp');
  const assist = useChatAssist();
  const said = useFlagResult();
  const [pending, setPending] = useState(false);
  const [searching, setSearching] = useState(false);
  // The menu's button, mine or Report and Block's: the search dialog opens from the menu (state, no trigger of its own), so
  // focus goes back to that button when it closes.
  const box = useRef<HTMLSpanElement>(null);
  const restoreFocus = () => box.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.focus();

  async function flag(which: ConversationFlag, on: boolean) {
    if (!handlers.onFlag || pending) return;
    setPending(true);
    try {
      said(which, on, await handlers.onFlag({ flag: which, on }));
    } catch {
      said(which, on, { ok: false, code: 'unknown' });
    } finally {
      setPending(false);
    }
  }

  const items = <>
    {/* What it's about first: a helper's profile opens in a sheet beside the page, never a trip away (2026-11-23). */}
    {subject && <DropdownMenuItem asChild><Link href={subject.href}><ArrowUpRight aria-hidden="true" />{subject.label}</Link></DropdownMenuItem>}
    {/* The dialog opens once the menu has closed and given focus back to its button (no focus tug of war). */}
    {handlers.onSearch && <DropdownMenuItem onSelect={() => { window.setTimeout(() => setSearching(true), 0); }}><Search aria-hidden="true" />{t('search')}</DropdownMenuItem>}
    {/* The other person's messages in the reader's language, and a summary of what was missed (2026-11-24). */}
    {assist?.translateOffered && <DropdownMenuItem onSelect={() => assist.setTranslating(!assist.translating)}><Languages aria-hidden="true" />{translateCopy(assist.translating ? 'stop' : 'menu')}</DropdownMenuItem>}
    {assist?.catchUpOffered && <DropdownMenuItem onSelect={assist.askCatchUp}><Sparkles aria-hidden="true" />{catchUpCopy('menu')}</DropdownMenuItem>}
    {onOpenBeside && <DropdownMenuItem onSelect={onOpenBeside}><PanelLeft aria-hidden="true" />{t('openBeside')}</DropdownMenuItem>}
    {onShowInWindow && <DropdownMenuItem onSelect={onShowInWindow}><PanelRight aria-hidden="true" />{t('showInWindow')}</DropdownMenuItem>}
    {handlers.onFlag && <>
      {!thread.archived && !thread.request && <DropdownMenuItem disabled={pending} onSelect={() => void flag('pinned', !thread.pinned)}>{thread.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}{t(thread.pinned ? 'unpin' : 'pin')}</DropdownMenuItem>}
      <DropdownMenuItem disabled={pending} onSelect={() => void flag('muted', !thread.muted)}>{thread.muted ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}{t(thread.muted ? 'unmute' : 'mute')}</DropdownMenuItem>
      <DropdownMenuItem disabled={pending} onSelect={() => void flag('archived', !thread.archived)}>{thread.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}{t(thread.archived ? 'unarchive' : 'archive')}</DropdownMenuItem>
    </>}
  </>;
  const label = t('menu', { name });
  const search = handlers.onSearch && <SearchDialog open={searching} onOpenChange={setSearching} onSearch={handlers.onSearch} threadId={thread.id} name={name} now={now} restoreFocus={restoreFocus} {...(onJump ? { onJump } : {})} />;

  if (safety) return <span ref={box} className="contents">
    <ReportBlockMenu key={safety.subject.userId} subject={safety.subject} handlers={safety.handlers} items={items} label={label} />
    {search}
  </span>;
  if (!handlers.onFlag && !handlers.onSearch && !onOpenBeside && !onShowInWindow && !subject && !assist?.translateOffered && !assist?.catchUpOffered) return null;
  return <span ref={box} className="contents">
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={label} disabled={pending} aria-busy={pending}>{pending ? <Spinner aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (searching) event.preventDefault(); }}>{items}</DropdownMenuContent>
    </DropdownMenu>
    {search}
  </span>;
}

/** Where the search's words are in a result, marked (the words as the viewer sees them; masked details never match). */
function marked(text: string, query: string) {
  const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const wanted = fold(query.trim());
  if (!wanted) return text;
  // Folding keeps one character per character for the letters people type; the cut uses the folded text's positions.
  const folded = [...text].map((char) => fold(char)).join('');
  if (folded.length !== text.length) return text;
  const at = folded.indexOf(wanted);
  if (at < 0) return text;
  return <>{text.slice(0, at)}<mark className="rounded bg-primary/20 px-0.5 text-foreground">{text.slice(at, at + wanted.length)}</mark>{text.slice(at + wanted.length)}</>;
}

/**
 * Search in a conversation (2026-11-23): its written messages as the viewer sees them, newest first; choosing one shows
 * the conversation from that message, scrolled to it. A dialog, so it works the same in the chat window and on the page.
 */
function SearchDialog({ open, onOpenChange, onSearch, threadId, name, onJump, now, restoreFocus }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSearch: NonNullable<Handlers['onSearch']>;
  threadId: string;
  name: string;
  onJump?: (messageId: string) => void;
  now: ISODateTime;
  restoreFocus(): void;
}) {
  const t = useTranslations('thread.search');
  const you = useTranslations('thread');
  const router = useRouter();
  const { formatDate, formatTime } = useFormat();
  const id = useId();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<{ status: 'idle' | 'loading' | 'error' } | { status: 'ready'; data: ConversationSearchData }>({ status: 'idle' });
  const turn = useRef(0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 2) return;
    const mine = ++turn.current;
    setAnswer({ status: 'loading' });
    try {
      const data = await onSearch(text);
      if (mine !== turn.current) return;
      setAnswer(data ? { status: 'ready', data } : { status: 'error' });
    } catch {
      if (mine === turn.current) setAnswer({ status: 'error' });
    }
  }

  function jump(messageId: string) {
    onOpenChange(false);
    if (onJump) onJump(messageId);
    else router.push(routes.app.thread(threadId, { from: messageId, focus: messageId }), { scroll: false });
  }

  const data = answer.status === 'ready' ? answer.data : undefined;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }} className="max-h-[85dvh] overflow-hidden sm:max-w-reading max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
      <DialogHeader>
        <DialogTitle>{t('title', { name })}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <form role="search" onSubmit={(event) => void submit(event)} className="flex gap-2">
        <label htmlFor={`${id}-q`} className="sr-only">{t('label')}</label>
        <input id={`${id}-q`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder={t('placeholder')} autoComplete="off" enterKeyHint="search" className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
        <Button type="submit" className="min-h-11 rounded-full" disabled={answer.status === 'loading'} aria-busy={answer.status === 'loading'}>{answer.status === 'loading' ? <Spinner aria-hidden="true" /> : <Search aria-hidden="true" />}{t('submit')}</Button>
      </form>
      <div className="-mx-2 min-h-0 overflow-y-auto overscroll-contain px-2" aria-live="polite">
        {answer.status === 'error' && <p role="alert" className="py-4 text-sm text-destructive">{t('failed')}</p>}
        {query.trim().length > 0 && query.trim().length < 2 && answer.status === 'idle' && <p className="py-4 text-sm text-muted-foreground">{t('tooShort')}</p>}
        {data && (data.hits.length === 0
          ? <p className="py-4 text-sm text-muted-foreground">{t('none', { query: data.query })}</p>
          : <>
            <p className="pb-2 text-sm text-muted-foreground">{data.more ? t('countMore', { count: data.hits.length }) : t('count', { count: data.hits.length })}</p>
            <ul aria-label={t('results')} className="space-y-1">
              {data.hits.map((hit) => <li key={hit.id}>
                <button type="button" onClick={() => jump(hit.id)} className="flex w-full min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                  <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="font-semibold">{hit.sender === 'me' ? you('you') : name}</span><time dateTime={hit.createdAt} className="tabular-nums">{formatDate(hit.createdAt, { withYear: Date.parse(now) - Date.parse(hit.createdAt) > 300 * 86_400_000 })} · {formatTime(hit.createdAt)}</time></span>
                  <span className="text-sm leading-5 [overflow-wrap:anywhere]">{hit.segments.map((segment, index) => segment.kind === 'text' ? <span key={index}>{marked(segment.text, data.query)}</span> : <MaskedText key={index} segments={[segment]} links={false} />)}</span>
                </button>
              </li>)}
            </ul>
          </>)}
      </div>
    </DialogContent>
  </Dialog>;
}

export interface RequestBannerProps {
  thread: ThreadSummary;
  /** The other person's first name. */
  name: string;
  handlers: Pick<Handlers, 'onAccept' | 'onFlag'>;
  /** Block them at once (a stranger's first message): the conversation's Block (`ReportHandlers.onBlock`). */
  onBlock?: (input: { blocked: boolean }) => Promise<ActionResult>;
  /** After Ignore: the chat window goes back to the list; the page to Messages. */
  onIgnored?: () => void;
  compact?: boolean;
}

/**
 * A message request (2026-11-23): someone the viewer hasn't talked to about a task wrote first. Accept moves it into
 * Messages (answering does too), Ignore archives it without telling them, Block stops them.
 */
export function RequestBanner({ thread, name, handlers, onBlock, onIgnored, compact = false }: RequestBannerProps) {
  const t = useTranslations('thread.request');
  const router = useRouter();
  const [pending, setPending] = useState<'accept' | 'ignore' | 'block' | null>(null);
  const [failed, setFailed] = useState(false);
  if (!thread.request) return null;

  async function run(which: 'accept' | 'ignore' | 'block') {
    if (pending) return;
    setPending(which);
    setFailed(false);
    try {
      const result = which === 'accept' ? await handlers.onAccept?.() : which === 'ignore' ? await handlers.onFlag?.({ flag: 'archived', on: true }) : await onBlock?.({ blocked: true });
      if (!result?.ok) {
        setFailed(true);
        return;
      }
      if (which === 'ignore') {
        toast.success(t('ignored', { name }));
        if (onIgnored) onIgnored();
        else router.push(routes.app.messages());
      }
      if (which === 'block') toast.success(t('blocked', { name }));
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  const button = (which: 'accept' | 'ignore' | 'block', icon: ReactNode, variant: 'default' | 'outline' | 'ghost') => <button type="button" disabled={pending !== null} aria-busy={pending === which} onClick={() => void run(which)} className={buttonVariants({ variant, size: 'sm', className: cn('min-h-10 rounded-full', which === 'block' && 'text-destructive hover:text-destructive') })}>
    {pending === which ? <Spinner aria-hidden="true" /> : icon}{t(which)}
  </button>;
  return <section aria-label={t('label')} className={cn('space-y-2 border-t border-foreground/[0.07] bg-brand-soft/40 dark:border-white/[0.06]', compact ? 'px-3 py-2.5' : 'px-4 py-3')}>
    <p className={cn('font-semibold', compact ? 'text-sm' : '')}>{t('title', { name })}</p>
    <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{t('body', { name })}</p>
    <div className="flex flex-wrap gap-2">
      {handlers.onAccept && button('accept', <UserCheck aria-hidden="true" />, 'default')}
      {handlers.onFlag && button('ignore', <X aria-hidden="true" />, 'outline')}
      {onBlock && button('block', <Ban aria-hidden="true" />, 'ghost')}
    </div>
    {failed && <p role="alert" className="text-sm text-destructive">{t('failed')}</p>}
  </section>;
}

/** The marks on a conversation's row and header: pinned, muted. */
export function ConversationMarks({ thread, className }: { thread: Pick<ThreadSummary, 'pinned' | 'muted'>; className?: string }) {
  const t = useTranslations('thread.tools');
  if (!thread.pinned && !thread.muted) return null;
  return <span className={cn('inline-flex shrink-0 items-center gap-1 text-muted-foreground', className)}>
    {thread.pinned && <Pin aria-label={t('pinnedMark')} role="img" className="size-3.5" />}
    {thread.muted && <BellOff aria-label={t('mutedMark')} role="img" className="size-3.5" />}
  </span>;
}

