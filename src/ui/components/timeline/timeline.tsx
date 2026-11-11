import { CircleCheck, CircleUserRound, Headphones, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TimelineActor, TimelineEvent } from '@/contracts';
import { formatDateTime, formatHours, formatMoney, formatTime } from '@/shared/format';

const actorIcons = { poster: CircleUserRound, helper: CircleCheck, support: Headphones, system: Settings2 } satisfies Record<TimelineActor, typeof CircleCheck>;

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const t = useTranslations('timeline');
  return (
    <section aria-label={t('title')} className="min-w-0">
      <h2 className="mb-6 font-heading text-xl font-semibold">{t('title')}</h2>
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
                {index < events.length - 1 && <span aria-hidden="true" className="absolute top-9 bottom-0 left-[17px] w-px bg-border" />}
                <span aria-hidden="true" className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Icon className="size-4" /></span>
                <div className="min-w-0 pt-1">
                  <p className="break-words font-medium">{label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{event.actorName ?? t(`actors.${event.actor}`)}</p>
                  <time dateTime={event.at} className="mt-1 block text-sm text-muted-foreground tabular-nums">{formatDateTime(event.at)}</time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
