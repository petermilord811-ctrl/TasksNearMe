'use client';

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, AtSign, Search, Sparkles } from 'lucide-react';
import { normalizeUsername, routes, type PeopleSearchData, type PersonSuggestion, type QueryHandler } from '@/contracts';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Badge } from '@/ui/primitives/badge';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export type PersonChoice = { person: PersonSuggestion } | { username: string };

export interface PersonPickerProps {
  /** Suggestions for what's typed (asked a moment after the typing stops). */
  onSearch: QueryHandler<string, PeopleSearchData>;
  /** A suggestion, or Find (Enter) on an @username that wasn't suggested: it may belong to nobody (`notFound` comes back). */
  onChoose(choice: PersonChoice): void;
  /** What the box starts with, and the first answer (the allowance) when the page already has it. */
  initialQuery?: string;
  initial?: PeopleSearchData;
  /** The @username Find looked for that belongs to nobody reachable. */
  notFound?: string;
  /** The chat window's pane: smaller type, the label visually hidden. */
  compact?: boolean;
  autoFocus?: boolean;
}

/** How long typing pauses before the box asks (one question for a quick burst of keys). */
const PAUSE_MS = 180;

/**
 * "To: @…" (2026-11-23, owner: "I want to do it in live chat box itself"): the person's @username, with suggestions as
 * it's typed (their photo or initials, name, @username, whether they're a helper or a sample profile, and whether the
 * two already talk). Arrow keys move through them, Enter or a tap chooses; Find takes what's typed as it is. Under the
 * box, what the viewer's Sparks level allows today.
 */
export function PersonPicker({ onSearch, onChoose, initialQuery = '', initial, notFound, compact = false, autoFocus = false }: PersonPickerProps) {
  const t = useTranslations('directMessage.find');
  const badges = useTranslations('directMessage');
  const levels = useTranslations('sparksBadge.levels');
  const { formatDateTime, zoneName } = useFormat();
  const id = useId();
  const listId = `${id}-people`;
  const [text, setText] = useState(initialQuery);
  const [data, setData] = useState<PeopleSearchData | undefined>(initial);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const turn = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  async function search(query: string) {
    const mine = ++turn.current;
    setSearching(true);
    try {
      const answer = await onSearch(query);
      if (mine !== turn.current) return;
      setData(answer);
      setActive(-1);
    } catch {
      // Nothing new to show: the last answer stays.
    } finally {
      if (mine === turn.current) setSearching(false);
    }
  }

  // The allowance (and suggestions for a box that starts filled in), when the page didn't bring them: once, on mount;
  // later answers come from typing.
  const searchFirst = useEffectEvent(() => {
    if (!initial) void search(initialQuery);
  });
  useEffect(() => {
    const first = setTimeout(searchFirst, 0);
    return () => clearTimeout(first);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const typed = normalizeUsername(text);
  const people = data && typed ? data.people : [];
  const answered = data?.query === typed && !searching;
  // "No one has @x" stays while the box still says x; typing something else is a new search.
  const missing = notFound && typed === notFound ? notFound : undefined;
  const noMatches = Boolean(typed) && answered && people.length === 0 && !missing;
  const activeId = active >= 0 && people[active] ? `${id}-person-${active}` : undefined;
  const describedBy = missing ? `${id}-not-found` : `${id}-hint`;

  function choose(person: PersonSuggestion) {
    onChoose({ person });
  }

  function submit() {
    const pick = active >= 0 ? people[active] : people.find((person) => person.username.toLowerCase() === typed);
    if (pick) choose(pick);
    else if (typed) onChoose({ username: typed });
  }

  return <div className={cn(compact ? 'space-y-3' : 'space-y-4')}>
    <form noValidate aria-label={t('title')} className="space-y-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label htmlFor={`${id}-input`} className={cn('text-sm font-medium', compact && 'sr-only')}>{t('label')}</label>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-input bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          <AtSign aria-hidden="true" className="ml-3 size-4 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            id={`${id}-input`}
            role="combobox"
            aria-expanded={people.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-invalid={missing ? true : undefined}
            aria-describedby={describedBy}
            value={text}
            maxLength={21}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={t('placeholder')}
            onChange={(event) => {
              const value = event.target.value;
              setText(value);
              setActive(-1);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => void search(value), PAUSE_MS);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && people.length > 0) { event.preventDefault(); setActive((value) => Math.min(value + 1, people.length - 1)); }
              if (event.key === 'ArrowUp' && people.length > 0) { event.preventDefault(); setActive((value) => Math.max(value - 1, -1)); }
            }}
            className="min-h-11 w-full min-w-0 bg-transparent px-2 py-2 text-base outline-none"
          />
          {searching && <Spinner aria-hidden="true" className="mr-3 size-4 shrink-0 text-muted-foreground" />}
        </div>
        <button type="submit" className={buttonVariants({ variant: compact ? 'outline' : 'default', className: 'min-h-11 shrink-0 rounded-full' })}><Search aria-hidden="true" />{t('submit')}</button>
      </div>
      {missing
        ? <p id={`${id}-not-found`} role="alert" className="text-sm text-destructive">{t('notFound', { username: missing })}</p>
        : <p id={`${id}-hint`} role="status" className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{noMatches ? t('noMatches', { username: typed }) : t('hint')}</p>}
    </form>

    {/* Always there (the box names it), hidden while it has nobody. */}
    <ul id={listId} role="listbox" aria-label={t('suggestions')} hidden={people.length === 0} className="-mx-1 space-y-0.5">
      {people.map((person, index) => <li
        key={person.id}
        id={`${id}-person-${index}`}
        role="option"
        aria-selected={active === index}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(person)}
        className={cn('flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-2 py-2 transition-colors', active === index ? 'bg-accent' : 'hover:bg-accent/60')}
      >
        <InitialsAvatar initials={person.initials} photo={person.photo} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-medium">{person.displayName}</span>
            {person.helper && <Badge variant="secondary" className="shrink-0">{badges('helperBadge')}</Badge>}
            {person.sample && <Badge variant="outline" className="shrink-0">{badges('sampleBadge')}</Badge>}
          </span>
          <span className="block truncate text-[0.8125rem] text-muted-foreground">@{person.username}{person.threadId ? ` · ${t('openConversation')}` : ''}</span>
        </span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </li>)}
    </ul>

    {data && <div className={cn('flex items-start gap-3 rounded-2xl bg-brand-soft/50 px-4 py-3', compact ? 'text-xs' : 'text-sm')}>
      <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="space-y-1">
        <p className="font-medium">{data.allowanceFrom ? t('allowancePlan', { left: data.allowance.left, perDay: data.allowance.perDay, plan: data.allowanceFrom }) : t('allowance', { left: data.allowance.left, perDay: data.allowance.perDay, level: levels(data.level) })}</p>
        {data.allowance.resetsAt && <p className="text-muted-foreground">{t('resetsAt', { time: formatDateTime(data.allowance.resetsAt), zone: zoneName })}</p>}
        <p className="text-muted-foreground">{t('moreWithSparks')} <Link href={routes.app.sparks()} className="font-semibold text-primary underline-offset-4 hover:underline">{t('sparksLink')}</Link></p>
        {/* Plus and Pro start more a day (the plans' ladder, 2026-11-23). */}
        {data.allowanceFrom !== 'pro' && <p className="text-muted-foreground">{t('moreWithPlans')} <Link href={routes.app.plan()} className="font-semibold text-primary underline-offset-4 hover:underline">{t('plansLink')}</Link></p>}
      </div>
    </div>}
  </div>;
}
