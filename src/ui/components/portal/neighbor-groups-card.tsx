'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BellOff, ChevronRight, KeyRound, Plus, ShieldCheck, UsersRound } from 'lucide-react';
import type { NeighborGroupHandlers, NeighborGroupsData, NeighborGroupView } from '@/contracts';
import { CreateGroupDialog, GroupKindIcon, JoinGroupDialog } from '@/ui/components/community/neighbor-group-dialogs';
import { NeighborGroupSheet, type NeighborGroupTab } from '@/ui/components/community/neighbor-group-sheet';
import { useFormat } from '@/ui/lib/format';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';

/**
 * "Your groups" on Neighbors (2026-11-24): the viewer's building and street groups with what's unread, "Create a group"
 * and "Join with a code". Each opens over the page (the group's sheet, the dialogs), never a trip away. The page's
 * address can open one (`openGroupId`, from a notification) or an invite (`invite`, from its link).
 * `initialView`, `initialTab` and `initialDialog` are for previews.
 */
export function NeighborGroupsCard({ data, handlers, now, initialView, initialTab, initialDialog }: {
  data: NeighborGroupsData;
  handlers: NeighborGroupHandlers;
  now: string;
  initialView?: NeighborGroupView;
  initialTab?: NeighborGroupTab;
  initialDialog?: 'create' | 'join';
}) {
  const t = useTranslations('neighborGroups.card');
  const g = useTranslations('neighborGroups');
  const j = useTranslations('neighborGroups.join');
  const c = useTranslations('neighborGroups.create');
  const { formatRelative } = useFormat();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(initialView?.group.id ?? data.openGroupId ?? null);
  const [tab, setTab] = useState<NeighborGroupTab>(initialTab ?? 'chat');
  const [dialog, setDialog] = useState<'create' | 'join' | null>(initialDialog ?? (data.invite ? 'join' : null));
  const returnFocus = useRef<HTMLElement | null>(null);
  const { groups } = data;
  const noArea = !data.create.allowed && data.create.reason === 'no_area';

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

  return <section aria-labelledby="neighbor-groups-title" className="space-y-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UsersRound aria-hidden="true" className="size-5" /></span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <h2 id="neighbor-groups-title" className="font-display text-lg/7 font-semibold tracking-[-0.015em]">{t('title')}</h2>
        <p className="text-[14px]/[1.5] text-muted-foreground">{groups.length === 0 ? (noArea ? t('noArea') : t('empty')) : t('intro')}</p>
      </div>
    </div>
    {groups.length > 0 && <ul className="divide-y rounded-xl border">
      {groups.map((group) => <li key={group.id}>
        <button
          type="button"
          className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          aria-label={`${t('open', { name: group.name })}${group.unreadCount > 0 ? `, ${t('unreadLabel', { count: group.unreadCount })}` : ''}`}
          onClick={(event) => { returnFocus.current = event.currentTarget; open(group.id); }}
        >
          <GroupKindIcon kind={group.kind} className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{group.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {g(`kinds.${group.kind}`)} · {group.areaName} · {g('members', { count: group.memberCount })}
              {group.lastMessageAt ? ` · ${formatRelative(group.lastMessageAt, now)}` : ` · ${t('noMessages')}`}
            </span>
          </span>
          {group.role === 'admin' && <ShieldCheck aria-label={t('admin')} className="size-4 shrink-0 text-muted-foreground" />}
          {group.muted && <BellOff aria-label={t('muted')} className="size-4 shrink-0 text-muted-foreground" />}
          {group.unreadCount > 0 && <Badge aria-hidden="true">{t('unread', { count: group.unreadCount })}</Badge>}
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </li>)}
    </ul>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={!data.create.allowed} onClick={(event) => { returnFocus.current = event.currentTarget; setDialog('create'); }}><Plus aria-hidden="true" />{t('create')}</Button>
      <Button type="button" variant="outline" className="min-h-11" onClick={(event) => { returnFocus.current = event.currentTarget; setDialog('join'); }}><KeyRound aria-hidden="true" />{t('join')}</Button>
    </div>
    {!data.create.allowed && data.create.reason === 'limit_reached' && <p className="text-sm text-muted-foreground">{t('createsLeft', { count: 0 })}</p>}
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
  </section>;
}
