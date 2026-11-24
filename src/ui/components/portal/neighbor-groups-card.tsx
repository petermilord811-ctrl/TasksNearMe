'use client';

import { createContext, use, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BellOff, ChevronRight, KeyRound, Plus, ShieldCheck, UsersRound } from 'lucide-react';
import type { NeighborGroupHandlers, NeighborGroupsData, NeighborGroupView } from '@/contracts';
import { CreateGroupDialog, GroupKindIcon, JoinGroupDialog } from '@/ui/components/community/neighbor-group-dialogs';
import { NeighborGroupSheet, type NeighborGroupTab } from '@/ui/components/community/neighbor-group-sheet';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';

interface GroupsControls {
  /** Opens a group's sheet; focus goes back to `from` once it closes. */
  openGroup: (groupId: string, from: HTMLElement) => void;
  /** Opens "Create a group" or "Join with a code"; focus goes back to `from`. */
  openDialog: (kind: 'create' | 'join', from: HTMLElement) => void;
}

const GroupsContext = createContext<GroupsControls | null>(null);

interface GroupsProps {
  data: NeighborGroupsData;
  handlers: NeighborGroupHandlers;
  initialView?: NeighborGroupView;
  initialTab?: NeighborGroupTab;
  initialDialog?: 'create' | 'join';
}

/**
 * The groups' sheet and dialogs, once for the page (2026-11-24). Neighbors shows the card in two places (the rail on wide
 * screens, the stream on smaller ones) and both open these; the page's address opens a group (`openGroupId`, from a
 * notification) or an invite (`invite`, from its link) here, also where no card shows (the List, a later page).
 * `initialView`, `initialTab` and `initialDialog` are for previews.
 */
export function NeighborGroups({ data, handlers, initialView, initialTab, initialDialog, children }: GroupsProps & { children: ReactNode }) {
  const j = useTranslations('neighborGroups.join');
  const c = useTranslations('neighborGroups.create');
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(initialView?.group.id ?? data.openGroupId ?? null);
  const [tab, setTab] = useState<NeighborGroupTab>(initialTab ?? 'chat');
  const [dialog, setDialog] = useState<'create' | 'join' | null>(initialDialog ?? (data.invite ? 'join' : null));
  const returnFocus = useRef<HTMLElement | null>(null);

  // Focus goes back to what opened the group once its sheet has closed.
  useEffect(() => {
    if (openId !== null) return;
    const target = returnFocus.current;
    if (target?.isConnected) target.focus();
  }, [openId]);

  const open = (groupId: string, nextTab: NeighborGroupTab = 'chat') => {
    setTab(nextTab);
    setOpenId(groupId);
  };
  const controls: GroupsControls = {
    openGroup: (groupId, from) => { returnFocus.current = from; open(groupId); },
    openDialog: (kind, from) => { returnFocus.current = from; setDialog(kind); },
  };

  return <GroupsContext value={controls}>
    {children}
    <CreateGroupDialog
      open={dialog === 'create'}
      onOpenChange={(next) => setDialog(next ? 'create' : null)}
      {...(data.areaName ? { areaName: data.areaName } : {})}
      onCreate={handlers.onCreate}
      onCreated={(groupId) => {
        setDialog(null);
        toast.success(c('created'));
        router.refresh();
        open(groupId, 'members');
      }}
    />
    <JoinGroupDialog
      key={data.invite?.code ?? 'join'}
      open={dialog === 'join'}
      onOpenChange={(next) => setDialog(next ? 'join' : null)}
      {...(data.invite ? { initial: data.invite } : {})}
      onPreview={handlers.onPreviewInvite}
      onJoin={handlers.onJoin}
      onJoined={(groupId, name) => {
        setDialog(null);
        if (name) toast.success(j('joined', { group: name }));
        router.refresh();
        open(groupId);
      }}
    />
    <NeighborGroupSheet
      key={openId ?? 'closed'}
      groupId={openId}
      handlers={handlers}
      initialTab={tab}
      {...(initialView && initialView.group.id === openId ? { initialView } : {})}
      onClose={(changed) => {
        setOpenId(null);
        if (changed) router.refresh();
      }}
    />
  </GroupsContext>;
}

type CardLayout = 'page' | 'rail';

/**
 * "Your groups" on Neighbors (2026-11-24): the viewer's building and street groups with what's unread, "Create a group"
 * and "Join with a code", each opening over the page (the group's sheet, the dialogs), never a trip away. `layout="rail"`
 * is the wide screens' rail card, in the rail's look. Inside `NeighborGroups` it shares that one sheet and its dialogs;
 * on its own (previews, tests) it brings them itself.
 */
export function NeighborGroupsCard({ data, handlers, now, layout = 'page', initialView, initialTab, initialDialog }: GroupsProps & { now: string; layout?: CardLayout }) {
  const shared = use(GroupsContext);
  if (shared) return <GroupsCardView data={data} now={now} layout={layout} controls={shared} />;
  return <NeighborGroups data={data} handlers={handlers} {...(initialView ? { initialView } : {})} {...(initialTab ? { initialTab } : {})} {...(initialDialog ? { initialDialog } : {})}>
    <NeighborGroupsCard data={data} handlers={handlers} now={now} layout={layout} />
  </NeighborGroups>;
}

function GroupsCardView({ data, now, layout, controls }: { data: NeighborGroupsData; now: string; layout: CardLayout; controls: GroupsControls }) {
  const t = useTranslations('neighborGroups.card');
  const g = useTranslations('neighborGroups');
  const { formatRelative } = useFormat();
  const titleId = useId();
  const { groups } = data;
  const rail = layout === 'rail';
  const noArea = !data.create.allowed && data.create.reason === 'no_area';
  const when = (lastMessageAt?: string) => (lastMessageAt ? formatRelative(lastMessageAt, now) : t('noMessages'));

  const actions = <div className={cn('flex flex-wrap', rail ? 'mt-2.5 gap-1.5' : 'gap-2')}>
    <Button type="button" variant="outline" size={rail ? 'sm' : 'default'} className={rail ? undefined : 'min-h-11'} disabled={!data.create.allowed} onClick={(event) => controls.openDialog('create', event.currentTarget)}><Plus aria-hidden="true" />{t('create')}</Button>
    <Button type="button" variant="outline" size={rail ? 'sm' : 'default'} className={rail ? undefined : 'min-h-11'} onClick={(event) => controls.openDialog('join', event.currentTarget)}><KeyRound aria-hidden="true" />{t('join')}</Button>
  </div>;
  const limit = !data.create.allowed && data.create.reason === 'limit_reached' && <p className={cn('text-muted-foreground', rail ? 'mt-2 text-xs' : 'text-sm')}>{t('createsLeft', { count: 0 })}</p>;
  // A row's name is what it shows (its group, kind, place, people, last message) and what's unread, said in full.
  const marks = (group: NeighborGroupsData['groups'][number], size: string) => <>
    {group.role === 'admin' && <ShieldCheck aria-label={t('admin')} className={cn(size, 'shrink-0 text-muted-foreground')} />}
    {group.muted && <BellOff aria-label={t('muted')} className={cn(size, 'shrink-0 text-muted-foreground')} />}
    {group.unreadCount > 0 && <><Badge aria-hidden="true">{t('unread', { count: group.unreadCount })}</Badge><span className="sr-only">, {t('unreadLabel', { count: group.unreadCount })}</span></>}
  </>;

  if (rail) {
    return <section aria-labelledby={titleId} className="min-w-0 rounded-2xl border border-border bg-card p-3.5 shadow-card">
      <h2 id={titleId} className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><UsersRound aria-hidden="true" className="size-4 text-primary" />{t('title')}</h2>
      {groups.length === 0
        ? <p className="mt-2 text-[13px]/5 text-muted-foreground">{noArea ? t('noArea') : t('empty')}</p>
        : <ul className="mt-2 space-y-0.5">
            {groups.map((group) => <li key={group.id}>
              <button type="button" onClick={(event) => controls.openGroup(group.id, event.currentTarget)} className="group/row relative -mx-2 flex w-[calc(100%+1rem)] min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                <GroupKindIcon kind={group.kind} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block truncate text-sm font-medium group-hover/row:text-primary">{group.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{g('members', { count: group.memberCount })} · {when(group.lastMessageAt)}</span>
                </span>
                {marks(group, 'size-3.5')}
              </button>
            </li>)}
          </ul>}
      {actions}
      {limit}
    </section>;
  }

  return <section aria-labelledby={titleId} className="space-y-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UsersRound aria-hidden="true" className="size-5" /></span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <h2 id={titleId} className="font-display text-lg/7 font-semibold tracking-[-0.015em]">{t('title')}</h2>
        <p className="text-[14px]/[1.5] text-muted-foreground">{groups.length === 0 ? (noArea ? t('noArea') : t('empty')) : t('intro')}</p>
      </div>
    </div>
    {groups.length > 0 && <ul className="divide-y rounded-xl border">
      {groups.map((group) => <li key={group.id}>
        <button
          type="button"
          className="relative flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          onClick={(event) => controls.openGroup(group.id, event.currentTarget)}
        >
          <GroupKindIcon kind={group.kind} className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{group.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{g(`kinds.${group.kind}`)} · {group.areaName} · {g('members', { count: group.memberCount })} · {when(group.lastMessageAt)}</span>
          </span>
          {marks(group, 'size-4')}
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </li>)}
    </ul>}
    {actions}
    {limit}
  </section>;
}
