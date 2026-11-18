'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Lock, MapPinned, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type DashboardData, type DashboardItem } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { AreaMap, type AreaMapPlace } from '@/ui/components/map/area-map';
import { DashboardRows, moneyWords, useItemFacts } from './dashboard-item';
import { dashboardBase } from './links';

/** The item picked on the map, under it: its title (the link), when and where, and the money. */
function Picked({ item, onClose }: { item: DashboardItem; onClose: () => void }) {
  const t = useTranslations('home.map');
  const facts = useItemFacts(item);
  return <div className="relative rounded-[1.375rem] border bg-card p-3 pr-12 shadow-card">
    <p className="font-semibold [overflow-wrap:anywhere]"><Link href={facts.href} className="underline-offset-4 hover:text-primary hover:underline">{item.title}</Link></p>
    <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{facts.day} · {facts.time} · {facts.area}{facts.money ? ` · ${facts.money.amount}` : ''}</p>
    <button type="button" onClick={onClose} aria-label={t('close')} className="absolute top-1.5 right-1.5 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X aria-hidden="true" className="size-4" /></button>
  </div>;
}

/**
 * The map view: the list beside a map of the items' general areas (never an address). Pointing at a row lights its
 * area and the other way round; tapping an area shows its item under the map. Phones get the map first, then the
 * list. Remote items are counted under the map. `live` false (previews, tests): the drawn map only.
 */
export function DashboardMapView({ data, live = true }: { data: DashboardData; live?: boolean }) {
  const t = useTranslations('home.map');
  const item = useTranslations('home.item');
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { items, map } = data;
  const places: AreaMapPlace[] = useMemo(() => items.flatMap((entry) => {
    if (entry.location.kind !== 'local') return [];
    const money = moneyWords(entry.money, item);
    return [{ id: entry.key, point: entry.location.publicPoint, radiusMeters: entry.location.radiusMeters, label: money?.amount ?? '', name: t('place', { title: entry.title, money: money?.amount ?? '', area: entry.location.areaName }) }];
  }), [items, item, t]);
  const remote = items.length - places.length;
  const picked = selected ? items.find((entry) => entry.key === selected) : undefined;

  if (places.length === 0) {
    return <EmptyState headingLevel={3} title={t('empty.title')} body={t('empty.body')} icon={<MapPinned />} action={{ label: t('empty.action'), href: routes.app.home({ ...dashboardBase(data.query), view: 'list' }) }} />;
  }

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
    <div className="order-2 min-w-0 lg:order-1">
      <DashboardRows items={items} activeKey={active ?? selected} onActiveChange={setActive} />
    </div>
    <div className="order-1 min-w-0 space-y-2 lg:sticky lg:top-[calc(var(--app-header-offset,4.25rem)+1rem)] lg:order-2">
      <AreaMap
        styleUrl={map.styleUrl}
        attribution={map.attribution}
        places={places}
        serviceArea={map.serviceArea ? { center: map.serviceArea.center, radiusMiles: map.serviceArea.radiusMiles } : undefined}
        fallbackCenter={map.center}
        activeId={active ?? selected}
        onActiveChange={setActive}
        onSelect={setSelected}
        label={t('label')}
        groupLabel={(count) => t('group', { count })}
        live={live}
        className="h-[52vh] min-h-72 rounded-[1.375rem] lg:h-[min(36rem,calc(100dvh-var(--app-header-offset,4.25rem)-6rem))]"
      />
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Lock aria-hidden="true" className="mt-px size-3.5 shrink-0" />{t('privacy')}{remote > 0 ? ` ${t('remote', { count: remote })}` : ''}</p>
      {picked && <Picked item={picked} onClose={() => setSelected(null)} />}
    </div>
  </div>;
}
