'use client';

import { use } from 'react';
import { Building2, CalendarDays, ClipboardList, Fuel, GraduationCap, Hammer, HandHeart, Hospital, House, Library, Monitor, Recycle, School, ShoppingBag, ShoppingCart, Sprout, SquareParking, Trees, Truck, Warehouse, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { NearbyTaskPin, PlaceKind, TaskPlace, TaskSurroundings } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

export const PLACE_ICONS: Readonly<Record<PlaceKind, LucideIcon>> = {
  hardware: Hammer,
  garden: Sprout,
  'truck-rental': Truck,
  storage: Warehouse,
  recycling: Recycle,
  donation: HandHeart,
  supermarket: ShoppingCart,
  electronics: Monitor,
  fuel: Fuel,
  park: Trees,
  school: School,
  university: GraduationCap,
  hospital: Hospital,
  library: Library,
  mall: ShoppingBag,
};

/** "Hardware store: Sample Hardware, 1.3 mi" (a map marker's name, a row's words for a screen reader). */
export function usePlaceName(): (place: TaskPlace) => string {
  const t = useTranslations('taskMap.around');
  return (place) => t('place', { kind: t(`kinds.${place.kind}`), name: place.name || t(`kinds.${place.kind}`), miles: place.miles });
}

/**
 * What's around the task's area (task-map-panel.tsx): named landmarks that say where it is, the stores this kind of
 * work may need, what the homes are and the parking, from OpenStreetMap; measured from the area, never the address.
 */
export function TaskMapAround({ surroundings, headingId }: { surroundings: Promise<TaskSurroundings>; headingId: string }) {
  const result = use(surroundings);
  const t = useTranslations('taskMap.around');
  if (result.status !== 'found') return <section aria-labelledby={headingId} className="space-y-1"><h3 id={headingId} className="text-sm font-semibold">{t('title')}</h3><p className="text-sm text-muted-foreground">{t('unavailable')}</p></section>;
  const row = (place: TaskPlace) => {
    const Icon = PLACE_ICONS[place.kind];
    return <li key={place.id} className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-foreground/75"><Icon aria-hidden="true" className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{place.name || t(`kinds.${place.kind}`)}</span>
        <span className="block text-xs text-muted-foreground">{t(`kinds.${place.kind}`)}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t('miles', { miles: place.miles })}</span>
    </li>;
  };
  return <section aria-labelledby={headingId} className="space-y-3">
    <h3 id={headingId} className="text-sm font-semibold">{t('title')}</h3>
    <ul className="flex flex-wrap gap-1.5 text-[13px]">
      {result.homes && <li className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1">{result.homes === 'apartments' ? <Building2 aria-hidden="true" className="size-3.5" /> : <House aria-hidden="true" className="size-3.5" />}{t(`homes.${result.homes}`)}</li>}
      <li className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1"><SquareParking aria-hidden="true" className="size-3.5" />{t('parking', { count: result.parkingLots })}</li>
    </ul>
    {result.landmarks.length > 0 && <div className="space-y-1.5">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('landmarks')}</h4>
      <ul className="space-y-2">{result.landmarks.map(row)}</ul>
    </div>}
    {result.helpful.length > 0 && <div className="space-y-1.5">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('forJob')}</h4>
      <ul className="space-y-2">{result.helpful.map(row)}</ul>
    </div>}
    <p className="text-[11px] text-muted-foreground">{t(result.source === 'osm' ? 'source' : 'sample')}</p>
  </section>;
}

/** Open tasks near this one, for a helper planning a trip (two tasks, one drive). */
export function TaskMapNearbyTasks({ tasks, headingId }: { tasks: NearbyTaskPin[]; headingId: string }) {
  const t = useTranslations('taskMap.nearby');
  const { formatDate } = useFormat();
  if (tasks.length === 0) return null;
  return <section aria-labelledby={headingId} className="space-y-2">
    <div>
      <h3 id={headingId} className="text-sm font-semibold">{t('title', { count: tasks.length })}</h3>
      <p className="text-xs text-muted-foreground">{t('body')}</p>
    </div>
    <ul className="divide-y divide-foreground/[0.06] rounded-2xl border border-foreground/[0.07] dark:divide-white/[0.06] dark:border-white/[0.06]">
      {tasks.slice(0, 3).map((task) => <li key={task.id}>
        <Link href={task.href} className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
          <ClipboardList aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{task.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular-nums">
              <span>{task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : t('hourly', { rate: formatMoney(task.budget.rateCents) })}</span>
              <span>{t('away', { miles: task.miles })}</span>
              <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-3" />{task.sameDay ? t('sameDay') : formatDate(task.windowStart)}</span>
            </span>
          </span>
        </Link>
      </li>)}
    </ul>
  </section>;
}
