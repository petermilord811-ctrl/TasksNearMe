'use client';

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/ui/lib/utils';
import { ACCOUNT_GROUPS, type AccountGroup } from './account-group-ids';


function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** The group the address points at (`#account-<group>`), if any. */
function groupInAddress(): AccountGroup | null {
  const id = window.location.hash.replace(/^#account-/, '');
  return (ACCOUNT_GROUPS as readonly string[]).includes(id) ? (id as AccountGroup) : null;
}

interface GroupsState {
  isOpen: (group: AccountGroup) => boolean;
  setOpen: (group: AccountGroup, open: boolean) => void;
}

const GroupsContext = createContext<GroupsState | null>(null);

/**
 * Which of the account's groups are open on phones and tablets (plan 9.14b): the ones the page says to open
 * (`defaultOpen`: Profile, Sign-in after connecting Google or Microsoft, Privacy while a deletion or an export waits),
 * the one the address points at, and whatever the person opened or closed since. From 1024 px every group is open.
 */
export function AccountGroups({ defaultOpen, children }: { defaultOpen: readonly AccountGroup[]; children: ReactNode }) {
  // The address is read after hydration (the server can't see `#…`), so the first paint matches the server's.
  const fromAddress = useSyncExternalStore(subscribeToHash, groupInAddress, () => null);
  const [chosen, setChosen] = useState<Partial<Record<AccountGroup, boolean>>>({});
  const value = useMemo<GroupsState>(() => ({
    isOpen: (group) => chosen[group] ?? (group === fromAddress || defaultOpen.includes(group)),
    setOpen: (group, open) => setChosen((current) => ({ ...current, [group]: open })),
  }), [chosen, fromAddress, defaultOpen]);
  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

/** An index link: jumps to its group and opens it. */
export function AccountGroupLink({ group, ...props }: Omit<ComponentProps<'a'>, 'href'> & { group: AccountGroup }) {
  const groups = useContext(GroupsContext);
  return <a {...props} href={`#account-${group}`} onClick={(event) => { props.onClick?.(event); groups?.setOpen(group, true); }} />;
}

/**
 * One group. Phones and tablets: its title is a button that folds it, with a line saying what's inside; folded, it's
 * one row. From 1024 px: the small heading over its cards, always open.
 */
export function AccountGroupSection({ id, title, summary, children }: { id: AccountGroup; title: string; summary: string; children: ReactNode }) {
  const groups = useContext(GroupsContext);
  const open = groups?.isOpen(id) ?? true;
  const contentId = `account-${id}-content`;
  return (
    <section id={`account-${id}`} aria-labelledby={`account-${id}-title`} className="scroll-mt-24 space-y-3 lg:space-y-4">
      <h2 id={`account-${id}-title`} className="lg:px-1 lg:text-sm lg:leading-5 lg:font-semibold lg:tracking-wide lg:text-muted-foreground lg:uppercase">
        <span className="max-lg:hidden">{title}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => groups?.setOpen(id, !open)}
          className="flex min-h-16 w-full items-center gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card px-4 py-3 text-left shadow-card transition-colors hover:bg-card/80 lg:hidden dark:border-white/[0.06]"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg leading-6 font-semibold tracking-[-0.015em]">{title}</span>
            <span aria-hidden="true" className="mt-0.5 block text-sm text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown aria-hidden="true" className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
        </button>
      </h2>
      <div id={contentId} className={cn('space-y-3 sm:space-y-4', !open && 'max-lg:hidden')}>{children}</div>
    </section>
  );
}
