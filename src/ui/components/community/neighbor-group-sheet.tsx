'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Bell, BellOff, Copy, Link2, LogOut, ShieldCheck, UserMinus, X } from 'lucide-react';
import {
  type ActionResult,
  type NeighborGroupHandlers,
  type NeighborGroupInviteView,
  type NeighborGroupMemberView,
  type NeighborGroupView,
  type ThreadHandlers,
} from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { MessageComposerContent } from '@/ui/screens/messages/message-composer';
import { ReplyProvider } from '@/ui/screens/messages/reply-context';
import { useFormat } from '@/ui/lib/format';
import { useRealtime } from '@/ui/lib/realtime';
import { cn } from '@/ui/lib/utils';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/ui/primitives/sheet';
import { Spinner } from '@/ui/primitives/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';
import { GroupKindIcon } from './neighbor-group-dialogs';
import { NeighborGroupLog } from './neighbor-group-log';

export type NeighborGroupTab = 'chat' | 'members';
const failed = { ok: false as const, code: 'unknown' as const };
/** How long "typing…" stays after a member's last notice (they ping every 2.5 s while typing). */
const TYPING_SHOWN_MS = 6000;

/** Runs a handler, turning a throw into `unknown` (never assume success). */
async function run<T>(handler: (input: T) => Promise<ActionResult>, input: T): Promise<ActionResult> {
  try {
    return await handler(input);
  } catch {
    return failed;
  }
}

/**
 * A building or street group, open over Neighbors (2026-11-24): a bottom sheet on phones, a panel at the side on wide
 * screens, never a trip away. It loads when opened (`onOpen`, which also reads it) and again when a member writes
 * (the live `group.message` notice; while the tab is hidden it waits, so nothing reads as read unseen), and after
 * anything done in it. `initialView` is for previews.
 */
export function NeighborGroupSheet({ groupId, onClose, handlers, initialView, initialTab = 'chat' }: {
  groupId: string | null;
  /** `changed`: something here changed the list (read, left, muted), so the page refreshes it. */
  onClose: (changed: boolean) => void;
  handlers: NeighborGroupHandlers;
  initialView?: NeighborGroupView;
  initialTab?: NeighborGroupTab;
}) {
  const t = useTranslations('neighborGroups.group');
  const [view, setView] = useState<NeighborGroupView | null | undefined>(initialView);
  const [shownFor, setShownFor] = useState<string | null>(initialView ? initialView.group.id : null);
  const ticket = useRef(0);
  // A live notice that came while the tab was hidden: read the group once it's back in view.
  const staleWhileHidden = useRef(false);
  // A different group: start again (adjusted while rendering, not in an effect).
  if (groupId !== shownFor) {
    setShownFor(groupId);
    setView(undefined);
  }

  const load = async (id: string) => {
    const mine = ++ticket.current;
    let next: NeighborGroupView | null;
    try {
      next = await handlers.onOpen({ groupId: id });
    } catch {
      next = null;
    }
    if (mine === ticket.current) setView(next);
  };

  const loadSoon = useEffectEvent((id: string) => void load(id));
  useEffect(() => {
    if (!groupId || view !== undefined) return;
    // Deferred: never a state change straight from the effect.
    const timer = window.setTimeout(() => loadSoon(groupId), 0);
    return () => window.clearTimeout(timer);
  }, [groupId, view]);

  useEffect(() => {
    if (!groupId) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !staleWhileHidden.current) return;
      staleWhileHidden.current = false;
      loadSoon(groupId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [groupId]);

  useRealtime('update', (notice) => {
    if (notice.event !== 'group.message' || !groupId || notice.group !== groupId) return;
    // Reading the group reads it: not while nobody sees it (sweep 2026-11-24 C2's rule for conversations).
    if (document.visibilityState === 'hidden') {
      staleWhileHidden.current = true;
      return;
    }
    void load(groupId);
    // Not handled: the page refreshes too, for the bell and the list.
  });

  const title = view?.group.name ?? t('loading');
  return <Sheet open={groupId !== null} onOpenChange={(open) => { if (!open) onClose(true); }}>
    <SheetContent
      side="bottom"
      showCloseButton={false}
      className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 rounded-t-2xl p-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-dvh sm:w-full sm:max-w-lg sm:rounded-none sm:border-l"
    >
      {/* Loaded, the group's own heading names the sheet (`inSheet`). */}
      {!view && <SheetTitle className="sr-only">{title}</SheetTitle>}
      {!view && <SheetDescription className="sr-only">{t('loading')}</SheetDescription>}
      {view
        ? <NeighborGroupPanel key={view.group.id} view={view} handlers={handlers} initialTab={initialTab} inSheet onReload={() => groupId && load(groupId)} onClose={(changed) => onClose(changed)} />
        : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {view === null
            ? <>
              <p className="text-sm text-muted-foreground">{t('gone')}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={() => { if (groupId) { setView(undefined); } }}>{t('retry')}</Button>
                <Button type="button" className="min-h-11" onClick={() => onClose(true)}>{t('close')}</Button>
              </div>
            </>
            : <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t('loading')}</p>}
        </div>}
    </SheetContent>
  </Sheet>;
}

/**
 * Who is typing in the group now (2026-11-24): the live `typing` notices for it, each shown for a few seconds after the
 * last one, and gone once that member's message arrives. Names come from the group's members.
 */
function useGroupTyping(view: NeighborGroupView, seed: readonly string[] = []): string | null {
  const t = useTranslations('neighborGroups.group');
  const [typers, setTypers] = useState<Record<string, number>>(() => Object.fromEntries(seed.map((id) => [id, Number.POSITIVE_INFINITY])));
  useRealtime('typing', (notice) => {
    if (notice.group !== view.group.id || typeof notice.user !== 'string') return false;
    const user = notice.user;
    setTypers((current) => ({ ...current, [user]: Date.now() + TYPING_SHOWN_MS }));
    return true;
  });
  // Each one goes a few seconds after their last notice.
  useEffect(() => {
    const due = Object.values(typers).filter(Number.isFinite);
    if (due.length === 0) return;
    const timer = window.setTimeout(() => setTypers((current) => Object.fromEntries(Object.entries(current).filter(([, until]) => until > Date.now()))), Math.max(50, Math.min(...due) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [typers]);
  // Their message arrived: they stopped typing (adjusted while rendering).
  const last = view.messages.at(-1);
  const [seenLast, setSeenLast] = useState(last?.id);
  if (last?.id !== seenLast) {
    setSeenLast(last?.id);
    if (last && typers[last.author.userId] !== undefined) {
      const next = { ...typers };
      delete next[last.author.userId];
      setTypers(next);
    }
  }
  const names = Object.keys(typers).map((id) => view.members.find((member) => member.userId === id && !member.isYou)?.displayName ?? null);
  if (names.length === 0) return null;
  if (names.length === 1) return t('typingOne', { name: names[0] ?? t('someone') });
  if (names.length === 2 && names[0] && names[1]) return t('typingTwo', { first: names[0], second: names[1] });
  return t('typingMany');
}

/** The group itself: its header, the chat (newest at the bottom, the composer under it) and its members. */
export function NeighborGroupPanel({ view, handlers, initialTab = 'chat', inSheet = false, onReload, onClose, initialTyping }: {
  view: NeighborGroupView;
  handlers: NeighborGroupHandlers;
  initialTab?: NeighborGroupTab;
  /** Inside its sheet: its heading and line name the dialog. */
  inSheet?: boolean;
  onReload: () => void;
  onClose: (changed: boolean) => void;
  /** Previews: members shown typing. */
  initialTyping?: readonly string[];
}) {
  const t = useTranslations('neighborGroups.group');
  const kinds = useTranslations('neighborGroups.kinds');
  const [tab, setTab] = useState<NeighborGroupTab>(initialTab);
  const [muting, startMuting] = useTransition();
  // "New messages" stays where it was when the group opened, however often it's read again while open.
  const [unreadFrom] = useState(view.firstUnreadId);
  const typing = useGroupTyping(view, initialTyping);
  const { group, you } = view;
  const subtitle = t('subtitle', { kind: kinds(group.kind), area: group.areaName, count: group.memberCount });

  const toggleMute = () => startMuting(async () => {
    const result = await run(handlers.onMute, { groupId: group.id, muted: !you.muted });
    if (result.ok) {
      toast.success(t(you.muted ? 'unmutedToast' : 'mutedToast'));
      onReload();
    } else toast.error(t('retry'));
  });

  return <Tabs value={tab} onValueChange={(value) => setTab(value as NeighborGroupTab)} className="flex min-h-0 flex-1 flex-col gap-0">
    <header className="space-y-3 border-b px-4 pb-3 pt-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><GroupKindIcon kind={group.kind} className="size-5" /></span>
        <div className="min-w-0 flex-1">
          {/* A long name (up to 60 characters) takes two lines on a phone rather than a few letters and "…". */}
          {inSheet
            ? <SheetTitle className="line-clamp-2 text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{group.name}</SheetTitle>
            : <h2 className="line-clamp-2 text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{group.name}</h2>}
          {/* "typing…" takes the group's line while it lasts (as in a conversation's header), in the same cell, so the
              header keeps its height whichever shows. */}
          <div className="grid min-w-0">
            {inSheet
              ? <SheetDescription className={cn('col-start-1 row-start-1 text-sm text-muted-foreground', typing && 'invisible')}>{subtitle}</SheetDescription>
              : <p className={cn('col-start-1 row-start-1 text-sm text-muted-foreground', typing && 'invisible')}>{subtitle}</p>}
            <p aria-live="polite" className="col-start-1 row-start-1 flex min-w-0 items-start gap-1.5 text-sm font-medium text-primary">
              {typing && <><span aria-hidden="true" className="mt-2 inline-flex shrink-0 gap-0.5">{[0, 1, 2].map((dot) => <span key={dot} className="size-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: `${dot * 150}ms` }} />)}</span><span className="min-w-0">{typing}</span></>}
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-pressed={you.muted} aria-label={t(you.muted ? 'unmute' : 'mute')} disabled={muting} onClick={toggleMute}>
          {muting ? <Spinner aria-hidden="true" /> : you.muted ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={t('close')} onClick={() => onClose(true)}><X aria-hidden="true" /></Button>
      </div>
      <TabsList className="w-full">
        <TabsTrigger value="chat" className="min-h-10 flex-1">{t('tabs.chat')}</TabsTrigger>
        <TabsTrigger value="members" className="min-h-10 flex-1">{t('tabs.members')}</TabsTrigger>
      </TabsList>
    </header>
    {/* Photos dropped anywhere on the chat attach to the message (the composer's drop area). */}
    <TabsContent value="chat" data-drop-photos="" className="relative flex min-h-0 flex-1 flex-col bg-card">
      <ReplyProvider>
        <NeighborGroupLog view={view} handlers={handlers} {...(unreadFrom ? { unreadFrom } : {})} onChanged={onReload} onReport={() => onClose(false)} className="min-h-0 flex-1" />
        {you.canSend
          ? <GroupComposer view={view} handlers={handlers} onSent={onReload} />
          : <p role="status" className="border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground">{t('cantSend')}</p>}
      </ReplyProvider>
    </TabsContent>
    <TabsContent value="members" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <GroupMembers view={view} handlers={handlers} onReload={onReload} onLeft={() => onClose(true)} />
    </TabsContent>
  </Tabs>;
}

/**
 * The group's message box: the conversation's own composer (2026-11-24), so writing feels the same everywhere: photos by
 * the paperclip, a drop or a paste; GIFs where they're on; a reply to the message picked in the log; "typing…" for the
 * others. Its sends go to the group.
 */
function GroupComposer({ view, handlers, onSent }: { view: NeighborGroupView; handlers: NeighborGroupHandlers; onSent: () => void }) {
  const t = useTranslations('neighborGroups.group');
  const groupId = view.group.id;
  const { onSend, onUploadPhoto, onTyping, onSearchGifs, onAttachGif } = handlers;
  const composerHandlers = useMemo<ThreadHandlers>(() => ({
    onSend: (input) => onSend({ groupId, body: input.body, attachmentIds: input.attachmentIds, ...(input.replyToId ? { replyToId: input.replyToId } : {}), ...(input.requestKey ? { requestKey: input.requestKey } : {}) }),
    onUploadPhoto,
    ...(onTyping ? { onTyping: () => onTyping({ groupId }) } : {}),
    ...(onSearchGifs && onAttachGif ? { onSearchGifs, onAttachGif } : {}),
  }), [groupId, onSend, onUploadPhoto, onTyping, onSearchGifs, onAttachGif]);
  const rules = { canSend: true, ...view.composer };
  // Named for the group; its placeholder stays the conversation's short "Message" (the box sizes to it).
  return <MessageComposerContent rules={rules} handlers={composerHandlers} onRefresh={onSent} label={t('messageLabel', { name: view.group.name })} />;
}

function GroupMembers({ view, handlers, onReload, onLeft }: { view: NeighborGroupView; handlers: NeighborGroupHandlers; onReload: () => void; onLeft: () => void }) {
  const t = useTranslations('neighborGroups.people');
  const g = useTranslations('neighborGroups.group');
  const [leaving, setLeaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const { group, you } = view;
  const last = view.members.length <= 1;
  const leave = () => startTransition(async () => {
    const result = await run(handlers.onLeave, { groupId: group.id });
    if (result.ok) {
      toast.success(g('left', { group: group.name }));
      setLeaving(false);
      onLeft();
    } else toast.error(g('retry'));
  });

  return <div className="space-y-6">
    <GroupInvites view={view} handlers={handlers} onReload={onReload} />
    <section aria-labelledby={`${group.id}-members`} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={`${group.id}-members`} className="text-base font-semibold">{t('title')}</h3>
        <p className="text-sm text-muted-foreground">{t('count', { count: view.members.length, limit: view.memberLimit })}</p>
      </div>
      <ul className="divide-y rounded-xl border">
        {view.members.map((member) => <GroupMember key={member.userId} member={member} groupId={group.id} onRemove={handlers.onRemoveMember} onRemoved={onReload} />)}
      </ul>
    </section>
    <div className="space-y-2">
      <Button type="button" variant="outline" className="min-h-11 w-full text-destructive" onClick={() => setLeaving(true)}><LogOut aria-hidden="true" />{g('leave')}</Button>
    </div>
    <AlertDialog open={leaving} onOpenChange={(open) => { if (!pending) setLeaving(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{g('leaveTitle', { group: group.name })}</AlertDialogTitle>
          <AlertDialogDescription>{last ? g('leaveLast') : you.role === 'admin' ? `${g('leaveDescription')} ${g('leaveAdmin')}` : g('leaveDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{g('cancel')}</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={pending} aria-busy={pending} onClick={leave}>{pending && <Spinner aria-hidden="true" />}{g('leaveConfirm')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function GroupMember({ member, groupId, onRemove, onRemoved }: { member: NeighborGroupMemberView; groupId: string; onRemove: NeighborGroupHandlers['onRemoveMember']; onRemoved: () => void }) {
  const t = useTranslations('neighborGroups.people');
  const g = useTranslations('neighborGroups.group');
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const remove = () => startTransition(async () => {
    const result = await run(onRemove, { groupId, userId: member.userId });
    if (result.ok) {
      toast.success(t('removed', { name: member.displayName }));
      setConfirming(false);
      onRemoved();
    } else toast.error(g('retry'));
  });

  return <li className="flex items-center gap-3 px-3 py-2">
    <InitialsAvatar initials={member.initials} size="sm" {...(member.photo ? { photo: member.photo } : {})} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{member.displayName}{member.isYou && <span className="text-muted-foreground"> ({t('you')})</span>}</p>
      {member.areaName && <p className="truncate text-xs text-muted-foreground">{member.areaName}</p>}
    </div>
    {member.role === 'admin' && <Badge variant="secondary" className="gap-1"><ShieldCheck aria-hidden="true" className="size-3" />{t('admin')}</Badge>}
    {member.canRemove && <Button type="button" variant="ghost" size="sm" className="min-h-11" aria-label={t('removeLabel', { name: member.displayName })} onClick={() => setConfirming(true)}><UserMinus aria-hidden="true" />{t('remove')}</Button>}
    {member.canRemove && <AlertDialog open={confirming} onOpenChange={(open) => { if (!pending) setConfirming(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('removeTitle', { name: member.displayName })}</AlertDialogTitle>
          <AlertDialogDescription>{t('removeDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{g('cancel')}</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={pending} aria-busy={pending} onClick={remove}>{pending && <Spinner aria-hidden="true" />}{t('removeConfirm')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </li>;
}

function GroupInvites({ view, handlers, onReload }: { view: NeighborGroupView; handlers: NeighborGroupHandlers; onReload: () => void }) {
  const t = useTranslations('neighborGroups.invites');
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const make = () => startTransition(async () => {
    let next;
    try {
      next = await handlers.onInvite({ groupId: view.group.id });
    } catch {
      next = failed;
    }
    if (next.ok) {
      setResult(undefined);
      onReload();
    } else setResult({ ok: false, code: next.code });
  });

  return <section aria-labelledby={`${view.group.id}-invites`} className="space-y-3">
    <div className="space-y-1">
      <h3 id={`${view.group.id}-invites`} className="text-base font-semibold">{t('title')}</h3>
      <p className="text-sm text-muted-foreground">{t('intro', { area: view.group.areaName })}</p>
    </div>
    {view.canInvite
      ? <Button type="button" className="min-h-11" disabled={pending} aria-busy={pending} onClick={make}>{pending ? <Spinner aria-hidden="true" /> : <Link2 aria-hidden="true" />}{t(pending ? 'making' : 'make')}</Button>
      : <p className="text-sm text-muted-foreground">{t('full')}</p>}
    <FormFeedback result={result} />
    {view.invites.length > 0 && <ul className="space-y-2">{view.invites.map((invite) => <GroupInvite key={invite.id} invite={invite} onRevoke={handlers.onRevokeInvite} onRevoked={onReload} />)}</ul>}
  </section>;
}

function GroupInvite({ invite, onRevoke, onRevoked }: { invite: NeighborGroupInviteView; onRevoke: NeighborGroupHandlers['onRevokeInvite']; onRevoked: () => void }) {
  const t = useTranslations('neighborGroups.invites');
  const g = useTranslations('neighborGroups.group');
  const { formatDateTime } = useFormat();
  const [pending, startTransition] = useTransition();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  };
  const revoke = () => startTransition(async () => {
    const result = await run(onRevoke, { inviteId: invite.id });
    if (result.ok) {
      toast.success(t('revoked'));
      onRevoked();
    } else toast.error(g('retry'));
  });

  return <li className="space-y-2 rounded-xl border bg-muted/30 p-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="font-mono text-base font-semibold tracking-wider">{t('code', { code: invite.code })}</p>
      <p className="text-xs text-muted-foreground">{t('expires', { date: formatDateTime(invite.expiresAt) })} · {t('by', { name: invite.createdBy })}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void copy(new URL(invite.href, window.location.origin).toString())}><Link2 aria-hidden="true" />{t('copyLink')}</Button>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void copy(invite.code)}><Copy aria-hidden="true" />{t('copyCode')}</Button>
      {invite.canRevoke && <Button type="button" variant="ghost" size="sm" className="min-h-11 text-destructive" disabled={pending} aria-busy={pending} aria-label={t('revokeLabel', { code: invite.code })} onClick={revoke}>{pending && <Spinner aria-hidden="true" />}{t('revoke')}</Button>}
    </div>
  </li>;
}
