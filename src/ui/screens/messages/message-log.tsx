'use client';

import Image from 'next/image';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ISODateTime, MessageView, PersonSummary, Photo } from '@/contracts';
import { formatDate, formatDateTime, formatHours, formatMoney, formatRelative, formatTime, marketDayKey } from '@/shared/format';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { cn } from '@/ui/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';

function MessagePhoto({ photo, number, count, sender }: { photo: Photo; number: number; count: number; sender: string }) {
  const t = useTranslations('thread');
  const alt = photo.alt || t('photoAlt', { number, count, name: sender });
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" aria-label={t('openPhoto', { description: alt })} className="group w-full overflow-hidden rounded-lg border bg-card text-left text-foreground transition-colors hover:bg-accent">
        <Image src={photo.src} alt={alt} width={photo.width} height={photo.height} unoptimized className="aspect-4/3 h-auto w-full object-cover" />
        <span className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm font-medium">{t('viewPhoto')}<Expand aria-hidden="true" className="size-4 shrink-0 text-primary" /></span>
      </button>
    </DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-reading max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
      <DialogHeader><DialogTitle>{t('photoTitle', { number, count })}</DialogTitle><DialogDescription>{alt}</DialogDescription></DialogHeader>
      <Image src={photo.src} alt={alt} width={photo.width} height={photo.height} unoptimized className="h-auto max-h-[60dvh] w-full rounded-lg object-contain" />
    </DialogContent>
  </Dialog>;
}

function MessageContent({ message }: { message: MessageView }) {
  const timeline = useTranslations('timeline');
  if (message.kind === 'text' || !message.event) return <MaskedText segments={message.segments} />;
  const params = message.event.params;
  return <>{timeline(message.event.type, {
    hasAmount: params?.amountCents !== undefined ? 'yes' : 'no', amount: params?.amountCents !== undefined ? formatMoney(params.amountCents) : '',
    hasMinutes: params?.minutes !== undefined ? 'yes' : 'no', minutes: params?.minutes ?? 0,
    hasHours: params?.hours !== undefined ? 'yes' : 'no', hours: params?.hours !== undefined ? formatHours(params.hours) : '',
    hasTime: params?.at !== undefined ? 'yes' : 'no', time: params?.at !== undefined ? formatTime(params.at) : '',
  })}</>;
}

/** Refresh preserves draft state; only readers already at the bottom follow incoming messages. */
export function MessageLog({ messages, otherParty, now, className }: { messages: MessageView[]; otherParty: PersonSummary; now: ISODateTime; className?: string }) {
  const t = useTranslations('thread');
  const router = useRouter();
  const logRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const scrollTop = useRef(0);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = atBottom.current ? log.scrollHeight : scrollTop.current;
  }, [messages]);

  const days = new Map<string, MessageView[]>();
  for (const message of messages) {
    const key = marketDayKey(message.createdAt);
    const day = days.get(key) ?? [];
    day.push(message);
    days.set(key, day);
  }

  return <div ref={logRef} role="log" aria-label={t('log')} aria-live="polite" aria-relevant="additions text" tabIndex={0}
    onScroll={(event) => {
      const log = event.currentTarget;
      atBottom.current = log.scrollHeight - log.scrollTop - log.clientHeight <= 40;
      scrollTop.current = log.scrollTop;
    }}
    className={cn('h-[min(60dvh,36rem)] min-h-64 space-y-6 overflow-y-auto overscroll-contain rounded-xl border bg-card p-3 shadow-card [overflow-anchor:none] sm:p-5', className)}>
    {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>}
    {Array.from(days, ([day, entries]) => <section key={day} aria-label={formatDate(entries[0]!.createdAt, { withYear: true })} className="space-y-4">
      <h2 className="sticky top-0 z-10 mx-auto w-fit rounded-full border bg-card px-3 py-1 text-center text-sm font-medium text-muted-foreground"><time dateTime={day}>{formatDate(entries[0]!.createdAt, { withYear: true })}</time></h2>
      <ol className="space-y-4">
        {entries.map((message) => {
          const sender = message.sender === 'me' ? t('you') : message.sender === 'them' ? otherParty.displayName : t('system');
          const isNotice = message.kind !== 'text';
          return <li key={message.id} className={cn('flex min-w-0', isNotice ? 'justify-center' : message.sender === 'me' ? 'justify-end' : 'justify-start')}>
            <article className={cn('min-w-0 space-y-2 [overflow-wrap:anywhere]', isNotice ? 'max-w-full px-2 py-2 text-center text-sm text-muted-foreground' : 'max-w-[90%] rounded-xl border p-3 sm:max-w-[80%] sm:p-4', !isNotice && (message.sender === 'me' ? 'border-secondary bg-secondary text-secondary-foreground' : 'bg-background'))}>
              <p className={cn('text-sm font-semibold', isNotice && 'sr-only')}>{sender}</p>
              <p className={cn(isNotice ? 'text-sm' : 'text-base leading-6')}><MessageContent message={message} /></p>
              {message.attachments.length > 0 && <ul aria-label={t('photos')} className="grid max-w-96 grid-cols-1 gap-3 sm:grid-cols-2">
                {message.attachments.map((photo, index) => <li key={photo.id} className="min-w-0"><MessagePhoto photo={photo} number={index + 1} count={message.attachments.length} sender={sender} /></li>)}
              </ul>}
              <time dateTime={message.createdAt} title={formatRelative(message.createdAt, now)} className="block text-sm text-muted-foreground tabular-nums"><span aria-hidden="true">{formatTime(message.createdAt)}</span><span className="sr-only">{formatDateTime(message.createdAt)}</span></time>
            </article>
          </li>;
        })}
      </ol>
    </section>)}
  </div>;
}
