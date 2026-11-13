'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { type InviteHandlers, type InviteView, type ISODateTime } from '@/contracts';
import { formatDateTime } from '@/shared/format';
import { InviteCard } from '@/ui/components/invites/invite-card';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useInviteStatus } from '@/ui/components/status/use-status';
import { Button } from '@/ui/primitives/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/primitives/sheet';

function InviteStatus({ invite }: { invite: InviteView }) {
  return <StatusBadge {...useInviteStatus(invite.status, invite.viewerRole, invite.helper.displayName)} />;
}

export function MyInvites({ invites, openInviteId, handlers, now }: {
  invites: InviteView[];
  openInviteId?: string;
  handlers: InviteHandlers;
  now: ISODateTime;
}) {
  const t = useTranslations('myOffers');
  const [selectedId, setSelectedId] = useState(openInviteId);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const selected = invites.find((invite) => invite.id === selectedId);

  return <section aria-labelledby="my-invites-title" className="space-y-4">
    <h2 id="my-invites-title" className="font-display text-xl font-semibold md:text-[22px]/7.5 tracking-[-0.015em]">{t('invites.title')}</h2>
    {invites.length ? <ul className="space-y-3">
      {/* The contract supplies open invites first; retain its ordering. */}
      {invites.map((invite) => <li key={`${invite.id}-${invite.status}`} className="flex min-w-0 flex-wrap items-center gap-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.06]">
        <InitialsAvatar initials={invite.client.initials} />
        <div className="min-w-0 flex-1 basis-40 space-y-1">
          <h3 className="break-words font-display text-[17px]/6 font-semibold tracking-[-0.015em]">{invite.task.title}</h3>
          <p className="text-sm text-muted-foreground">{t('invites.from', { name: invite.client.displayName })}</p>
          <p className="text-sm tabular-nums"><time dateTime={invite.counter?.start ?? invite.terms.start}>{formatDateTime(invite.counter?.start ?? invite.terms.start)}</time></p>
          <InviteStatus invite={invite} />
        </div>
        <Button type="button" variant="outline" aria-label={t('invites.openLabel', { title: invite.task.title })} ref={invite.id === openInviteId ? returnFocus : undefined} onClick={(event) => { returnFocus.current = event.currentTarget; setSelectedId(invite.id); }}>{t('invites.open')}</Button>
      </li>)}
    </ul> : <p className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 text-sm text-muted-foreground dark:border-white/[0.06]">{t('invites.empty')}</p>}
    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(undefined); }}>
      <SheetContent side="bottom" className="max-h-[90dvh] rounded-t-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-dvh sm:w-full sm:max-w-xl sm:rounded-none sm:border-l" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }}>
        <SheetHeader><SheetTitle>{t('invites.sheetTitle')}</SheetTitle><SheetDescription>{t('invites.sheetDescription')}</SheetDescription></SheetHeader>
        <div className="min-h-0 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {selected && <InviteCard key={selected.id} invite={selected} handlers={handlers} now={now} headingLevel={3} />}
        </div>
      </SheetContent>
    </Sheet>
  </section>;
}
