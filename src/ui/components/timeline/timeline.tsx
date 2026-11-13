import { CircleCheck, CircleUserRound, Headphones, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TimelineActor, TimelineEvent } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

const actorIcons = { poster: CircleUserRound, helper: CircleCheck, support: Headphones, system: Settings2 } satisfies Record<TimelineActor, typeof CircleCheck>;

/** Who did it, at a glance: each kind of actor has its own soft tint. */
const actorTints: Record<TimelineActor, string> = {
  poster: 'bg-primary/10 text-primary',
  helper: 'bg-success/12 text-success',
  support: 'bg-info/12 text-info',
  system: 'bg-foreground/[0.06] text-muted-foreground',
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const { formatDateTime, formatTime } = useFormat();
  const t = useTranslations('timeline');
  return (
    <section aria-label={t('title')} className="min-w-0">
      <h2 className="mb-6 font-heading text-xl/7 font-semibold tracking-[-0.015em]">{t('title')}</h2>
      {events.length === 0 ? <p className="text-muted-foreground">{t('empty')}</p> : (
        <ol className="space-y-0">
          {events.map((event, index) => {
            const Icon = actorIcons[event.actor];
            const params = event.params;
            const label = t(event.type, {
              hasAmount: params?.amountCents !== undefined ? 'yes' : 'no', amount: params?.amountCents !== undefined ? formatMoney(params.amountCents) : '',
              hasMinutes: params?.minutes !== undefined ? 'yes' : 'no', minutes: params?.minutes ?? 0,
              hasHours: params?.hours !== undefined ? 'yes' : 'no', hours: params?.hours !== undefined ? formatHours(params.hours) : '',
              hasTime: params?.at !== undefined ? 'yes' : 'no', time: params?.at !== undefined ? formatTime(params.at) : '',
            });
            return (
              <li key={event.id} className="relative flex min-w-0 gap-4 pb-6 last:pb-0">
                {index < events.length - 1 && <span aria-hidden="true" className="absolute top-10 bottom-1 left-[17px] w-px rounded-full bg-gradient-to-b from-foreground/15 to-foreground/[0.05]" />}
                <span aria-hidden="true" className={cn('relative flex size-9 shrink-0 items-center justify-center rounded-full ring-4 ring-card', actorTints[event.actor])}><Icon className="size-4" /></span>
                <div className="min-w-0 pt-1">
                  <p className="break-words font-medium text-pretty">{label}</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-sm text-muted-foreground">
                    <span>{event.actorName ?? t(`actors.${event.actor}`)}</span>
                    <span aria-hidden="true" className="text-foreground/25">·</span>
                    <time dateTime={event.at} className="tabular-nums">{formatDateTime(event.at)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
