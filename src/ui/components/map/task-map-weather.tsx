'use client';

import { use } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudHail, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Haze, Moon, Sun, Sunset, TriangleAlert, Wind, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TaskWeather, WeatherCondition, WeatherWeight } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

const ICONS: Readonly<Record<WeatherCondition, LucideIcon>> = {
  clear: Sun,
  'partly-cloudy': CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  showers: CloudRain,
  thunderstorm: CloudLightning,
  snow: CloudSnow,
  sleet: CloudHail,
  wind: Wind,
  haze: Haze,
};

/** At night a clear or partly cloudy sky shows the moon. */
const NIGHT_ICONS: Readonly<Partial<Record<WeatherCondition, LucideIcon>>> = { clear: Moon, 'partly-cloudy': CloudMoon };

/**
 * The weather for the task's time (task-map-panel.tsx): what it'll be like, hour by hour for outdoor work, what that
 * means for the work, sunset when the window runs late, and the National Weather Service's alerts. Indoor work gets the
 * short version; computer help, none.
 */
export function TaskMapWeather({ weather, weight, headingId }: { weather: Promise<TaskWeather>; weight: WeatherWeight; headingId: string }) {
  const result = use(weather);
  const t = useTranslations('taskMap.weather');
  const { formatTime, formatDate, locale, timeZone } = useFormat();
  if (weight === 'none' || result.status === 'past') return null;
  const heading = <h3 id={headingId} className="text-sm font-semibold">{t('title')}</h3>;
  if (result.status === 'unavailable') return <section aria-labelledby={headingId} className="space-y-1">{heading}<p className="text-sm text-muted-foreground">{t('unavailable')}</p></section>;
  if (result.status === 'later') {
    return <section aria-labelledby={headingId} className="space-y-1">
      {heading}
      <p className="text-sm text-muted-foreground">{t('later', { from: formatDate(result.availableFrom) })}</p>
      <Alerts alerts={result.alerts} />
    </section>;
  }
  const { summary, hours } = result;
  const Icon = (hours[0]?.isDaytime ?? true) ? ICONS[summary.condition] : (NIGHT_ICONS[summary.condition] ?? ICONS[summary.condition]);
  const hourLabel = new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone });
  const showHours = weight === 'high' && hours.length > 1;
  return <section aria-labelledby={headingId} className="space-y-3">
    {heading}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="flex items-center gap-2.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300"><Icon aria-hidden="true" className="size-6" /></span>
        <span className="min-w-0">
          <span className="block font-display text-xl leading-6 font-semibold tabular-nums">{summary.lowF === summary.highF ? t('single', { temp: summary.highF }) : t('range', { low: summary.lowF, high: summary.highF })}</span>
          <span className="block text-sm text-muted-foreground">{t(`conditions.${summary.condition}`)}</span>
        </span>
      </p>
      <ul className="flex flex-wrap gap-1.5 text-[13px] tabular-nums">
        <li className="rounded-full bg-secondary px-2.5 py-1">{t('rain', { chance: summary.rainChanceMax })}</li>
        {summary.feelsLikeMaxF !== undefined && <li className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-800 dark:text-amber-300">{t('feelsLike', { temp: summary.feelsLikeMaxF })}</li>}
        {summary.feelsLikeMinF !== undefined && <li className="rounded-full bg-sky-500/10 px-2.5 py-1 text-sky-800 dark:text-sky-300">{t('feelsLike', { temp: summary.feelsLikeMinF })}</li>}
        {summary.windMaxMph >= 15 && <li className="rounded-full bg-secondary px-2.5 py-1">{t('wind', { mph: summary.windMaxMph })}</li>}
        {result.sunset && <li className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1"><Sunset aria-hidden="true" className="size-3.5" />{t('sunset', { time: formatTime(result.sunset) })}</li>}
      </ul>
    </div>
    {showHours && <div className="-mx-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
      <ol aria-label={t('hourly')} className="flex min-w-max gap-1 px-1">
        {hours.map((hour) => {
          const HourIcon = hour.isDaytime ? ICONS[hour.condition] : (NIGHT_ICONS[hour.condition] ?? ICONS[hour.condition]);
          return <li key={hour.at} className="flex w-14 shrink-0 flex-col items-center gap-1 rounded-2xl bg-secondary/60 px-1 py-2 text-center dark:bg-secondary/30">
            <span className="sr-only">{t('hour', { time: formatTime(hour.at), temp: hour.tempF, condition: t(`conditions.${hour.condition}`), chance: hour.rainChance })}</span>
            <span aria-hidden="true" className="text-[11px] text-muted-foreground">{hourLabel.format(new Date(hour.at))}</span>
            <HourIcon aria-hidden="true" className="size-4.5 text-foreground/80" />
            <span aria-hidden="true" className="text-sm font-semibold tabular-nums">{hour.tempF}°</span>
            {/* The chance of rain as a small bar under the hour. */}
            <span aria-hidden="true" className="relative h-1 w-8 overflow-hidden rounded-full bg-foreground/10"><span className="absolute inset-y-0 left-0 rounded-full bg-sky-500" style={{ width: `${hour.rainChance}%` }} /></span>
            <span aria-hidden="true" className={cn('text-[10px] tabular-nums', hour.rainChance >= 40 ? 'font-semibold text-sky-700 dark:text-sky-300' : 'text-muted-foreground')}>{hour.rainChance}%</span>
          </li>;
        })}
      </ol>
    </div>}
    {result.flags.length > 0 && <ul className="space-y-1.5 text-sm">
      {result.flags.map((flag) => <li key={flag} className="flex items-start gap-2"><span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-amber-500" />{t(`flags.${flag}`, { time: result.sunset ? formatTime(result.sunset) : '' })}</li>)}
    </ul>}
    <Alerts alerts={result.alerts} />
    <p className="text-[11px] text-muted-foreground">{t(result.source === 'nws' ? 'source' : 'sample')}</p>
  </section>;
}

function Alerts({ alerts }: { alerts: { event: string; severity: string; ends?: string }[] }) {
  const t = useTranslations('taskMap.weather');
  const { formatDateTime } = useFormat();
  if (alerts.length === 0) return null;
  return <div role="note" aria-label={t('alerts')} className="space-y-1 rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-2.5 text-sm">
    {alerts.map((alert) => <p key={alert.event} className="flex items-start gap-2">
      <TriangleAlert aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', alert.severity === 'extreme' || alert.severity === 'severe' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')} />
      {/* The service's own name for the alert (in English): what to search for. */}
      <span><span lang="en" className="font-semibold">{alert.event}</span>{alert.ends && <> · {t('until', { time: formatDateTime(alert.ends) })}</>}</span>
    </p>)}
  </div>;
}
