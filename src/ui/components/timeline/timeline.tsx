import { ChevronDown, CircleCheck, CircleUserRound, Headphones, Settings2 } from 'lucide-react';
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

/**
 * What happened, oldest first, each with who did it. `collapsible`: folded under its title and count until opened
 * (the booking page, where it's history rather than the next step: audit M29).
 */
export function Timeline({ events, collapsible = false }: { events: TimelineEvent[]; collapsible?: boolean }) {
  const { formatDateTime, formatTime } = useFormat();
  const t = useTranslations('timeline');
  const title = <h2 className={cn('font-heading text-xl/7 font-semibold tracking-[-0.015em]', !collapsible && 'mb-6')}>{t('title')}</h2>;
  const list = events.length === 0 ? <p className={cn('text-muted-foreground', collapsible && 'mt-4')}>{t('empty')}</p> : (
        <ol className={cn('space-y-0', collapsible && 'mt-6')}>
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
      );
  if (collapsible) {
    return (
      <details className="group/timeline min-w-0">
        <summary className="-m-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-2 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          {title}
          <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
            {t('count', { count: events.length })}
            <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200 group-open/timeline:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        {list}
      </details>
    );
  }
  return (
    <section aria-label={t('title')} className="min-w-0">
      {title}
      {list}
    </section>
  );
}
