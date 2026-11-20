'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EllipsisVertical, Flag, Pin, PinOff, ShieldAlert, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionErrorCode, ActionHandler, ActionResult, CommunityModerationInput } from '@/contracts';
import { useLocale } from 'next-intl';
import { localeHref } from '@/ui/lib/locale-link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';
import { Textarea } from '@/ui/primitives/textarea';

export interface CommunityItemActionsProps {
  target: 'post' | 'reply';
  id: string;
  /** What it's about, for the menu's accessible name. */
  label: string;
  own: boolean;
  /** The post's author pins an answer (a reply only). */
  pin?: { pinned: boolean; onPin: ActionHandler<{ replyId: string | null }> };
  onDelete: ActionHandler<{ target: 'post' | 'reply'; id: string }>;
  /** Someone else's: report it. */
  reportHref?: string;
  /** Staff: hide, remove or restore with a reason. */
  onModerate?: ActionHandler<{ target: 'post' | 'reply'; id: string } & CommunityModerationInput>;
  hidden?: boolean;
  /** Copy for error codes that mean something specific here (a question's restore: `limit_reached`). */
  errorMessages?: Partial<Record<ActionErrorCode, string>>;
}

/** The "More" menu on a post or a reply (completion plan 7.7): pin, delete your own, report, and staff tools. */
export function CommunityItemActions({ target, id, label, own, pin, onDelete, reportHref, onModerate, hidden = false, errorMessages }: CommunityItemActionsProps) {
  const t = useTranslations('community');
  const feedback = useTranslations('feedback');
  const router = useRouter();
  const locale = useLocale();
  const formId = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moderate, setModerate] = useState<CommunityModerationInput['action'] | null>(null);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  const run = (call: () => Promise<ActionResult>, success: string, done?: () => void) => startTransition(async () => {
    let result: ActionResult;
    try {
      result = await call();
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    if (result.ok) {
      toast.success(success);
      done?.();
      if (result.redirectTo) router.push(localeHref(result.redirectTo, locale));
    } else toast.error(errorMessages?.[result.code] ?? (feedback.has(`error.${result.code}`) ? feedback(`error.${result.code}`) : feedback('error.unknown')));
  });

  const hasItems = Boolean(pin) || own || Boolean(reportHref) || Boolean(onModerate);
  if (!hasItems) return null;
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={pending} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
          <EllipsisVertical aria-hidden="true" className="size-4" /><span className="sr-only">{t('more')}: {label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {pin && <DropdownMenuItem onSelect={() => run(() => pin.onPin({ replyId: pin.pinned ? null : id }), t(pin.pinned ? 'feedback.unpinned' : 'feedback.pinned'))}>
          {pin.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}{t(pin.pinned ? 'unpin' : 'pin')}
        </DropdownMenuItem>}
        {own && <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" />{t('delete')}</DropdownMenuItem>}
        {reportHref && <DropdownMenuItem onSelect={() => router.push(localeHref(reportHref, locale))}><Flag aria-hidden="true" />{t('report')}</DropdownMenuItem>}
        {onModerate && <>
          <DropdownMenuSeparator />
          {hidden
            ? <DropdownMenuItem onSelect={() => setModerate('restore')}><ShieldAlert aria-hidden="true" />{t('moderation.restore')}</DropdownMenuItem>
            : <>
              <DropdownMenuItem onSelect={() => setModerate('hide')}><ShieldAlert aria-hidden="true" />{t('moderation.hide')}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setModerate('remove')}><ShieldAlert aria-hidden="true" />{t('moderation.remove')}</DropdownMenuItem>
            </>}
        </>}
      </DropdownMenuContent>
    </DropdownMenu>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => run(() => onDelete({ target, id }), t('feedback.deleted'), () => setConfirmDelete(false))}>{t('deleteConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {onModerate && <Dialog open={moderate !== null} onOpenChange={(open) => !open && setModerate(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{moderate ? t(`moderation.${moderate}`) : ''}</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <form id={formId} className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          if (!moderate || reason.trim().length < 5) return;
          run(() => onModerate({ target, id, action: moderate, reason }), t('feedback.moderated'), () => { setModerate(null); setReason(''); });
        }}>
          <label htmlFor={`${formId}-reason`} className="text-sm font-medium">{t('moderation.reasonLabel')}</label>
          <Textarea id={`${formId}-reason`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} required rows={3} />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setModerate(null)}>{t('cancel')}</Button>
          <Button type="submit" form={formId} disabled={pending || reason.trim().length < 5} variant={moderate === 'remove' ? 'destructive' : 'default'}>{t('moderation.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </>;
}
