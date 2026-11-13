'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarDays, MapPin } from 'lucide-react';
import { routes, type ActionResult, type AvailabilityHandlers, type AvailabilityPostView, type AvailabilityStatus, type BadgeTone } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { AvailabilityPrice } from '@/ui/components/availability/availability-slot-summary';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

const tones: Record<AvailabilityStatus, BadgeTone> = { active: 'brand', held: 'warning', booked: 'info', expired: 'neutral', canceled: 'neutral' };

export function AvailabilityPostCard({ post, onCancel, initialConfirm = false, initialResult }: {
  post: AvailabilityPostView;
  onCancel: AvailabilityHandlers['onCancel'];
  initialConfirm?: boolean;
  initialResult?: ActionResult;
}) {
  const { formatDate, formatTimeRange } = useFormat();
  const t = useTranslations('availability');
  const categories = useTranslations('helperProfile.categories');
  const actions = useTranslations('actions');
  const router = useRouter();
  const [open, setOpen] = useState(initialConfirm);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(initialResult);
  const locked = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const disabled = pending || Boolean(result?.ok);

  async function cancel() {
    if (locked.current) return;
    locked.current = true; setPending(true); setResult(undefined);
    let next: ActionResult;
    try { next = await onCancel({ postId: post.id }); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = next.ok; setPending(false); setResult(next);
    if (next.ok) {
      setOpen(false);
      if (next.redirectTo) router.push(next.redirectTo); else router.refresh();
    }
  }

  const feedback = <FormFeedback result={result && !result.ok ? { ...result, fieldErrors: undefined } : result}
    successMessage={result?.ok && result.code === 'canceled' ? t('canceled') : undefined}
    errorMessage={result && !result.ok && result.code === 'not_allowed' ? t('errors.cancelNotAllowed') : undefined} />;
  return <article className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
    <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-display text-lg/6 font-semibold tracking-[-0.015em]">{categories(post.categorySlug)}</h3><StatusBadge label={t(`status.${post.status}`)} tone={tones[post.status]} /></div>
    <p className="flex items-start gap-2 tabular-nums"><CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><span>{t('slotWindow', { date: formatDate(post.start), times: formatTimeRange(post.start, post.end) })}</span></p>
    <AvailabilityPrice pricing={post.pricing} />
    <p className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 shrink-0" />{t('area', { name: post.areaName, radius: post.radiusMiles })}</p>
    {(post.request || post.bookingId) && <div className="flex flex-wrap gap-3 border-t pt-3">
      {post.request && <Link href={routes.app.offers(post.request.inviteId)} className={buttonVariants({ variant: 'outline', className: 'h-auto min-h-11 max-w-full whitespace-normal text-left' })}>{t('requestLink', { name: post.request.client.displayName })}</Link>}
      {post.bookingId && <Link href={routes.app.booking(post.bookingId)} className={buttonVariants({ variant: 'outline', className: 'h-auto min-h-11 max-w-full whitespace-normal text-left' })}>{post.request ? t('bookingLink', { name: post.request.client.displayName }) : t('bookingLinkWithoutClient')}</Link>}
    </div>}
    <div ref={feedbackRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{!open && feedback}</div>
    {post.actions.map((action) => <AlertDialog key={action} open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
      <AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={disabled}>{actions(action)}</Button></AlertDialogTrigger>
      <AlertDialogContent onCloseAutoFocus={(event) => { if (result?.ok) { event.preventDefault(); feedbackRef.current?.focus(); } }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('cancelTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{post.status === 'held' && post.request ? t('cancelHeldBody', { name: post.request.client.displayName }) : t('cancelBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm tabular-nums">{t('slotWindow', { date: formatDate(post.start), times: formatTimeRange(post.start, post.end) })}</p>
        {feedback}
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>{t('keep')}</AlertDialogCancel><Button type="button" variant="destructive" disabled={disabled} aria-busy={pending} onClick={() => { void cancel(); }}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'canceling' : 'cancelConfirm')}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>)}
  </article>;
}
